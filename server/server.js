import { WebSocketServer } from 'ws';
import * as utils from 'y-websocket/bin/utils';
import * as awarenessProtocol from 'y-protocols/awareness';
import http from 'http';
import url from 'url';

const port = process.env.PORT || 1234;
const host = process.env.HOST || '0.0.0.0';

// Room Metadata Store: Map<roomName, { ownerToken: string, blocklist: Set<string> }>
const roomMetadata = new Map();

// Helper to parse JSON body
const getJsonBody = (req) => {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk.toString());
    req.on('end', () => {
      try {
        resolve(JSON.parse(body || '{}'));
      } catch (e) {
        reject(e);
      }
    });
  });
};

const server = http.createServer(async (req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = parsedUrl.pathname;

  // Active Rooms API endpoint
  if (pathname === '/api/rooms' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    const activeRooms = Array.from(utils.docs.keys()).map(name => ({
      name,
      hasPassword: !!(roomMetadata.get(name)?.password),
    }));
    res.end(JSON.stringify(activeRooms));
    return;
  }

  // GET /api/rooms/:roomName/info — check if room has a password
  const infoMatch = pathname.match(/^\/api\/rooms\/([^/]+)\/info$/);
  if (infoMatch && req.method === 'GET') {
    const roomName = infoMatch[1];
    const meta = roomMetadata.get(roomName);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ hasPassword: !!(meta?.password) }));
    return;
  }

  // POST /api/rooms/:roomName/verify-password — verify room password before joining
  const verifyMatch = pathname.match(/^\/api\/rooms\/([^/]+)\/verify-password$/);
  if (verifyMatch && req.method === 'POST') {
    const roomName = verifyMatch[1];
    const meta = roomMetadata.get(roomName);
    const body = await getJsonBody(req).catch(() => ({}));
    const password = body.password || '';

    res.writeHead(200, { 'Content-Type': 'application/json' });
    if (!meta || !meta.password) {
      return res.end(JSON.stringify({ valid: true }));
    }
    if (meta.password === password) {
      return res.end(JSON.stringify({ valid: true }));
    } else {
      return res.end(JSON.stringify({ valid: false, error: 'Incorrect password' }));
    }
  }

  // GET /api/rooms/:roomName/owner?token=...
  const ownerMatch = pathname.match(/^\/api\/rooms\/([^/]+)\/owner$/);
  if (ownerMatch && req.method === 'GET') {
    const roomName = ownerMatch[1];
    const token = parsedUrl.searchParams.get('token');
    const meta = roomMetadata.get(roomName);
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      isOwner: meta ? meta.ownerToken === token : false,
      debugOwnerToken: meta ? meta.ownerToken : null,
      yourToken: token
    }));
    return;
  }

  // DELETE /api/rooms (Clear all rooms - admin/debug only)
  if (pathname === '/api/rooms' && req.method === 'DELETE') {
    Array.from(utils.docs.keys()).forEach(roomName => {
      const doc = utils.docs.get(roomName);
      if (doc) {
        doc.conns.forEach((_, conn) => {
          conn.close(4004, 'All rooms cleared by admin');
        });
        utils.docs.delete(roomName);
      }
    });
    roomMetadata.clear();
    res.writeHead(200);
    res.end();
    return;
  }

  // POST /api/rooms/:roomName/kick
  const kickMatch = pathname.match(/^\/api\/rooms\/([^/]+)\/kick$/);
  if (kickMatch && req.method === 'POST') {
    const roomName = kickMatch[1];
    const authHeader = req.headers.authorization || '';
    const ownerToken = authHeader.replace('Bearer ', '');
    
    const meta = roomMetadata.get(roomName);
    if (!meta || meta.ownerToken !== ownerToken) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Unauthorized' }));
    }

    try {
      const body = await getJsonBody(req);
      const targetToken = body.targetToken;
      if (!targetToken) throw new Error('Missing targetToken');

      meta.blocklist.add(targetToken);

      // Forcefully disconnect the kicked user
      const doc = utils.docs.get(roomName);
      if (doc && doc.conns) {
        for (const conn of doc.conns.keys()) {
          if (conn.userToken === targetToken) {
            conn.close(4003, 'Kicked by owner');
          }
        }
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: true }));
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Bad Request' }));
    }
  }

  // DELETE /api/rooms/:roomName
  const deleteMatch = pathname.match(/^\/api\/rooms\/([^/]+)$/);
  if (deleteMatch && req.method === 'DELETE') {
    const roomName = deleteMatch[1];
    const authHeader = req.headers.authorization || '';
    const ownerToken = authHeader.replace('Bearer ', '');
    
    const meta = roomMetadata.get(roomName);
    if (!meta || meta.ownerToken !== ownerToken) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Unauthorized' }));
    }

    // Forcefully disconnect everyone
    const doc = utils.docs.get(roomName);
    if (doc && doc.conns) {
      for (const conn of doc.conns.keys()) {
        conn.close(4004, 'Room deleted by owner');
      }
    }
    
    // Clear state
    utils.docs.delete(roomName);
    roomMetadata.delete(roomName);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ success: true }));
  }

  // Default Health Check
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Yjs WebSocket Synchronization Server is Active\n');
});

const wss = new WebSocketServer({ server });

wss.on('connection', (conn, req) => {
  // URL format expected: ws://host:port/roomName?token=...
  const reqUrl = new URL(req.url, `ws://${req.headers.host}`);
  const roomName = reqUrl.pathname.slice(1);
  const token = reqUrl.searchParams.get('token');

  conn.userToken = token;

  let meta = roomMetadata.get(roomName);
  
  if (meta && meta.blocklist.has(token)) {
    conn.close(4003, 'You are blocked from this room');
    return;
  }

  // First person to join becomes the owner
  if (!meta) {
    const password = reqUrl.searchParams.get('password') || '';
    meta = { ownerToken: token, blocklist: new Set(), password: password || '' };
    roomMetadata.set(roomName, meta);
    console.log(`[WS] Creating new room: ${roomName}, password=${password ? 'YES' : 'NO'}`);
  } else {
    // Validate password for existing rooms (owner is inherently authorized)
    if (meta.password && meta.ownerToken !== token) {
      const providedPassword = reqUrl.searchParams.get('password') || '';
      if (providedPassword !== meta.password) {
        conn.close(4005, 'Wrong password');
        console.log(`[WS] Wrong password for room: ${roomName}`);
        return;
      }
    }
  }

  // Purge any stale connections or lingering ghost awareness states for this token
  if (token) {
    const doc = utils.getYDoc(roomName);
    if (doc) {
      if (doc.conns) {
        for (const oldConn of Array.from(doc.conns.keys())) {
          if (oldConn !== conn && oldConn.userToken === token) {
            const controlledIds = doc.conns.get(oldConn);
            if (controlledIds && controlledIds.size > 0) {
              awarenessProtocol.removeAwarenessStates(doc.awareness, Array.from(controlledIds), null);
            }
            oldConn.close(4001, 'Replaced by new connection');
          }
        }
      }
      if (doc.awareness) {
        const staleIds = [];
        doc.awareness.getStates().forEach((state, cid) => {
          if (state.user?.token === token) {
            staleIds.push(cid);
          }
        });
        if (staleIds.length > 0) {
          awarenessProtocol.removeAwarenessStates(doc.awareness, staleIds, null);
        }
      }
    }
  }

  // Passing docName manually because we modified the URL search params 
  utils.setupWSConnection(conn, req, { docName: roomName });

  // Clean up awareness on disconnect
  conn.on('close', () => {
    if (token) {
      const doc = utils.docs.get(roomName);
      if (doc && doc.awareness) {
        const staleIds = [];
        doc.awareness.getStates().forEach((state, cid) => {
          if (state.user?.token === token) {
            staleIds.push(cid);
          }
        });
        if (staleIds.length > 0) {
          awarenessProtocol.removeAwarenessStates(doc.awareness, staleIds, null);
        }
      }
    }
  });
});

server.listen(port, host, () => {
  console.log(`🚀 Yjs WebSocket CRDT Server listening on ws://${host}:${port}`);
  console.log(`✅ Health check available at http://${host}:${port}`);
});
