const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: [
      'https://streaming-4k-app.vercel.app',
      'http://localhost:3000',
      'http://localhost:5173'
    ],
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3000;

// Track all rooms and their metadata
const rooms = new Map();

// Helper function to get room list
function getRoomList() {
  return Array.from(rooms.entries()).map(([roomId, data]) => ({
    roomId,
    peerCount: data.peers.size,
    createdAt: data.createdAt,
    isStreaming: data.isStreaming
  }));
}

// Helper function to broadcast room list to all connected clients
function broadcastRoomList() {
  const roomList = getRoomList();
  console.log(`📡 Broadcasting ${roomList.length} rooms to all clients`);
  io.emit('rooms-list', roomList);
}

app.get('/', (req, res) => {
  res.send('4K Streaming Signaling Server is running');
});

// API endpoint to get all active rooms
app.get('/api/rooms', (req, res) => {
  res.json(getRoomList());
});

io.on('connection', (socket) => {
  console.log(`✅ User connected: ${socket.id}`);

  // Send initial room list to newly connected user
  const initialRoomList = getRoomList();
  console.log(`📤 Sending ${initialRoomList.length} rooms to ${socket.id}`);
  socket.emit('rooms-list', initialRoomList);

  // User joins or creates a room
  socket.on('join-room', (roomId) => {
    console.log(`👤 ${socket.id} joining room: ${roomId}`);
    socket.join(roomId);

    // Create room if it doesn't exist
    if (!rooms.has(roomId)) {
      console.log(`🆕 Creating new room: ${roomId}`);
      rooms.set(roomId, {
        peers: new Set(),
        createdAt: new Date(),
        isStreaming: false
      });
    }

    const roomData = rooms.get(roomId);
    roomData.peers.add(socket.id);
    console.log(`📍 Room ${roomId}: ${roomData.peers.size} peers`);

    // Get list of other peers in room
    const otherPeers = Array.from(roomData.peers).filter(id => id !== socket.id);
    socket.emit('peers-in-room', otherPeers);

    // Notify others in room of new peer
    socket.broadcast.to(roomId).emit('new-peer', { peerId: socket.id });

    // ⭐ CRITICAL: Broadcast updated room list to ALL connected clients
    broadcastRoomList();
  });

  // User starts streaming
  socket.on('start-streaming', (roomId) => {
    console.log(`🎥 ${socket.id} starting stream in ${roomId}`);
    if (rooms.has(roomId)) {
      rooms.get(roomId).isStreaming = true;
      broadcastRoomList();
    }
  });

  // User stops streaming
  socket.on('stop-streaming', (roomId) => {
    console.log(`⛔ ${socket.id} stopping stream in ${roomId}`);
    if (rooms.has(roomId)) {
      rooms.get(roomId).isStreaming = false;
      broadcastRoomList();
    }
  });

  // WebRTC signaling - offer
  socket.on('offer', (data) => {
    const { to, offer } = data;
    console.log(`📤 Offer from ${socket.id} to ${to}`);
    io.to(to).emit('offer', { from: socket.id, offer });
  });

  // WebRTC signaling - answer
  socket.on('answer', (data) => {
    const { to, answer } = data;
    console.log(`📥 Answer from ${socket.id} to ${to}`);
    io.to(to).emit('answer', { from: socket.id, answer });
  });

  // WebRTC signaling - ICE candidate
  socket.on('ice-candidate', (data) => {
    const { to, candidate } = data;
    console.log(`❄️  ICE from ${socket.id} to ${to}`);
    io.to(to).emit('ice-candidate', { from: socket.id, candidate });
  });

  // User disconnects
  socket.on('disconnect', () => {
    console.log(`❌ User disconnected: ${socket.id}`);

    // Remove from all rooms
    for (const [roomId, roomData] of rooms.entries()) {
      if (roomData.peers.has(socket.id)) {
        roomData.peers.delete(socket.id);
        console.log(`👤 Removed ${socket.id} from ${roomId} (${roomData.peers.size} remaining)`);
        
        // Notify others
        io.to(roomId).emit('peer-disconnected', { peerId: socket.id });

        // Delete room if empty
        if (roomData.peers.size === 0) {
          console.log(`🗑️  Deleted empty room: ${roomId}`);
          rooms.delete(roomId);
        }
      }
    }

    // ⭐ CRITICAL: Broadcast updated room list to all clients
    broadcastRoomList();
  });
});

server.listen(PORT, () => {
  console.log(`🚀 Signaling Server running on http://localhost:${PORT}`);
});