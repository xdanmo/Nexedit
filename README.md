# Nexedit 📝

**Nexedit** is a fast, privacy-focused, real-time collaborative document editor designed specifically for **Local Area Networks (LANs)**. 

Unlike traditional cloud-based editors (like Google Docs), Nexedit does not require an active internet connection to collaborate. As long as you and your team are on the same Wi-Fi or local network, you can co-edit rich-text documents with zero latency. It achieves this conflict-free synchronization using **CRDTs (Conflict-free Replicated Data Types)** via Yjs.

---

## ✨ Features

- **LAN-First Collaboration:** Work together seamlessly over local Wi-Fi without internet reliance.
- **Real-Time Sync:** Instant, conflict-free syncing of text, document creation, and page deletions using CRDTs.
- **Multi-Document Workspaces:** Create and organize multiple documents and pages within a single room.
- **Live Presence & Cursors:** See exactly who is online, where their cursor is, and what they are selecting.
- **Secure Rooms:** Protect your workspaces with room passwords.
- **Admin Controls:** The creator of the room has exclusive permissions (e.g., securely deleting documents).
- **Auto-Recovery:** Built-in session deduplication ensures "ghost cursors" don't linger if a user drops connection.

---

## 🛠️ Technology Stack

- **Frontend:** React (Vite), TailwindCSS, Tiptap (Rich Text Editor), Lucide React
- **Backend:** Node.js, `ws` (WebSockets)
- **CRDT / Syncing:** Yjs, `y-websocket`, `y-protocols`

---

## 🚀 Getting Started

Follow these instructions to run Nexedit on your local machine.

### Prerequisites
Make sure you have [Node.js](https://nodejs.org/) (v18 or higher) installed on your computer.

### 1. Installation
Clone this repository and install the dependencies for both the client and the server.

```bash
# Clone the repository
git clone https://github.com/xdanmo/WeType.git
cd WeType

# Install dependencies for the root, server, and client
npm install
cd client && npm install
cd ../server && npm install
cd ..
```

### 2. Running the Application
You need to start both the WebSocket server and the frontend client. We have provided easy scripts for this:

Open a terminal and start the **WebSocket Server**:
```bash
npm run server
```

Open a **second** terminal and start the **Frontend Client**:
```bash
npm run dev
```

### 3. How to Collaborate
1. Open your browser and go to `http://localhost:5173`.
2. Enter a room name and optionally set a password. Click **Join**.
3. **To invite peers on your network:** Find your computer's local IP address (e.g., `192.168.1.5`).
4. Tell your peers to connect to `http://<YOUR_LOCAL_IP>:5173` in their browsers.
5. They can join your room name and enter the password you set. You are now co-editing in real-time!

---

## 📂 Project Structure

- `/client/` - React frontend powered by Vite and Tiptap. Handles UI, local offline caching, and Yjs document state.
- `/server/` - Node.js WebSocket backend. Acts as a signaling server to broadcast CRDT updates between connected peers.

---

## ⚖️ License
This project was built for a hackathon. Feel free to fork and explore!
