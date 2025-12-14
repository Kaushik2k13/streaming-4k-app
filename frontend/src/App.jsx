import { useState, useRef, useEffect } from 'react';
import io from 'socket.io-client';
import { WebRTCService } from './services/webrtc';
import { RoomLobby } from './components/RoomLobby';
import './App.css';

function App() {
  const [roomId, setRoomId] = useState(null);
  const [joined, setJoined] = useState(false);
  const [peers, setPeers] = useState([]);
  const [remoteStreams, setRemoteStreams] = useState(new Map());
  const [rooms, setRooms] = useState([]);
  const [isSharing, setIsSharing] = useState(false);

  const socketRef = useRef(null);
  const webrtcRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRefs = useRef(new Map());

  // Initialize socket connection
  useEffect(() => {
    const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:3000';
    socketRef.current = io(BACKEND_URL);

    socketRef.current.on('connect', () => {
      console.log('✅ Connected to signaling server');
    });

    // Listen for room list updates
    socketRef.current.on('rooms-list', (roomList) => {
      console.log('📊 Rooms updated:', roomList);
      setRooms(roomList);
    });

    socketRef.current.on('peers-in-room', async (peerIds) => {
      console.log('📍 Peers in room:', peerIds);
      setPeers(peerIds);

      // Initiate calls to all existing peers
      if (webrtcRef.current && isSharing) {
        for (const peerId of peerIds) {
          await webrtcRef.current.initiateCall(peerId);
        }
      }
    });

    socketRef.current.on('new-peer', async (data) => {
      console.log('👤 New peer joined:', data.peerId);
      setPeers(prev => [...prev, data.peerId]);
      
      // Initiate call with new peer if we're sharing
      if (webrtcRef.current && isSharing) {
        await webrtcRef.current.initiateCall(data.peerId);
      }
    });

    socketRef.current.on('offer', async (data) => {
      if (webrtcRef.current) {
        await webrtcRef.current.handleOffer(data.from, data.offer);
      }
    });

    socketRef.current.on('answer', async (data) => {
      if (webrtcRef.current) {
        await webrtcRef.current.handleAnswer(data.from, data.answer);
      }
    });

    socketRef.current.on('ice-candidate', async (data) => {
      if (webrtcRef.current) {
        await webrtcRef.current.handleIceCandidate(data.from, data.candidate);
      }
    });

    socketRef.current.on('peer-disconnected', (data) => {
      console.log('❌ Peer disconnected:', data.peerId);
      setPeers(prev => prev.filter(id => id !== data.peerId));
      setRemoteStreams(prev => {
        const updated = new Map(prev);
        updated.delete(data.peerId);
        return updated;
      });
    });

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, [isSharing]);

  // Initialize WebRTC service
  useEffect(() => {
    webrtcRef.current = new WebRTCService(socketRef.current);

    webrtcRef.current.onRemoteStream = (peerId, stream) => {
      console.log('📹 Remote stream from:', peerId);
      setRemoteStreams(prev => new Map(prev).set(peerId, stream));

      if (remoteVideoRefs.current.has(peerId)) {
        const video = remoteVideoRefs.current.get(peerId);
        if (video) {
          video.srcObject = stream;
        }
      }
    };

    webrtcRef.current.onPeerDisconnected = (peerId) => {
      setPeers(prev => prev.filter(id => id !== peerId));
      setRemoteStreams(prev => {
        const updated = new Map(prev);
        updated.delete(peerId);
        return updated;
      });
    };
  }, []);

  const handleJoinRoom = async (newRoomId) => {
    try {
      console.log(`🚪 Joined room: ${newRoomId}`);
      
      // Just join the room first, don't start sharing yet
      socketRef.current.emit('join-room', newRoomId);
      
      setRoomId(newRoomId);
      setJoined(true);
      setIsSharing(false);
    } catch (err) {
      console.error('❌ Error joining room:', err);
      alert('Could not join room: ' + err.message);
    }
  };

  const handleStartSharing = async () => {
    try {
      if (!roomId) return;
      
      console.log('🎥 Starting screen share...');
      
      // Get screen stream
      const localStream = await webrtcRef.current.getLocalStream(true, false);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = localStream;
      }

      // Tell server we're streaming
      socketRef.current.emit('start-streaming', roomId);
      setIsSharing(true);

      // Initiate calls with all peers
      const currentRoom = rooms.find(r => r.roomId === roomId);
      if (currentRoom && currentRoom.peerCount > 0) {
        const otherPeerIds = peers;
        for (const peerId of otherPeerIds) {
          await webrtcRef.current.initiateCall(peerId);
        }
      }

      console.log('✅ Screen sharing started');
    } catch (err) {
      console.error('❌ Error starting screen share:', err);
      alert('Could not access screen: ' + err.message);
    }
  };

  const handleStopSharing = () => {
    console.log('⛔ Stopping screen share...');
    
    if (roomId) {
      socketRef.current.emit('stop-streaming', roomId);
    }
    
    if (webrtcRef.current) {
      webrtcRef.current.closeAllConnections();
    }
    
    setIsSharing(false);
    setPeers([]);
    setRemoteStreams(new Map());
    
    if (localVideoRef.current) {
      const stream = localVideoRef.current.srcObject;
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
        localVideoRef.current.srcObject = null;
      }
    }
  };

  const handleLeaveRoom = () => {
    console.log(`🚪 Leaving room: ${roomId}`);
    
    if (roomId && isSharing) {
      socketRef.current.emit('stop-streaming', roomId);
    }
    
    if (webrtcRef.current) {
      webrtcRef.current.closeAllConnections();
    }
    
    setJoined(false);
    setRoomId(null);
    setPeers([]);
    setRemoteStreams(new Map());
    setIsSharing(false);
  };

  // Show lobby if not joined
  if (!joined) {
    return (
      <RoomLobby
        socket={socketRef.current}
        onJoinRoom={handleJoinRoom}
      />
    );
  }

  // Show room with share screen option
  return (
    <div className="app">
      <div className="app-header">
        <h1>🎥 4K Streaming Room</h1>
        <p className="room-title">Room: {roomId}</p>
      </div>

      <div className="stream-container">
        {/* If not sharing, show waiting screen */}
        {!isSharing ? (
          <div className="waiting-screen">
            <div className="waiting-content">
              <h2>👋 Welcome to {roomId}</h2>
              <p>You've joined the room but are not sharing your screen yet.</p>
              
              {/* Show active rooms list */}
              <div className="active-rooms-panel">
                <h3>📊 Active Rooms</h3>
                <div className="rooms-list-mini">
                  {rooms.length === 0 ? (
                    <p className="no-rooms">No active rooms</p>
                  ) : (
                    rooms.map(room => (
                      <div key={room.roomId} className="room-item-mini">
                        <div className="room-item-header">
                          <span className="room-name">📍 {room.roomId}</span>
                          {room.isStreaming && <span className="live-badge">🔴 LIVE</span>}
                        </div>
                        <div className="room-item-details">
                          <span>👥 {room.peerCount} peers</span>
                          <span>⏰ {new Date(room.createdAt).toLocaleTimeString()}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="share-screen-prompt">
                <p>Ready to share your screen?</p>
                <button className="start-share-btn" onClick={handleStartSharing}>
                  🎬 Start Sharing Screen
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Video grid when sharing */}
            <div className="video-grid">
              {/* Local video */}
              <div className="video-wrapper local">
                <video
                  ref={localVideoRef}
                  autoPlay
                  muted
                  playsInline
                  className="video"
                />
                <div className="video-label">You (Sharing)</div>
              </div>

              {/* Remote videos */}
              {Array.from(remoteStreams.entries()).map(([peerId, stream]) => (
                <div key={peerId} className="video-wrapper remote">
                  <video
                    ref={(el) => {
                      if (el) remoteVideoRefs.current.set(peerId, el);
                    }}
                    autoPlay
                    playsInline
                    className="video"
                  />
                  <div className="video-label">Peer: {peerId.slice(0, 8)}</div>
                </div>
              ))}
            </div>

            {/* Room info */}
            <div className="room-info">
              <div className="info-grid">
                <div className="info-item">
                  <span className="info-label">📍 Room:</span>
                  <span className="info-value">{roomId}</span>
                </div>
                <div className="info-item">
                  <span className="info-label">👥 Viewers:</span>
                  <span className="info-value">{peers.length}</span>
                </div>
                <div className="info-item">
                  <span className="info-label">📹 Streams:</span>
                  <span className="info-value">{remoteStreams.size}</span>
                </div>
                <div className="info-item">
                  <span className="info-label">📊 Total Rooms:</span>
                  <span className="info-value">{rooms.length}</span>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Action buttons */}
        <div className="action-buttons">
          {isSharing ? (
            <>
              <button className="stop-share-btn" onClick={handleStopSharing}>
                ⛔ Stop Sharing
              </button>
              <button className="leave-btn" onClick={handleLeaveRoom}>
                🚪 Leave Room
              </button>
            </>
          ) : (
            <button className="leave-btn" onClick={handleLeaveRoom}>
              🚪 Leave Room
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
