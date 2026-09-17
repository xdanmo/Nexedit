import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCursor from '@tiptap/extension-collaboration-cursor';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { IndexeddbPersistence } from 'y-indexeddb';
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
  Printer,
  BookOpen,
  LogOut,
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
  return (
    <button
      type="button"
      onClick={() => actionArgs ? editor?.chain().focus()[action](actionArgs).run() : editor?.chain().focus()[action]().run()}
      disabled={disabled ?? !editor}
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

// ---------------------------------------------------------------------------
// PageSheet — Individual A4 page with its own TipTap collaboration fragment
// ---------------------------------------------------------------------------

function PageSheet({
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
}) {
  const fragmentField = pageIndex === 0 ? 'default' : `page-${pageId}`;

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

  // Register this editor so the parent toolbar can control it
  useEffect(() => {
    if (editor) onRegisterEditor(pageId, editor);
  }, [editor, pageId, onRegisterEditor]);

  // Safety cleanup — destroy TipTap instance on unmount
  useEffect(() => {
    return () => {
      if (editor && !editor.isDestroyed) editor.destroy();
    };
  }, [editor]);

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
          <span className="font-mono text-[10px] text-[#888888] hidden sm:inline print:hidden">
            Fragment: {fragmentField}
          </span>
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
  onLeave,
}) {
  // ── UI State ──────────────────────────────────────────────────────────
  const [networkStatus, setNetworkStatus] = useState('connecting');
  const [indexedDbSynced, setIndexedDbSynced] = useState(false);
  const [collaborators, setCollaborators] = useState([]);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  
  // Real-time title
  const [documentTitle, setDocumentTitle] = useState('Untitled Document');
  const [titleDraft, setTitleDraft] = useState('');
  
  const [activeEditor, setActiveEditor] = useState(null);
  const [editorsMap, setEditorsMap] = useState({});
  const [, setToolbarTick] = useState(0);
  const [pageIds, setPageIds] = useState([]);
  const scrollContainerRef = useRef(null);

  // ── Stable user identity for presence ─────────────────────────────────
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const stored = localStorage.getItem('weType_user');
      if (stored) return JSON.parse(stored);
    } catch (e) { /* ignore */ }
    
    const color = COLLABORATOR_COLORS[Math.floor(Math.random() * COLLABORATOR_COLORS.length)];
    const id = Math.floor(Math.random() * 1000);
    return { name: `Engineer ${id}`, color };
  });

  // Update presence awareness when user changes their name
  const currentUserRef = useRef(currentUser);
  useEffect(() => {
    currentUserRef.current = currentUser;
    try {
      localStorage.setItem('weType_user', JSON.stringify(currentUser));
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
    const ws = new WebsocketProvider(WS_URL, roomName, doc, { connect: true });
    const idb = new IndexeddbPersistence(roomName, doc);

    ydocRef.current = doc;
    providerRef.current = ws;
    idbRef.current = idb;

    // ─ Real-time Document Metadata (Title) ─
    const metadata = doc.getMap('metadata');
    const syncMetadata = () => {
      setDocumentTitle(metadata.get('title') || 'Untitled Document');
    };
    metadata.observe(syncMetadata);
    syncMetadata();

    // ─ Collaborative multi-page tracking via Y.Array('pages') ─
    const ypages = doc.getArray('pages');
    const syncPages = () => {
      const arr = ypages.toArray();
      if (arr.length === 0) {
        setPageIds(['p1']);
      } else {
        // Deduplicate page IDs to gracefully recover from CRDT race conditions
        setPageIds(Array.from(new Set(arr)));
      }
    };
    syncPages();
    ypages.observe(syncPages);

    // ─ Network status (reactive — drives all UI) ─
    const onStatus = (event) => setNetworkStatus(event.status);
    ws.on('status', onStatus);

    // ─ IndexedDB sync ─
    const onIdbSync = () => {
      setIndexedDbSynced(true);
    };
    idb.on('synced', onIdbSync);

    // ─ Presence / awareness ─
    const onAwarenessChange = () => {
      const states = ws.awareness.getStates();
      const uniquePeers = new Map();
      
      states.forEach((state, clientId) => {
        // Filter out our exact client ID, and any ghost connections matching our current name
        if (
          state.user && 
          clientId !== ws.awareness.clientID && 
          state.user.name !== currentUserRef.current.name
        ) {
          // Deduplicate remote users by name (e.g. if they have multiple tabs open)
          if (!uniquePeers.has(state.user.name)) {
            uniquePeers.set(state.user.name, {
              clientId,
              name: state.user.name || 'Anonymous',
              color: state.user.color || '#034F46',
            });
          }
        }
      });
      setCollaborators(Array.from(uniquePeers.values()));
    };
    ws.awareness.on('change', onAwarenessChange);
    ws.awareness.setLocalStateField('user', currentUser);

    // ─ Cleanup: destroy everything in reverse order ─
    return () => {
      metadata.unobserve(syncMetadata);
      ypages.unobserve(syncPages);
      ws.off('status', onStatus);
      ws.awareness.off('change', onAwarenessChange);
      ws.destroy();
      idb.destroy();
      doc.destroy();
      ydocRef.current = null;
      providerRef.current = null;
      idbRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomName]);

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

  // ── Network partition toggle (reactive — no manual state override) ────
  const handleToggleNetwork = useCallback(() => {
    const ws = providerRef.current;
    if (!ws) return;
    if (networkStatus === 'disconnected') {
      ws.connect();
    } else {
      ws.disconnect();
    }
    // Status will update reactively via the 'status' event listener
  }, [networkStatus]);

  // ── Add new page sheet below ──────────────────────────────────────────
  const handleAddPageBelow = useCallback(() => {
    const doc = ydocRef.current;
    if (!doc) return;
    const ypages = doc.getArray('pages');
    const newPageId = `p-${Date.now().toString(36)}`;
    
    if (ypages.length === 0) {
      ypages.push(['p1', newPageId]);
    } else {
      ypages.push([newPageId]);
    }
    setTimeout(() => {
      scrollContainerRef.current?.scrollTo({
        top: scrollContainerRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }, 100);
  }, []);

  // ── Delete page sheet ─────────────────────────────────────────────────
  const handleDeletePage = useCallback((pageIdToDelete) => {
    const doc = ydocRef.current;
    if (!doc) return;
    const ypages = doc.getArray('pages');
    
    // Ensure we don't delete the last remaining unique page
    const uniquePages = Array.from(new Set(ypages.toArray()));
    if (uniquePages.length <= 1) return;
    
    // Remove all occurrences (cleans up any CRDT dupes)
    let current = ypages.toArray();
    while (current.indexOf(pageIdToDelete) !== -1) {
      ypages.delete(current.indexOf(pageIdToDelete), 1);
      current = ypages.toArray();
    }
    
    setEditorsMap((prev) => {
      const next = { ...prev };
      delete next[pageIdToDelete];
      return next;
    });
  }, []);

  // ── Save title ────────────────────────────────────────────────────────
  const handleSaveTitle = () => {
    if (ydocRef.current && titleDraft.trim()) {
      ydocRef.current.getMap('metadata').set('title', titleDraft.trim());
    }
    setIsEditingTitle(false);
  };

  // ── Derived values ────────────────────────────────────────────────────
  const currentEditor = activeEditor || Object.values(editorsMap)[0] || null;
  const ydoc = ydocRef.current;
  const provider = providerRef.current;

  return (
    <div
      className={`h-full w-full flex flex-col overflow-hidden transition-colors duration-300 print:h-auto print:overflow-visible print:bg-white print:p-0 print:m-0 ${
        networkStatus === 'disconnected' ? 'bg-[#F5F5DE]' : 'bg-[#FFFFEB]'
      } font-body text-[#1A1A1A]`}
    >
      {/* ═══════════════════════════════════════════════════════════════════
          LOCKED TOP SECTION (HEADER + TOOLBAR)
          ═══════════════════════════════════════════════════════════════════ */}
      <div className="shrink-0 z-30 bg-[#FFFFEB]/95 backdrop-blur-md border-b border-[#1A1A1A]/10 shadow-[0_1px_6px_rgba(26,26,15,0.03)] print:hidden">
        <header className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-3">
          {/* Left: Document Icon + Title */}
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
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
              <span>{collaborators.length} {collaborators.length === 1 ? 'Peer' : 'Peers'}</span>
              <div className="flex -space-x-1 ml-1 overflow-hidden">
                {collaborators.slice(0, 3).map((c) => (
                  <span
                    key={c.clientId}
                    className="inline-block w-3.5 h-3.5 rounded-full ring-1 ring-white"
                    style={{ backgroundColor: c.color }}
                    title={c.name}
                  />
                ))}
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
              title="Simulate network partition to test offline CRDT mutations and IndexedDB rehydration"
            >
              {networkStatus === 'disconnected' ? (
                <>
                  <Wifi className="w-3.5 h-3.5 text-[#111111]" />
                  <span className="hidden sm:inline">Reconnect</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-3.5 h-3.5 text-[#FFFFEB]" />
                  <span className="hidden sm:inline">Partition</span>
                </>
              )}
            </button>
            
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
        <div className="border-t border-[#1A1A1A]/10 bg-[#FFFFEB]/95 backdrop-blur-sm toolbar-container overflow-x-auto custom-scrollbar">
          <div className="w-full max-w-[850px] mx-auto px-4 lg:px-0 py-2 flex items-center justify-between gap-2 min-w-max">
            <div className="flex items-center gap-1 shrink-0">
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

            {/* Right side: Page count + Print + IDB status */}
            <div className="flex items-center gap-3 text-xs text-[#666666] shrink-0 font-medium">
              <div
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white border border-[#1A1A1A]/10 text-[#034F46] font-semibold shadow-xs"
                title="Document page count"
              >
                <BookOpen className="w-3.5 h-3.5 text-[#034F46]" />
                <span>{pageIds.length} {pageIds.length === 1 ? 'Page' : 'Pages'}</span>
              </div>
              <button
                onClick={() => window.print()}
                type="button"
                className="hidden md:flex items-center gap-1 p-1.5 rounded-lg text-[#666666] hover:text-[#111111] hover:bg-[#E4E4D0]/60 transition-colors"
                title="Print or export pages to PDF"
              >
                <Printer className="w-3.5 h-3.5" />
              </button>
              <div className="hidden sm:flex items-center gap-1">
                <HardDriveDownload className={`w-3.5 h-3.5 ${indexedDbSynced ? 'text-[#114E0B]' : 'text-[#888888]'}`} />
                <span>{indexedDbSynced ? 'Local Synced' : 'Syncing...'}</span>
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
        className="flex-1 overflow-y-auto overflow-x-hidden p-6 sm:p-8 md:p-12 pb-28 scroll-smooth custom-scrollbar print:overflow-visible print:h-auto print:p-0 print:m-0 print:w-full"
      >
        <div className="max-w-7xl mx-auto flex justify-center items-start print:block">


          {/* A4 Sheets Stack */}
          {ydoc && provider && (
            <main className="w-full max-w-[850px] flex flex-col items-center print:max-w-none print:w-full print:m-0 print:p-0 print:block">
              {pageIds.map((pId, idx) => (
                <PageSheet
                  key={pId}
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
  );
}

// ---------------------------------------------------------------------------
// Editor (Root) — Multi-Document Workspace (Sidebar Removed for LAN MVP)
// ---------------------------------------------------------------------------

export default function Editor({ roomName, onLeave }) {
  return (
    <div className="relative flex h-screen w-screen bg-[#FFFFEB] font-body text-[#1A1A1A] overflow-hidden print:h-auto print:w-full print:overflow-visible print:bg-white">
      <div className="flex-1 h-screen flex flex-col min-w-0 overflow-hidden transition-all duration-300 print:h-auto print:overflow-visible print:w-full print:m-0 print:p-0 ml-0">
        <DocumentEditorWorkspace
          roomName={roomName}
          onLeave={onLeave}
        />
      </div>
    </div>
  );
}
