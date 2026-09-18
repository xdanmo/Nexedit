import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCursor from '@tiptap/extension-collaboration-cursor';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { IndexeddbPersistence } from 'y-indexeddb';
import { removeAwarenessStates } from 'y-protocols/awareness';
import {
  FileText,
  Bold,
  Italic,
  Strikethrough,
  Code,
  Heading1,
  Heading2,
  List,
  ListOrdered,
  Undo,
  Redo,
  Wifi,
  WifiOff,
  Users,
  HardDriveDownload,
  AlertTriangle,
  PanelLeft,
  PanelLeftClose,
  Plus,
  Trash2,
  Edit2,
  Check,
  BookOpen,
  LogOut,
  Download,
  FileDown,
  FileType,
  Lock,
  ChevronDown,
} from 'lucide-react';
import './styles.css';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const WS_URL = `ws://${window.location.hostname}:1234`;

const COLLABORATOR_COLORS = [
  '#034F46', '#FFA946', '#2D62FF', '#7c3aed',
  '#114E0B', '#7F1C34', '#0891b2', '#d97706',
];

const DEFAULT_DOCUMENTS = [
  {
    id: 'doc-default',
    title: 'Collaborative Project Charter',
    room: 'hackathon-document',
    createdAt: Date.now(),
  },
  {
    id: 'doc-architecture',
    title: 'Distributed Systems & CRDT Architecture',
    room: 'hackathon-architecture',
    createdAt: Date.now() - 3600000,
  },
];

// ---------------------------------------------------------------------------
// Toolbar Button (DRY helper — eliminates 150+ lines of repetition)
// ---------------------------------------------------------------------------

function ToolbarButton({ editor, action, actionArgs, isActive, icon: Icon, title, disabled }) {
  const isAvailable = editor && !editor.isDestroyed;
  return (
    <button
      type="button"
      onClick={() => {
        if (!isAvailable) return;
        actionArgs ? editor.chain().focus()[action](actionArgs).run() : editor.chain().focus()[action]().run();
      }}
      disabled={disabled ?? !isAvailable}
      className={`p-2 rounded-lg text-sm font-medium transition-colors ${
        isActive
          ? 'bg-[#034F46] text-[#FFFFEB] shadow-xs'
          : 'text-[#1A1A1A] hover:bg-[#E4E4D0]/70'
      } disabled:opacity-30 disabled:hover:bg-transparent`}
      title={title}
    >
      <Icon className="w-4 h-4" />
    </button>
  );
}

function ToolbarDivider() {
  return <div className="w-px h-5 bg-[#1A1A1A]/10 mx-1 shrink-0" />;
}

function SidebarDocItem({ docId, isActive, isOwner, canDelete, onSelect, onDelete, ydoc }) {
  const [title, setTitle] = useState('Untitled Document');

  useEffect(() => {
    if (!ydoc) return;
    const meta = ydoc.getMap(`meta_${docId}`);
    const updateTitle = () => setTitle(meta.get('title') || 'Untitled Document');
    meta.observe(updateTitle);
    updateTitle();
    return () => meta.unobserve(updateTitle);
  }, [ydoc, docId]);

  return (
    <div className="group relative flex items-center mb-1">
      <button 
        onClick={onSelect}
        type="button"
        className={`flex-1 text-left px-3 py-2 text-sm rounded-lg truncate transition-colors flex items-center justify-between ${
          isActive ? 'bg-[#034F46] text-[#FFFFEB] font-medium shadow-subtle' : 'text-ink-dark hover:bg-[#F0D7FF]/40'
        }`}
      >
        <span className="truncate pr-6">{title}</span>
      </button>
      {isOwner && canDelete && (
        <button
          onClick={(e) => onDelete(docId, e)}
          type="button"
          className={`absolute right-2 p-1.5 rounded-md transition-all ${
            isActive 
              ? 'text-[#FFFFEB]/70 hover:text-white hover:bg-white/20' 
              : 'text-[#7F1C34]/70 hover:text-[#7F1C34] hover:bg-rose-100/70'
          }`}
          title={`Delete "${title}"`}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PageSheet — Individual A4 page with its own TipTap collaboration fragment
// ---------------------------------------------------------------------------

function PageSheet({
  activeDocId,
  pageId,
  pageIndex,
  totalPages,
  ydoc,
  provider,
  currentUser,
  networkStatus,
  onFocus,
  onDelete,
  canDelete,
  onRegisterEditor,
  onUnregisterEditor,
}) {
  const fragmentField = `${activeDocId}_page_${pageId}`;

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ history: false }),
      Collaboration.configure({ document: ydoc, field: fragmentField }),
      CollaborationCursor.configure({ provider, user: currentUser }),
    ],
    editorProps: {
      attributes: {
        class:
          'focus:outline-none min-h-[720px] text-[#1A1A1A] font-body text-[16px] leading-[1.35] selection:bg-[#F0D7FF] selection:text-[#1A1A1A]',
      },
    },
    onFocus({ editor: ed }) {
      onFocus(ed);
    },
  });

  // Register this editor so the parent toolbar can control it, and unregister on unmount
  useEffect(() => {
    if (editor) {
      onRegisterEditor(pageId, editor);
      return () => {
        if (onUnregisterEditor) onUnregisterEditor(pageId, editor);
        if (!editor.isDestroyed) editor.destroy();
      };
    }
  }, [editor, pageId, onRegisterEditor, onUnregisterEditor]);

  return (
    <div
      className={`w-full max-w-[850px] min-h-[850px] bg-white rounded-card transition-all duration-300 ${
        networkStatus === 'disconnected'
          ? 'border-2 border-[#7F1C34]/40 shadow-[0_2px_12px_rgba(127,28,52,0.08)]'
          : 'border border-[#1A1A1A]/10 shadow-[0_2px_8px_rgba(26,26,15,0.05),0_12px_32px_rgba(26,26,15,0.06)]'
      } p-8 sm:p-14 md:p-16 relative mb-8 page-sheet-container print:shadow-none print:border-none print:rounded-none print:m-0 print:p-0 print:w-full print:max-w-none print:bg-white print:min-h-0`}
    >
      {/* Page Header Guide */}
      <div className="flex items-center justify-between border-b border-[#1A1A1A]/10 pb-3 mb-8 text-xs text-[#888888] select-none page-sheet-header print:mb-4 print:pb-2">
        <span className="font-mono uppercase tracking-wider text-[#666666] flex items-center gap-2">
          <span className="px-2.5 py-0.5 rounded-full bg-[#E4E4D0]/80 text-[#034F46] font-semibold text-[11px] print:bg-[#E4E4D0] print:text-[#034F46]">
            Page {pageIndex + 1} of {totalPages}
          </span>
        </span>

        <div className="flex items-center gap-3">
          {canDelete && (
            <button
              onClick={() => onDelete(pageId)}
              type="button"
              className="p-1 rounded-lg text-[#888888] hover:text-[#7F1C34] hover:bg-rose-50 transition-colors flex items-center gap-1 print:hidden"
              title={`Delete Page ${pageIndex + 1}`}
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span className="text-[10px] font-medium hidden sm:inline">Delete Page</span>
            </button>
          )}
        </div>
      </div>

      <EditorContent editor={editor} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// DocumentEditorWorkspace — CRDT lifecycle, toolbar, telemetry, canvas
// ---------------------------------------------------------------------------

function DocumentEditorWorkspace({
  roomName,
  roomPassword,
  onLeave,
}) {
  const [activePassword, setActivePassword] = useState(roomPassword || '');
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState('');

  useEffect(() => {
    setActivePassword(roomPassword || '');
  }, [roomPassword]);

  // ── UI State ──────────────────────────────────────────────────────────
  const [networkStatus, setNetworkStatus] = useState('connecting');
  const [indexedDbSynced, setIndexedDbSynced] = useState(false);
  const [collaborators, setCollaborators] = useState([]);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  
  const [workspaceDocs, setWorkspaceDocs] = useState([]);
  const [activeDocId, setActiveDocId] = useState(null);
  
  // Real-time title
  const [documentTitle, setDocumentTitle] = useState('Untitled Document');
  const [titleDraft, setTitleDraft] = useState('');
  
  const [activeEditor, setActiveEditor] = useState(null);
  const [editorsMap, setEditorsMap] = useState({});
  const [, setToolbarTick] = useState(0);
  const [pageIds, setPageIds] = useState([]);
  const scrollContainerRef = useRef(null);

  // ── Toast Notifications & Presence Tracking ─────────────────────────
  const [toasts, setToasts] = useState([]);
  const lastSeenMapRef = useRef(new Map()); // Map<userName, timestamp> using local Date.now()
  const peerStatusRef = useRef(new Map()); // Map<userName, 'online' | 'offline'>
  const lastToastTimeRef = useRef(new Map()); // Map<userName, timestamp> for 10s toast cooldown

  const addToast = useCallback((message, type = 'info') => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev.slice(-4), { id, message, type, exiting: false }]);
    setTimeout(() => {
      setToasts(prev => prev.map(t => t.id === id ? { ...t, exiting: true } : t));
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, 300);
    }, 4000);
  }, []);

  // ── Export Dropdown ───────────────────────────────────────────────────
  const [showExportDropdown, setShowExportDropdown] = useState(false);
  const exportDropdownRef = useRef(null);

  // ── Stable user identity for presence ─────────────────────────────────
  const [currentUser, setCurrentUser] = useState(() => {
    const generateToken = () => Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    try {
      const stored = localStorage.getItem('nexedit_user');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (!parsed.token) {
          parsed.token = generateToken();
          localStorage.setItem('nexedit_user', JSON.stringify(parsed));
        }
        return parsed;
      }
    } catch (e) { /* ignore */ }
    
    const color = COLLABORATOR_COLORS[Math.floor(Math.random() * COLLABORATOR_COLORS.length)];
    const id = Math.floor(Math.random() * 1000);
    const token = generateToken();
    const newUser = { name: `Engineer ${id}`, color, token };
    try {
      localStorage.setItem('nexedit_user', JSON.stringify(newUser));
    } catch (e) { /* ignore */ }
    return newUser;
  });

  const currentUserRef = useRef(currentUser);
  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  const [isOwner, setIsOwner] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  useEffect(() => {
    if (networkStatus !== 'connected') {
      setIsOwner(false);
      return;
    }
    
    // Add a tiny delay to ensure the WebSocket connection has fully initialized on the server
    const timer = setTimeout(() => {
      fetch(`http://${window.location.hostname}:1234/api/rooms/${roomName}/owner?token=${currentUser.token}`)
        .then(r => r.json())
        .then(d => setIsOwner(d.isOwner))
        .catch(console.error);
    }, 200);
    
    return () => clearTimeout(timer);
  }, [roomName, currentUser.token, networkStatus]);

  // ── Heartbeat & Offline Cursor Monitor ────────────────────────────────
  useEffect(() => {
    // Emit heartbeat every 3 seconds
    const heartbeatInterval = setInterval(() => {
      const ws = providerRef.current;
      if (ws?.awareness) {
        ws.awareness.setLocalStateField('heartbeat', Date.now());
      }
    }, 3000);

    // Check for offline cursors every 1.5 seconds
    const monitorInterval = setInterval(() => {
      const ws = providerRef.current;
      if (!ws?.awareness) return;
      if (networkStatus !== 'connected') return;

      const now = Date.now();
      const OFFLINE_TIMEOUT = 15000; // 15 seconds of silence on our local clock

      // Check all tracked remote peers
      lastSeenMapRef.current.forEach((lastSeen, userName) => {
        const currentStatus = peerStatusRef.current.get(userName);
        const timeSinceLastSeen = now - lastSeen;

        // Mark offline after 15 seconds of silence
        if (timeSinceLastSeen > OFFLINE_TIMEOUT && currentStatus === 'online') {
          peerStatusRef.current.set(userName, 'offline');
          const lastToast = lastToastTimeRef.current.get(userName) || 0;
          if (now - lastToast > 10000) {
            lastToastTimeRef.current.set(userName, now);
            addToast(`${userName} went offline`, 'warning');
          }
        }

        // Clean up peers silent for > 2 minutes
        if (timeSinceLastSeen > 120000) {
          lastSeenMapRef.current.delete(userName);
          peerStatusRef.current.delete(userName);
          lastToastTimeRef.current.delete(userName);
        }
      });

      // Update DOM cursor labels & fading based on peerStatusRef
      const labels = document.querySelectorAll('.collaboration-cursor__label');
      if (labels.length === 0) return;

      labels.forEach(label => {
        const text = label.textContent || '';
        const baseName = text.replace(' (Offline)', '').trim();
        const status = peerStatusRef.current.get(baseName);

        if (status === 'offline') {
          if (!text.endsWith('(Offline)')) {
            label.textContent = `${baseName} (Offline)`;
          }
          if (label.parentElement) {
            label.parentElement.style.opacity = '0.4';
            label.parentElement.style.filter = 'grayscale(100%)';
          }
        } else if (status === 'online') {
          if (text.endsWith('(Offline)')) {
            label.textContent = baseName;
          }
          if (label.parentElement) {
            label.parentElement.style.opacity = '1';
            label.parentElement.style.filter = 'none';
          }
        }
      });
    }, 1500);

    return () => {
      clearInterval(heartbeatInterval);
      clearInterval(monitorInterval);
    };
  }, [addToast, networkStatus]);

  // ── Broadcast cursor location via awareness ───────────────────────────
  useEffect(() => {
    if (!activeEditor) return;
    const ws = providerRef.current;
    if (!ws?.awareness) return;

    const updateLocation = () => {
      if (!activeEditor || activeEditor.isDestroyed) return;
      const { from } = activeEditor.state.selection;
      const resolvedPos = activeEditor.state.doc.resolve(from);
      // Count the line number (paragraph index in doc)
      let lineNum = 0;
      activeEditor.state.doc.nodesBetween(0, from, (node) => {
        if (node.isBlock) lineNum++;
      });

      const activePageId = Object.keys(editorsMap).find(id => editorsMap[id] === activeEditor);
      const currentPageIndex = activePageId ? pageIds.indexOf(activePageId) + 1 : 1;

      ws.awareness.setLocalStateField('location', {
        docTitle: documentTitle || 'Untitled Document',
        pageIndex: currentPageIndex > 0 ? currentPageIndex : 1,
        line: lineNum,
      });
    };

    activeEditor.on('selectionUpdate', updateLocation);
    updateLocation();
    return () => activeEditor.off('selectionUpdate', updateLocation);
  }, [activeEditor, documentTitle, pageIds, editorsMap]);

  // ── Close export dropdown on outside click ─────────────────────────────
  useEffect(() => {
    if (!showExportDropdown) return;
    const handleClickOutside = (e) => {
      if (exportDropdownRef.current && !exportDropdownRef.current.contains(e.target)) {
        setShowExportDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showExportDropdown]);

  const handleDeleteRoom = async () => {
    if (!window.confirm("Are you sure you want to permanently delete this room for everyone?")) return;
    try {
      await fetch(`http://${window.location.hostname}:1234/api/rooms/${roomName}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${currentUser.token}` }
      });
    } catch (e) { console.error(e); }
  };

  // Update presence awareness when user changes their name
  useEffect(() => {
    try {
      localStorage.setItem('nexedit_user', JSON.stringify(currentUser));
    } catch (e) { /* ignore */ }
    
    if (providerRef.current?.awareness) {
      providerRef.current.awareness.setLocalStateField('user', currentUser);
    }
  }, [currentUser]);

  // ── CRDT Infrastructure (useRef to survive StrictMode) ────────────────
  const ydocRef = useRef(null);
  const providerRef = useRef(null);
  const idbRef = useRef(null);

  // Single unified lifecycle effect for Y.Doc, WebSocketProvider, IndexedDB
  useEffect(() => {
    const doc = new Y.Doc();
    const ws = new WebsocketProvider(WS_URL, roomName, doc, { 
      connect: true,
      params: { token: currentUser.token, password: activePassword || '' }
    });
    const idb = new IndexeddbPersistence(roomName, doc);

    ydocRef.current = doc;
    providerRef.current = ws;
    idbRef.current = idb;

    // ─ Workspace tracking ─
    const yworkspace = doc.getArray('workspace');
    const syncWorkspace = () => {
      const arr = yworkspace.toArray();
      if (arr.length === 0) {
        // If websocket is connecting/connected but not yet synced with server, wait for sync to avoid race conditions
        if (ws.wsconnected && !ws.synced) {
          return;
        }
        // Deterministic initial document ID so all joining clients land in the EXACT same document!
        const docId = 'doc-default';
        doc.transact(() => {
          if (!doc.getMap(`meta_${docId}`).get('title')) {
            doc.getMap(`meta_${docId}`).set('title', 'Untitled Document');
            doc.getMap(`meta_${docId}`).set('createdAt', Date.now());
          }
          const ypages = doc.getArray(`pages_${docId}`);
          if (ypages.length === 0) {
            ypages.push(['p1']);
          }
          const currentDocs = yworkspace.toArray();
          if (!currentDocs.includes(docId)) {
            yworkspace.push([docId]);
          }
        });
        setWorkspaceDocs([docId]);
        setActiveDocId(docId);
      } else {
        const unique = Array.from(new Set(arr));
        setWorkspaceDocs(unique);
        // If the active document was deleted by admin, automatically transition to remaining document
        setActiveDocId((current) => {
          if (current && !unique.includes(current)) {
            addToast('The active document was deleted by the admin', 'warning');
            return unique[0];
          }
          return current || unique[0];
        });
      }
    };
    yworkspace.observe(syncWorkspace);

    // ─ Network status (reactive — drives all UI) ─
    const handleClose = (event) => {
      if (event.code === 4003) {
        alert("You have been kicked from this room by the owner.");
        onLeave();
      } else if (event.code === 4004) {
        alert("The owner has securely deleted this room.");
        idb.clearData();
        onLeave();
      } else if (event.code === 4005) {
        ws.disconnect();
        setPasswordModalOpen(true);
        setPasswordError('Password required or incorrect. Please try again.');
      }
    };

    const onStatus = (event) => {
      setNetworkStatus(event.status);
      if (ws.ws) {
        ws.ws.removeEventListener('close', handleClose);
        ws.ws.addEventListener('close', handleClose);
      }
    };
    ws.on('status', onStatus);

    // ─ WS Sync listener to ensure server state is cleanly absorbed ─
    const onWsSync = (isSynced) => {
      if (isSynced) {
        syncWorkspace();
      }
    };
    ws.on('sync', onWsSync);

    // ─ IndexedDB sync ─
    const onIdbSync = () => {
      setIndexedDbSynced(true);
      syncWorkspace(); // Run sync after data is loaded
    };
    idb.on('synced', onIdbSync);

    // ─ Presence / awareness ─
    const onAwarenessChange = () => {
      const states = ws.awareness.getStates();
      const uniquePeers = new Map();
      const now = Date.now();
      const ghostClientIds = [];
      const userTracker = new Map(); // identifier -> { clientId, clock, state }

      // 1. Detect and collect any ghost states matching OUR OWN token but with a different clientId
      states.forEach((state, clientId) => {
        if (!state.user) return;
        if (clientId !== ws.awareness.clientID && state.user.token === currentUserRef.current.token) {
          ghostClientIds.push(clientId);
        }
      });

      // 2. For remote users, ensure only the single newest connection per user is retained
      states.forEach((state, clientId) => {
        if (!state.user) return;
        if (clientId === ws.awareness.clientID || state.user.token === currentUserRef.current.token) return;

        const identifier = state.user.token || state.user.name;
        const clock = ws.awareness.meta.get(clientId)?.clock || 0;

        if (!userTracker.has(identifier)) {
          userTracker.set(identifier, { clientId, clock, state });
        } else {
          const existing = userTracker.get(identifier);
          if (clock > existing.clock) {
            ghostClientIds.push(existing.clientId);
            userTracker.set(identifier, { clientId, clock, state });
          } else {
            ghostClientIds.push(clientId);
          }
        }
      });

      // Purge all ghost client IDs immediately from awareness so TipTap drops the ghost cursor at 0
      if (ghostClientIds.length > 0) {
        removeAwarenessStates(ws.awareness, ghostClientIds, null);
      }

      // Build active collaborator list from the valid active users
      userTracker.forEach(({ clientId, state }) => {
        const userName = state.user.name || 'Anonymous';
        lastSeenMapRef.current.set(userName, now);

        const prevStatus = peerStatusRef.current.get(userName);
        if (prevStatus === 'offline') {
          peerStatusRef.current.set(userName, 'online');
          const lastToast = lastToastTimeRef.current.get(userName) || 0;
          if (now - lastToast > 10000) {
            lastToastTimeRef.current.set(userName, now);
            addToast(`${userName} is back online`, 'success');
          }
        } else if (!prevStatus) {
          peerStatusRef.current.set(userName, 'online');
        }

        uniquePeers.set(userName, {
          clientId,
          name: userName,
          color: state.user.color || '#034F46',
          token: state.user.token,
        });
      });

      setCollaborators(Array.from(uniquePeers.values()));
    };
    ws.awareness.on('change', onAwarenessChange);
    ws.awareness.setLocalStateField('user', currentUser);

    const handleBeforeUnload = () => {
      if (ws?.awareness) {
        ws.awareness.setLocalState(null);
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    // ─ Cleanup: destroy everything in reverse order ─
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      if (ws?.awareness) {
        ws.awareness.setLocalState(null);
      }
      yworkspace.unobserve(syncWorkspace);
      ws.off('status', onStatus);
      ws.off('sync', onWsSync);
      ws.awareness.off('change', onAwarenessChange);
      ws.destroy();
      idb.destroy();
      doc.destroy();
      ydocRef.current = null;
      providerRef.current = null;
      idbRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomName, activePassword]);

  const handleUnlockRoom = (e) => {
    e.preventDefault();
    if (!passwordInput.trim()) return;
    const pwd = passwordInput.trim();
    try {
      sessionStorage.setItem(`nexedit_pwd_${roomName}`, pwd);
    } catch (err) {}
    setActivePassword(pwd);
    setPasswordModalOpen(false);
    setPasswordError('');
  };

  // 2. Active Document State Synchronization
  useEffect(() => {
    const doc = ydocRef.current;
    if (!doc || !activeDocId) return;

    const metadata = doc.getMap(`meta_${activeDocId}`);
    const syncMetadata = () => {
      setDocumentTitle(metadata.get('title') || 'Untitled Document');
    };
    metadata.observe(syncMetadata);
    syncMetadata();

    const ypages = doc.getArray(`pages_${activeDocId}`);
    const syncPages = () => {
      const arr = ypages.toArray();
      if (arr.length === 0) {
        setPageIds(['p1']);
      } else {
        setPageIds(Array.from(new Set(arr)));
      }
    };
    ypages.observe(syncPages);
    syncPages();

    return () => {
      metadata.unobserve(syncMetadata);
      ypages.unobserve(syncPages);
    };
  }, [activeDocId]);

  // ── Toolbar re-render on active editor transactions ───────────────────
  useEffect(() => {
    if (!activeEditor) return;
    const onTx = () => setToolbarTick((t) => t + 1);
    activeEditor.on('transaction', onTx);
    return () => activeEditor.off('transaction', onTx);
  }, [activeEditor]);

  // ── Register page editor instances ────────────────────────────────────
  const handleRegisterEditor = useCallback((pageId, editorInstance) => {
    setEditorsMap((prev) => ({ ...prev, [pageId]: editorInstance }));
    setActiveEditor((current) => current || editorInstance);
  }, []);

  const handleUnregisterEditor = useCallback((pageId, unregisteringEditor) => {
    setEditorsMap((prev) => {
      if (!prev[pageId]) return prev;
      const next = { ...prev };
      delete next[pageId];
      return next;
    });
    setActiveEditor((current) => {
      if (!current || current === unregisteringEditor || current.isDestroyed) {
        return null;
      }
      return current;
    });
  }, []);

  // ── Network partition toggle (reactive — no manual state override) ────
  const handleToggleNetwork = useCallback(() => {
    const ws = providerRef.current;
    if (!ws) return;
    if (networkStatus === 'disconnected') {
      ws.connect();
    } else {
      if (ws.awareness) {
        ws.awareness.setLocalStateField('cursor', null);
        ws.awareness.setLocalState(null);
      }
      ws.disconnect();
    }
    // Status will update reactively via the 'status' event listener
  }, [networkStatus]);

  // ── Add new page sheet below ──────────────────────────────────────────
  const handleAddPageBelow = useCallback(() => {
    const doc = ydocRef.current;
    if (!doc || !activeDocId) return;
    const ypages = doc.getArray(`pages_${activeDocId}`);
    const newPageId = `p-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
    
    doc.transact(() => {
      if (ypages.length === 0) {
        ypages.push(['p1', newPageId]);
      } else {
        ypages.push([newPageId]);
      }
    });

    setTimeout(() => {
      scrollContainerRef.current?.scrollTo({
        top: scrollContainerRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }, 100);
  }, [activeDocId]);

  // ── Delete page sheet ─────────────────────────────────────────────────
  const handleDeletePage = useCallback((pageIdToDelete) => {
    const doc = ydocRef.current;
    if (!doc || !activeDocId) return;
    const ypages = doc.getArray(`pages_${activeDocId}`);
    
    // Ensure we don't delete the last remaining unique page
    const uniquePages = Array.from(new Set(ypages.toArray()));
    if (uniquePages.length <= 1) {
      addToast('Cannot delete the only page in the document', 'warning');
      return;
    }
    
    doc.transact(() => {
      let current = ypages.toArray();
      while (current.indexOf(pageIdToDelete) !== -1) {
        ypages.delete(current.indexOf(pageIdToDelete), 1);
        current = ypages.toArray();
      }
    });
    
    setEditorsMap((prev) => {
      const next = { ...prev };
      delete next[pageIdToDelete];
      return next;
    });
  }, [activeDocId, addToast]);

  // ── Save title ────────────────────────────────────────────────────────
  const handleSaveTitle = () => {
    if (ydocRef.current && activeDocId && titleDraft.trim()) {
      ydocRef.current.getMap(`meta_${activeDocId}`).set('title', titleDraft.trim());
    }
    setIsEditingTitle(false);
  };

  // ── Add new document ──────────────────────────────────────────────────
  const handleAddDocument = useCallback(() => {
    const doc = ydocRef.current;
    if (!doc) return;
    const yworkspace = doc.getArray('workspace');
    const newDocId = `doc-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
    
    doc.transact(() => {
      doc.getMap(`meta_${newDocId}`).set('title', 'Untitled Document');
      doc.getMap(`meta_${newDocId}`).set('createdAt', Date.now());
      doc.getArray(`pages_${newDocId}`).push(['p1']);
      yworkspace.push([newDocId]);
    });
    
    setActiveDocId(newDocId);
    addToast('New document created', 'success');
  }, [addToast]);

  // ── Delete document (Admin only) ──────────────────────────────────────
  const handleDeleteDocument = useCallback((docIdToDelete, e) => {
    if (e) e.stopPropagation();
    if (!isOwner) {
      addToast('Only the room admin can delete documents', 'warning');
      return;
    }
    const doc = ydocRef.current;
    if (!doc) return;
    const yworkspace = doc.getArray('workspace');
    const uniqueDocs = Array.from(new Set(yworkspace.toArray()));

    if (uniqueDocs.length <= 1) {
      addToast('Cannot delete the only document in the workspace', 'warning');
      return;
    }

    const docTitle = doc.getMap(`meta_${docIdToDelete}`).get('title') || 'Untitled Document';
    if (!confirm(`Are you sure you want to delete "${docTitle}"? This will delete it for all users.`)) {
      return;
    }

    doc.transact(() => {
      let arr = yworkspace.toArray();
      while (arr.indexOf(docIdToDelete) !== -1) {
        yworkspace.delete(arr.indexOf(docIdToDelete), 1);
        arr = yworkspace.toArray();
      }
      doc.getMap(`meta_${docIdToDelete}`).clear();
      const ypages = doc.getArray(`pages_${docIdToDelete}`);
      if (ypages.length > 0) {
        ypages.delete(0, ypages.length);
      }
    });

    addToast(`Deleted "${docTitle}"`, 'info');
  }, [isOwner, addToast]);

  // ── Derived values ────────────────────────────────────────────────────
  const currentEditor = (activeEditor && !activeEditor.isDestroyed)
    ? activeEditor
    : Object.values(editorsMap).find(ed => ed && !ed.isDestroyed) || null;
  const ydoc = ydocRef.current;
  const provider = providerRef.current;

  return (
    <div className="flex h-full w-full overflow-hidden font-body text-[#1A1A1A]">
      {/* Sidebar */}
      {isSidebarOpen && (
        <aside className="w-64 shrink-0 bg-[#FFFFEB]/95 backdrop-blur-md border-r border-[#1A1A1A]/10 flex flex-col z-40 print:hidden transition-all">
          <div className="p-4 border-b border-[#1A1A1A]/10 flex items-center justify-between">
            <h2 className="font-display font-medium text-ink-dark">Documents</h2>
            <button onClick={() => setIsSidebarOpen(false)} className="p-1 hover:bg-[#E4E4D0]/50 rounded-lg text-ink-muted hover:text-ink-dark transition-colors">
              <PanelLeftClose className="w-4 h-4" />
            </button>
          </div>
          <div className="p-3 flex-1 overflow-y-auto">
            <div className="text-xs font-semibold text-ink-muted mb-2 px-3 uppercase tracking-wider">Workspace</div>
            {workspaceDocs.map(docId => (
              <SidebarDocItem
                key={docId}
                docId={docId}
                isActive={docId === activeDocId}
                isOwner={isOwner}
                canDelete={workspaceDocs.length > 1}
                onSelect={() => setActiveDocId(docId)}
                onDelete={handleDeleteDocument}
                ydoc={ydoc}
              />
            ))}
          </div>
          <div className="p-4 border-t border-[#1A1A1A]/10">
            <button 
              onClick={handleAddDocument}
              className="w-full flex items-center justify-center gap-2 bg-[#F0D7FF] text-ink-dark font-medium py-2.5 rounded-xl hover:bg-[#F0D7FF]/80 transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4" />
              New Document
            </button>
          </div>
        </aside>
      )}

      {/* Main Canvas */}
      <div
        className={`flex-1 flex flex-col overflow-hidden transition-colors duration-300 print:h-auto print:overflow-visible print:bg-white print:p-0 print:m-0 ${
          networkStatus === 'disconnected' ? 'bg-[#F5F5DE]' : 'bg-[#FFFFEB]'
        }`}
      >
        {/* ═══════════════════════════════════════════════════════════════════
            LOCKED TOP SECTION (HEADER + TOOLBAR)
            ═══════════════════════════════════════════════════════════════════ */}
        <div className="shrink-0 relative z-40 bg-[#FFFFEB]/95 backdrop-blur-md border-b border-[#1A1A1A]/10 shadow-[0_1px_6px_rgba(26,26,15,0.03)] print:hidden">
          <header className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-3">
            {/* Left: Document Icon + Title */}
            <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
              {!isSidebarOpen && (
                <button 
                  onClick={() => setIsSidebarOpen(true)}
                  className="p-1.5 -ml-2 rounded-lg text-ink-muted hover:text-ink-dark hover:bg-[#E4E4D0]/50 transition-colors"
                  title="Open Sidebar"
                >
                  <PanelLeft className="w-5 h-5" />
                </button>
              )}
              <div className="w-9 h-9 rounded-xl bg-[#034F46] flex items-center justify-center text-[#FFFFEB] shadow-subtle shrink-0">
                <FileText className="w-4 h-4" />
              </div>

            <div className="min-w-0">
              {isEditingTitle ? (
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={titleDraft}
                    onChange={(e) => setTitleDraft(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSaveTitle()}
                    className="font-display text-base font-normal text-[#111111] bg-white border border-[#034F46] rounded-md px-2 py-0.5 focus:outline-none"
                    autoFocus
                  />
                  <button onClick={handleSaveTitle} type="button" className="p-1 rounded bg-[#034F46] text-[#FFFFEB]">
                    <Check className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 group">
                  <h1
                    onClick={() => { setTitleDraft(documentTitle); setIsEditingTitle(true); }}
                    className="font-display text-base sm:text-lg font-normal text-[#111111] tracking-[-0.02em] leading-none truncate cursor-pointer hover:underline"
                    title="Click to rename document"
                  >
                    {documentTitle}
                  </h1>
                  <button
                    onClick={() => { setTitleDraft(documentTitle); setIsEditingTitle(true); }}
                    type="button"
                    className="opacity-0 group-hover:opacity-100 text-[#888888] hover:text-[#111111] transition-opacity p-0.5"
                    title="Rename document"
                  >
                    <Edit2 className="w-3 h-3" />
                  </button>
                  {isOwner && workspaceDocs.length > 1 && (
                    <button
                      onClick={(e) => handleDeleteDocument(activeDocId, e)}
                      type="button"
                      className="p-1 rounded-md text-[#888888] hover:text-[#7F1C34] hover:bg-rose-50 transition-colors ml-1"
                      title="Delete this document"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              )}
              <p className="font-body text-xs text-[#666666] mt-0.5 flex items-center gap-1.5 truncate">
                <span>Room: <strong className="font-mono text-[#1A1A1A]">{roomName}</strong></span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  You:
                  <span
                    className="inline-block w-2 h-2 rounded-full border border-black/10"
                    style={{ backgroundColor: currentUser.color }}
                  />
                  <strong className="text-[#1A1A1A]">{currentUser.name}</strong>
                </span>
              </p>
            </div>
          </div>

          {/* Right: Telemetry & Controls */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {/* Active Peers */}
            <div
              className="hidden xl:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-[#1A1A1A]/10 text-xs font-medium text-[#1A1A1A] shadow-subtle"
              title="Active peers in room"
            >
              <Users className="w-3.5 h-3.5 text-[#034F46]" />
              <span>{collaborators.length} {collaborators.length === 1 ? 'User' : 'Users'}</span>
              <div className="flex items-center ml-1 gap-0.5">
                {collaborators.map((c) => {
                  // Get live location from awareness
                  const ws = providerRef.current;
                  let location = null;
                  if (ws?.awareness) {
                    const states = ws.awareness.getStates();
                    states.forEach((state) => {
                      if (state.user?.name === c.name && state.location) {
                        location = state.location;
                      }
                    });
                  }
                  
                  return (
                    <div key={c.clientId} className="peer-dot-wrapper group relative flex items-center">
                      <span
                        className="inline-block w-3.5 h-3.5 rounded-full ring-1 ring-white z-10 cursor-pointer"
                        style={{ backgroundColor: c.color }}
                      />
                      {/* Hover Tooltip */}
                      <div className="peer-tooltip">
                        <div className="font-semibold text-[13px] mb-1" style={{ color: c.color }}>
                          {c.name}
                        </div>
                        {location ? (
                          <div className="text-[11px] text-[#FFFFEB]/70 flex items-center gap-1.5">
                            <span>📄 {location.docTitle}</span>
                            <span>·</span>
                            <span>Page {location.pageIndex}</span>
                            <span>·</span>
                            <span>Line {location.line}</span>
                          </div>
                        ) : (
                          <div className="text-[11px] text-[#FFFFEB]/50 italic">Location unknown</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* User Identity Editable */}
            <div
              className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-[#1A1A1A]/10 text-xs font-medium text-[#1A1A1A] shadow-subtle"
              title="Your Identity (Editable)"
            >
              <div 
                className="w-3.5 h-3.5 rounded-full ring-1 ring-white" 
                style={{ backgroundColor: currentUser.color }}
              />
              <input 
                type="text" 
                value={currentUser.name} 
                onChange={(e) => setCurrentUser(prev => ({...prev, name: e.target.value}))}
                className="bg-transparent border-none focus:outline-none focus:ring-0 w-24 font-semibold text-[#111111] p-0 m-0"
                placeholder="Your Name"
                maxLength={20}
              />
            </div>

            {/* Network Status Badge */}
            <div
              className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl border text-xs font-semibold shadow-subtle transition-all ${
                networkStatus === 'connected'
                  ? 'bg-[#114E0B]/10 text-[#114E0B] border-[#114E0B]/20'
                  : networkStatus === 'connecting'
                  ? 'bg-[#5E5515]/10 text-[#5E5515] border-[#5E5515]/20'
                  : 'bg-[#7F1C34]/10 text-[#7F1C34] border-[#7F1C34]/20 animate-pulse'
              }`}
            >
              <span className="relative flex h-2 w-2">
                {networkStatus === 'connected' && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#114E0B] opacity-75" />
                )}
                <span
                  className={`relative inline-flex rounded-full h-2 w-2 ${
                    networkStatus === 'connected'
                      ? 'bg-[#114E0B]'
                      : networkStatus === 'connecting'
                      ? 'bg-[#5E5515]'
                      : 'bg-[#7F1C34]'
                  }`}
                />
              </span>
              <span className="capitalize">{networkStatus}</span>
            </div>

            {/* Simulate Network Partition */}
            <button
              onClick={handleToggleNetwork}
              id="simulate-network-toggle"
              type="button"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold shadow-subtle transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                networkStatus === 'disconnected'
                  ? 'bg-[#FFA946] hover:bg-[#f59e0b] text-[#111111] border border-[#1A1A1A]/20 focus:ring-[#FFA946]'
                  : 'bg-[#034F46] hover:bg-[#023731] text-[#FFFFEB] border border-[#034F46] focus:ring-[#034F46]'
              }`}
              title="Disconnect from the network to test offline editing"
            >
              {networkStatus === 'disconnected' ? (
                <>
                  <Wifi className="w-3.5 h-3.5 text-[#111111]" />
                  <span className="hidden sm:inline">Reconnect</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-3.5 h-3.5 text-[#FFFFEB]" />
                  <span className="hidden sm:inline">Go Offline</span>
                </>
              )}
            </button>
            
            {/* Delete Room Button */}
            {isOwner && (
              <button
                onClick={handleDeleteRoom}
                type="button"
                className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl text-status-danger bg-status-danger/5 hover:bg-status-danger/10 border border-status-danger/20 transition-colors text-xs font-semibold shadow-subtle mr-1"
                title="Securely Delete Room"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Delete Room</span>
              </button>
            )}
            
            {/* Leave Room Button */}
            <button
              onClick={onLeave}
              type="button"
              className="flex items-center justify-center p-1.5 rounded-lg text-[#7F1C34] hover:bg-[#7F1C34]/10 transition-colors"
              title="Leave Room"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Offline Notice Banner */}
        {networkStatus === 'disconnected' && (
          <div className="bg-[#FFA946]/15 border-t border-[#FFA946]/30 text-[#5E5515] text-xs px-4 py-2 text-center flex items-center justify-center gap-2 font-medium">
            <AlertTriangle className="w-4 h-4 text-[#7F1C34] shrink-0" />
            <span>
              <strong>Simulated Offline Mode:</strong> Edits to room{' '}
              <code className="bg-[#E4E4D0] px-1 py-0.5 rounded font-mono text-[#034F46]">{roomName}</code>{' '}
              persist offline in IndexedDB and re-sync automatically upon reconnect.
            </span>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════
            RICH TEXT FORMATTING TOOLBAR
            ═══════════════════════════════════════════════════════════════ */}
        <div className="border-t border-[#1A1A1A]/10 bg-[#FFFFEB]/95 backdrop-blur-sm toolbar-container relative z-40">
          <div className="w-full max-w-[850px] mx-auto px-4 lg:px-0 py-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1 shrink-0 overflow-x-auto custom-scrollbar max-w-[calc(100%-200px)] sm:max-w-none">
              <ToolbarButton editor={currentEditor} action="toggleBold" isActive={currentEditor?.isActive('bold')} icon={Bold} title="Bold" />
              <ToolbarButton editor={currentEditor} action="toggleItalic" isActive={currentEditor?.isActive('italic')} icon={Italic} title="Italic" />
              <ToolbarButton editor={currentEditor} action="toggleStrike" isActive={currentEditor?.isActive('strike')} icon={Strikethrough} title="Strikethrough" />
              <ToolbarButton editor={currentEditor} action="toggleCode" isActive={currentEditor?.isActive('code')} icon={Code} title="Inline Code" />

              <ToolbarDivider />

              <ToolbarButton
                editor={currentEditor}
                action="toggleHeading"
                actionArgs={{ level: 1 }}
                isActive={currentEditor?.isActive('heading', { level: 1 })}
                icon={Heading1}
                title="Heading 1 (Display)"
              />
              <ToolbarButton
                editor={currentEditor}
                action="toggleHeading"
                actionArgs={{ level: 2 }}
                isActive={currentEditor?.isActive('heading', { level: 2 })}
                icon={Heading2}
                title="Heading 2 (Section)"
              />

              <ToolbarDivider />

              <ToolbarButton editor={currentEditor} action="toggleBulletList" isActive={currentEditor?.isActive('bulletList')} icon={List} title="Bullet List" />
              <ToolbarButton editor={currentEditor} action="toggleOrderedList" isActive={currentEditor?.isActive('orderedList')} icon={ListOrdered} title="Numbered List" />

              <ToolbarDivider />

              {/* Undo / Redo need custom disabled logic */}
              <button
                type="button"
                onClick={() => currentEditor?.chain().focus().undo().run()}
                disabled={!currentEditor?.can().undo()}
                className="p-2 rounded-lg text-sm font-medium text-[#1A1A1A] hover:bg-[#E4E4D0]/70 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                title="Undo (CRDT)"
              >
                <Undo className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => currentEditor?.chain().focus().redo().run()}
                disabled={!currentEditor?.can().redo()}
                className="p-2 rounded-lg text-sm font-medium text-[#1A1A1A] hover:bg-[#E4E4D0]/70 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                title="Redo (CRDT)"
              >
                <Redo className="w-4 h-4" />
              </button>
            </div>

            {/* Right side: Page count + Export + IDB status */}
            <div className="flex items-center gap-3 text-xs text-[#666666] shrink-0 font-medium">
              <div
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white border border-[#1A1A1A]/10 text-[#034F46] font-semibold shadow-xs"
                title="Document page count"
              >
                <BookOpen className="w-3.5 h-3.5 text-[#034F46]" />
                <span>{pageIds.length} {pageIds.length === 1 ? 'Page' : 'Pages'}</span>
              </div>
              {/* Export Dropdown */}
              <div className="relative" ref={exportDropdownRef}>
                <button
                  onClick={() => setShowExportDropdown(prev => !prev)}
                  type="button"
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[#666666] hover:text-[#111111] hover:bg-[#E4E4D0]/60 transition-colors"
                  title="Export document"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span className="text-xs font-medium">Export</span>
                  <ChevronDown className={`w-3 h-3 transition-transform duration-150 ${showExportDropdown ? 'rotate-180' : ''}`} />
                </button>
                {showExportDropdown && (
                  <div className="export-dropdown absolute right-0 top-full mt-2 bg-white rounded-xl border border-[#1A1A1A]/10 shadow-2xl py-1 z-50 min-w-[190px]">
                    <button
                      onClick={() => { window.print(); setShowExportDropdown(false); }}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-[#1A1A1A] hover:bg-[#E4E4D0]/50 transition-colors text-left"
                    >
                      <FileDown className="w-4 h-4 text-[#7F1C34]" />
                      <div>
                        <div className="font-medium">Export as PDF</div>
                        <div className="text-[10px] text-[#888888]">Uses browser print dialog</div>
                      </div>
                    </button>
                    <button
                      onClick={() => {
                        // Collect HTML from all page editors in page order
                        const allHtml = pageIds
                          .map(pid => editorsMap[pid]?.getHTML() || '')
                          .filter(Boolean)
                          .join('<br style="page-break-after: always;" />');
                        
                        const blob = new Blob([`
                          <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
                          <head><meta charset='utf-8'><title>${documentTitle}</title>
                          <style>body{font-family:Calibri,sans-serif;font-size:12pt;line-height:1.6;color:#1a1a1a;max-width:700px;margin:0 auto;padding:40px}h1{font-size:24pt;font-weight:700}h2{font-size:18pt;font-weight:600}code{font-family:Consolas,monospace;background:#f0f0f0;padding:2px 6px;border-radius:3px}pre{background:#f5f5f5;padding:16px;border-radius:6px;overflow-x:auto}blockquote{border-left:3px solid #ccc;padding-left:16px;color:#555}ul,ol{padding-left:24px}</style>
                          </head><body>${allHtml}</body></html>
                        `], { type: 'application/msword' });
                        
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `${documentTitle || 'document'}.doc`;
                        a.click();
                        URL.revokeObjectURL(url);
                        setShowExportDropdown(false);
                        addToast('Document exported as DOCX', 'success');
                      }}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-[#1A1A1A] hover:bg-[#E4E4D0]/50 transition-colors text-left"
                    >
                      <FileType className="w-4 h-4 text-[#2D62FF]" />
                      <div>
                        <div className="font-medium">Export as DOCX</div>
                        <div className="text-[10px] text-[#888888]">Word-compatible document</div>
                      </div>
                    </button>
                  </div>
                )}
              </div>

            </div>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          SCROLLABLE DOCUMENT CANVAS
          ═══════════════════════════════════════════════════════════════════ */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto overflow-x-hidden p-6 sm:p-8 md:p-12 pb-28 scroll-smooth custom-scrollbar print:overflow-visible print:h-auto print:p-0 print:m-0 print:w-full relative z-0"
      >
        <div className="max-w-7xl mx-auto flex justify-center items-start print:block">


          {/* A4 Sheets Stack */}
          {ydoc && provider && (
            <main className="w-full max-w-[850px] flex flex-col items-center print:max-w-none print:w-full print:m-0 print:p-0 print:block">
              {pageIds.map((pId, idx) => (
                <PageSheet
                  key={`${activeDocId}-${pId}`}
                  activeDocId={activeDocId}
                  pageId={pId}
                  pageIndex={idx}
                  totalPages={pageIds.length}
                  ydoc={ydoc}
                  provider={provider}
                  currentUser={currentUser}
                  networkStatus={networkStatus}
                  onFocus={(ed) => setActiveEditor(ed)}
                  onDelete={handleDeletePage}
                  canDelete={pageIds.length > 1}
                  onRegisterEditor={handleRegisterEditor}
                  onUnregisterEditor={handleUnregisterEditor}
                />
              ))}

              {/* + Add Page Below */}
              <div className="w-full max-w-[850px] mt-4 mb-8 flex flex-col items-center select-none add-page-action-bar print:hidden">
                <button
                  onClick={handleAddPageBelow}
                  id="add-page-below-btn"
                  type="button"
                  className="group flex items-center gap-2.5 px-6 py-3 rounded-full bg-white hover:bg-[#034F46] text-[#034F46] hover:text-[#FFFFEB] border border-[#1A1A1A]/15 hover:border-[#034F46] shadow-subtle hover:shadow-elevated transition-all duration-200 text-xs font-semibold tracking-wide"
                  title="Create a completely new page sheet below"
                >
                  <span className="w-5 h-5 rounded-full bg-[#E4E4D0] group-hover:bg-[#FFFFEB]/20 flex items-center justify-center transition-colors">
                    <Plus className="w-3.5 h-3.5 text-[#034F46] group-hover:text-[#FFFFEB] group-hover:rotate-90 transition-transform duration-200" />
                  </span>
                  <span>Add Page Below</span>
                </button>
                <span className="text-[11px] text-[#888888] mt-2 font-mono">
                  {pageIds.length} {pageIds.length === 1 ? 'Page' : 'Pages'} in Document
                </span>
              </div>
            </main>
          )}

          {/* Right gutter to keep page centered */}
          <div className="shrink-0 w-10 sm:w-11 ml-3 sm:ml-4 hidden sm:block pointer-events-none" />
        </div>
      </div>
    </div>

      {/* Toast Notifications */}
      <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-2 print:hidden">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`${toast.exiting ? 'toast-exit' : 'toast-enter'} flex items-center gap-3 px-4 py-3 rounded-xl shadow-elevated border max-w-xs ${
              toast.type === 'warning'
                ? 'bg-[#FFA946]/15 border-[#FFA946]/30 text-[#5E5515]'
                : toast.type === 'success'
                ? 'bg-[#114E0B]/10 border-[#114E0B]/20 text-[#114E0B]'
                : 'bg-white border-[#1A1A1A]/10 text-[#1A1A1A]'
            }`}
          >
            <span className="text-sm font-medium">{toast.message}</span>
          </div>
        ))}
      </div>

      {/* Password Prompt Modal */}
      {passwordModalOpen && (
        <div className="modal-overlay fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="modal-content bg-white rounded-2xl p-6 w-full max-w-sm shadow-elevated border border-borderInk-soft">
            <h3 className="font-display text-lg font-medium text-ink-dark mb-1 flex items-center gap-2">
              <Lock className="w-5 h-5 text-[#7F1C34]" />
              Password Required
            </h3>
            <p className="text-sm text-ink-muted mb-4">
              Room <strong className="text-teal-deep font-mono">{roomName}</strong> is password-protected.
            </p>
            <form onSubmit={handleUnlockRoom} className="flex flex-col gap-3">
              <input
                type="password"
                placeholder="Enter room password"
                value={passwordInput}
                onChange={(e) => { setPasswordInput(e.target.value); setPasswordError(''); }}
                className="w-full px-4 py-3 rounded-xl border border-borderInk-soft bg-cream/50 focus:bg-white focus:outline-none focus:border-teal-deep focus:ring-1 focus:ring-teal-deep transition-all"
                autoFocus
              />
              {passwordError && (
                <p className="text-xs text-status-danger font-medium">{passwordError}</p>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onLeave}
                  className="flex-1 py-2.5 rounded-xl border border-borderInk-soft text-ink-muted font-medium hover:bg-cream transition-colors"
                >
                  Leave Room
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-teal-deep text-cream font-medium shadow-subtle hover:bg-teal-deep/90 transition-colors"
                >
                  Unlock
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}

// ---------------------------------------------------------------------------
// Editor (Root) — Multi-Document Workspace (Sidebar Removed for LAN MVP)
// ---------------------------------------------------------------------------

export default function Editor({ roomName, roomPassword, onLeave }) {
  return (
    <div className="relative flex h-screen w-screen bg-[#FFFFEB] font-body text-[#1A1A1A] overflow-hidden print:h-auto print:w-full print:overflow-visible print:bg-white">
      <div className="flex-1 h-screen flex flex-col min-w-0 overflow-hidden transition-all duration-300 print:h-auto print:overflow-visible print:w-full print:m-0 print:p-0 ml-0">
        <DocumentEditorWorkspace
          roomName={roomName}
          roomPassword={roomPassword}
          onLeave={onLeave}
        />
      </div>
    </div>
  );
}
