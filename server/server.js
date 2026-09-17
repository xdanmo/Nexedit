import { WebSocketServer } from 'ws';
import * as utils from 'y-websocket/bin/utils';
import http from 'http';

const port = process.env.PORT || 1234;
const host = process.env.HOST || '0.0.0.0';

// Instantiate a basic HTTP server to accept initial requests and serve the rooms API
const server = http.createServer((req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // Active Rooms API endpoint
  if (req.url === '/api/rooms' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    // utils.docs is a Map of all active rooms
    const activeRooms = Array.from(utils.docs.keys());
    res.end(JSON.stringify(activeRooms));
    return;
  }

  // Default Health Check
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Yjs WebSocket Synchronization Server is Active\n');
});

// Bind the WebSocket server to the HTTP server instance
const wss = new WebSocketServer({ server });

// Delegate all incoming WebSocket connections to the Yjs utility
wss.on('connection', (conn, req) => {
  utils.setupWSConnection(conn, req);
});

server.listen(port, host, () => {
  console.log(`🚀 Yjs WebSocket CRDT Server listening on ws://${host}:${port}`);
  console.log(`✅ Health check available at http://${host}:${port}`);
});
