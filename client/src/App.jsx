import React, { useState, useEffect } from 'react';
import Home from './Home';
import Editor from './Editor';

export default function App() {
  const [currentRoom, setCurrentRoom] = useState(() => {
    // Initialize from URL hash if available (e.g., #my-room)
    const hash = window.location.hash.replace('#', '');
    return hash || null;
  });

  // Keep URL hash in sync with current room for easy sharing & refreshing
  useEffect(() => {
    if (currentRoom) {
      window.location.hash = currentRoom;
    } else {
      // Clear hash cleanly without triggering a scroll
      window.history.pushState("", document.title, window.location.pathname + window.location.search);
    }
  }, [currentRoom]);

  // Listen for manual hash changes (e.g. user hits "Back" button)
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '');
      setCurrentRoom(hash || null);
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  if (!currentRoom) {
    return <Home onJoinRoom={setCurrentRoom} />;
  }

  return <Editor roomName={currentRoom} onLeave={() => setCurrentRoom(null)} />;
}
