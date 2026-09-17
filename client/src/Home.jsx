import React, { useState, useEffect } from 'react';
import { Wifi, Plus, LogIn, RefreshCcw, WifiOff } from 'lucide-react';

export default function Home({ onJoinRoom }) {
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  
  const [newRoomName, setNewRoomName] = useState('');

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
    onJoinRoom(formatted);
  };



  return (
    <div className="min-h-screen bg-[#E4E4D0] flex flex-col font-body selection:bg-[#034F46]/20">


      <main className="flex-1 w-full max-w-4xl mx-auto p-6 sm:p-12 flex flex-col gap-12">
        
        {/* Welcome Section */}
        <section className="flex flex-col items-center text-center max-w-xl mx-auto gap-4 mt-8">
          <h1 className="font-display text-4xl sm:text-5xl font-medium text-[#111111] tracking-tight">
            Collaborate <span className="italic text-[#034F46]">seamlessly</span> on your local network
          </h1>
          <p className="text-[#666666] text-lg">
            Create a new workspace or join an existing room running on your Wi-Fi network.
          </p>
        </section>

        <div className="flex flex-col gap-8 max-w-xl mx-auto w-full">
          
          {/* Create Room Form */}
          <div className="bg-white rounded-3xl p-6 shadow-subtle border border-[#1A1A1A]/5">
            <h2 className="text-xl font-display font-medium text-[#111111] mb-4 flex items-center gap-2">
              <Plus className="w-5 h-5 text-[#034F46]" />
              Create New Room
            </h2>
            <form onSubmit={handleCreateRoom} className="flex flex-col gap-3">
              <input
                type="text"
                placeholder="e.g. project-alpha"
                value={newRoomName}
                onChange={(e) => setNewRoomName(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-[#1A1A1A]/20 bg-[#FFFFEB]/50 focus:bg-white focus:outline-none focus:border-[#034F46] focus:ring-1 focus:ring-[#034F46] transition-all"
              />
              <button
                type="submit"
                disabled={!newRoomName.trim()}
                className="w-full bg-[#034F46] text-[#FFFFEB] font-medium py-3 rounded-xl shadow-subtle hover:bg-[#023731] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Create Room
              </button>
            </form>
          </div>

          {/* Network Discovery */}
          <div className="bg-white rounded-3xl p-6 shadow-subtle border border-[#1A1A1A]/5 flex flex-col min-h-[400px]">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-display font-medium text-[#111111] flex items-center gap-2">
                <Wifi className="w-5 h-5 text-[#114E0B]" />
                LAN Discovery
              </h2>
              <button onClick={fetchRooms} className="text-[#888888] hover:text-[#111111] transition-colors p-2" title="Refresh">
                <RefreshCcw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
            
            <p className="text-sm text-[#666666] mb-6">
              Active rooms on your local network (`{window.location.hostname}`)
            </p>

            <div className="flex-1 flex flex-col gap-3 overflow-y-auto">
              {loading && rooms.length === 0 && (
                <div className="flex-1 flex items-center justify-center text-[#888888] text-sm">
                  Searching for rooms...
                </div>
              )}
              
              {error && (
                <div className="flex-1 flex flex-col items-center justify-center text-[#7F1C34] text-sm gap-2">
                  <WifiOff className="w-6 h-6" />
                  <span>Connection to sync server failed</span>
                </div>
              )}

              {!loading && !error && rooms.length === 0 && (
                <div className="flex-1 flex flex-col items-center justify-center text-[#888888] text-sm text-center">
                  <span className="block mb-1 text-2xl">👀</span>
                  No public rooms found.
                  <br />Create one to get started!
                </div>
              )}

              {!error && rooms.map((room) => (
                <button
                  key={room}
                  onClick={() => onJoinRoom(room)}
                  className="w-full flex items-center justify-between p-4 rounded-xl border border-[#1A1A1A]/10 hover:border-[#034F46]/50 hover:bg-[#E4E4D0]/30 transition-all text-left group"
                >
                  <span className="font-mono text-sm font-semibold text-[#034F46] truncate pr-4">
                    {room}
                  </span>
                  <span className="shrink-0 w-8 h-8 rounded-full bg-[#034F46] text-[#FFFFEB] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity -mr-2">
                    <LogIn className="w-4 h-4" />
                  </span>
                </button>
              ))}
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}
