import React, { useState, useEffect } from 'react';
import Home from './Home';
import Editor from './Editor';

export default function App() {
  const [currentRoom, setCurrentRoom] = useState(() => {
    // Initialize from URL hash if available (e.g., #my-room)
    const hash = window.location.hash.replace('#', '');
    return hash || null;
  });

  const [roomPassword, setRoomPassword] = useState(() => {
    const hash = window.location.hash.replace('#', '');
    if (hash) {
      // try to see if password is required and saved
      try {
        return sessionStorage.getItem(`nexedit_pwd_${hash}`) || '';
      } catch (e) {
        return '';
      }
    }
    return '';
  });

  // Keep URL hash in sync with current room for easy sharing & refreshing
  useEffect(() => {
    if (currentRoom) {
      window.location.hash = currentRoom;
    } else {
      // clear hash
      window.history.pushState('', document.title, window.location.pathname + window.location.search);
    }
  }, [currentRoom]);

  // on hash change, update state
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '');
      setCurrentRoom(hash || null);
      if (hash) {
        try {
          setRoomPassword(sessionStorage.getItem(`nexedit_pwd_${hash}`) || '');
        } catch (e) {
          setRoomPassword('');
        }
      } else {
        setRoomPassword('');
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const handleJoinRoom = (room, password = '') => {
    if (password) {
      try {
        sessionStorage.setItem(`nexedit_pwd_${room}`, password);
      } catch (e) { /* ignore */ }
    }
    setRoomPassword(password);
    setCurrentRoom(room);
  };

  const handleLeave = () => {
    if (currentRoom) {
      try {
        sessionStorage.removeItem(`nexedit_pwd_${currentRoom}`);
      } catch (e) { /* ignore */ }
    }
    setRoomPassword('');
    setCurrentRoom(null);
  };

  if (!currentRoom) {
    return <Home onJoinRoom={handleJoinRoom} />;
  }

  return <Editor roomName={currentRoom} roomPassword={roomPassword} onLeave={handleLeave} />;
}
