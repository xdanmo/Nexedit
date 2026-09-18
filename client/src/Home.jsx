import React, { useState, useEffect } from 'react';
import { Wifi, Plus, LogIn, RefreshCcw, WifiOff, Lock, Unlock } from 'lucide-react';
import './styles.css';

export default function Home({ onJoinRoom }) {
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomPassword, setNewRoomPassword] = useState('');

  // Password modal state
  const [passwordModal, setPasswordModal] = useState(null); // { roomName: string } | null
  const [modalPassword, setModalPassword] = useState('');
  const [modalError, setModalError] = useState('');
  const [verifying, setVerifying] = useState(false);

  const fetchRooms = async () => {
    try {
      const hostname = window.location.hostname;
      const res = await fetch(`http://${hostname}:1234/api/rooms`);
      if (!res.ok) throw new Error('Failed to fetch rooms');
      const data = await res.json();
      setRooms(data);
      setError(false);
    } catch (err) {
      console.error(err);
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRooms();
    const interval = setInterval(fetchRooms, 3000); // Poll every 3 seconds
    return () => clearInterval(interval);
  }, []);

  const handleCreateRoom = (e) => {
    e.preventDefault();
    if (!newRoomName.trim()) return;
    const formatted = newRoomName.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
    onJoinRoom(formatted, newRoomPassword.trim());
  };

  const handleRoomClick = (room) => {
    if (room.hasPassword) {
      setPasswordModal({ roomName: room.name });
      setModalPassword('');
      setModalError('');
    } else {
      onJoinRoom(room.name, '');
    }
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    if (!modalPassword.trim()) {
      setModalError('Password is required');
      return;
    }
    setVerifying(true);
    setModalError('');

    try {
      const hostname = window.location.hostname;
      const res = await fetch(`http://${hostname}:1234/api/rooms/${passwordModal.roomName}/verify-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: modalPassword.trim() })
      });
      const data = await res.json();
      if (!data.valid) {
        setModalError('Incorrect password. Please try again.');
        setVerifying(false);
        return;
      }

      onJoinRoom(passwordModal.roomName, modalPassword.trim());
      setPasswordModal(null);
    } catch (err) {
      console.error(err);
      setModalError('Unable to connect to server. Please try again.');
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="min-h-screen bg-cream flex flex-col font-body selection:bg-teal-deep/20 text-ink">

      <main className="flex-1 w-full max-w-4xl mx-auto p-6 sm:p-12 flex flex-col gap-12">
        
        {/* Welcome Section */}
        <section className="flex flex-col items-center text-center max-w-xl mx-auto gap-4 mt-8">
          <h1 className="font-display text-4xl sm:text-5xl font-medium text-ink-dark tracking-tight leading-[1.15]">
            Collaborate <span className="inline-block italic text-teal-deep bg-lavender px-2 py-1 mx-1 rounded-lg shadow-sm">seamlessly</span><br />
            on your local network
          </h1>
          <p className="text-ink-muted text-lg">
            Create a new workspace or join an existing room running on your Wi-Fi network.
          </p>
        </section>

        <div className="flex flex-col gap-8 max-w-xl mx-auto w-full">
          
          {/* Create Room Form */}
          <div className="bg-white rounded-3xl p-6 shadow-subtle border border-borderInk-soft">
            <h2 className="text-xl font-display font-medium text-ink-dark mb-4 flex items-center gap-2">
              <Plus className="w-5 h-5 text-teal-deep" />
              Create New Room
            </h2>
            <form onSubmit={handleCreateRoom} className="flex flex-col gap-3">
              <input
                type="text"
                placeholder="e.g. project-alpha"
                value={newRoomName}
                onChange={(e) => setNewRoomName(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-borderInk-soft bg-cream/50 focus:bg-white focus:outline-none focus:border-teal-deep focus:ring-1 focus:ring-teal-deep transition-all"
              />
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-soft" />
                <input
                  type="password"
                  placeholder="Room password (optional)"
                  value={newRoomPassword}
                  onChange={(e) => setNewRoomPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-borderInk-soft bg-cream/50 focus:bg-white focus:outline-none focus:border-teal-deep focus:ring-1 focus:ring-teal-deep transition-all"
                />
              </div>
              <button
                type="submit"
                disabled={!newRoomName.trim()}
                className="w-full bg-teal-deep text-cream font-medium py-3 rounded-xl shadow-subtle hover:bg-teal-deep/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Create Room
              </button>
            </form>
          </div>

          {/* Network Discovery */}
          <div className="bg-white rounded-3xl p-6 shadow-subtle border border-borderInk-soft flex flex-col min-h-[400px]">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-display font-medium text-ink-dark flex items-center gap-2">
                <Wifi className="w-5 h-5 text-status-success" />
                LAN Discovery
              </h2>
              <button onClick={fetchRooms} className="text-ink-soft hover:text-ink-dark transition-colors p-2" title="Refresh">
                <RefreshCcw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
            
            <p className="text-sm text-ink-muted mb-6">
              Active rooms on your local network (`{window.location.hostname}`)
            </p>

            <div className="flex-1 flex flex-col gap-3 overflow-y-auto">
              {loading && rooms.length === 0 && (
                <div className="flex-1 flex items-center justify-center text-ink-soft text-sm">
                  Searching for rooms...
                </div>
              )}
              
              {error && (
                <div className="flex-1 flex flex-col items-center justify-center text-status-danger text-sm gap-2">
                  <WifiOff className="w-6 h-6" />
                  <span>Connection to sync server failed</span>
                </div>
              )}

              {!loading && !error && rooms.length === 0 && (
                <div className="flex-1 flex flex-col items-center justify-center text-ink-soft text-sm text-center">
                  <span className="block mb-1 text-2xl">👀</span>
                  No public rooms found.
                  <br />Create one to get started!
                </div>
              )}

              {!error && rooms.map((room) => (
                <button
                  key={room.name}
                  onClick={() => handleRoomClick(room)}
                  className="w-full flex items-center justify-between p-4 rounded-xl border border-borderInk-soft hover:border-orange-accent/50 hover:bg-orange-accent/10 transition-all text-left group"
                >
                  <span className="flex items-center gap-2 font-mono text-sm font-semibold text-teal-deep truncate pr-4">
                    {room.hasPassword && (
                      <Lock className="w-3.5 h-3.5 text-[#7F1C34] shrink-0" />
                    )}
                    {room.name}
                  </span>
                  <span className="shrink-0 w-8 h-8 rounded-full bg-orange-accent text-ink-dark flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity -mr-2">
                    <LogIn className="w-4 h-4" />
                  </span>
                </button>
              ))}
            </div>
          </div>

        </div>
      </main>

      {/* Password Modal */}
      {passwordModal && (
        <div className="modal-overlay fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="modal-content bg-white rounded-2xl p-6 w-full max-w-sm shadow-elevated border border-borderInk-soft">
            <h3 className="font-display text-lg font-medium text-ink-dark mb-1 flex items-center gap-2">
              <Lock className="w-5 h-5 text-[#7F1C34]" />
              Password Required
            </h3>
            <p className="text-sm text-ink-muted mb-4">
              Room <strong className="text-teal-deep font-mono">{passwordModal.roomName}</strong> is password-protected.
            </p>
            <form onSubmit={handlePasswordSubmit} className="flex flex-col gap-3">
              <input
                type="password"
                placeholder="Enter room password"
                value={modalPassword}
                onChange={(e) => { setModalPassword(e.target.value); setModalError(''); }}
                className="w-full px-4 py-3 rounded-xl border border-borderInk-soft bg-cream/50 focus:bg-white focus:outline-none focus:border-teal-deep focus:ring-1 focus:ring-teal-deep transition-all"
                autoFocus
              />
              {modalError && (
                <p className="text-xs text-status-danger font-medium">{modalError}</p>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPasswordModal(null)}
                  className="flex-1 py-2.5 rounded-xl border border-borderInk-soft text-ink-muted font-medium hover:bg-cream transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={verifying}
                  className="flex-1 py-2.5 rounded-xl bg-teal-deep text-cream font-medium shadow-subtle hover:bg-teal-deep/90 disabled:opacity-50 transition-colors"
                >
                  {verifying ? 'Checking...' : 'Join Room'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
