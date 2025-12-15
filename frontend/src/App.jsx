import { useState, useRef, useEffect } from 'react';
import io from 'socket.io-client';
import { WebRTCService } from './services/webrtc';
import { RoomLobby } from './components/RoomLobby';
import { RoomWaiting } from './components/RoomWaiting';
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

  // SOCKET INITIALIZATION
  useEffect(() => {
    console.log('🔌 Setting up socket');
    
    const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';
    socketRef.current = io(BACKEND_URL, {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5
    });

    socketRef.current.on('connect', () => {
      console.log('✅ Connected');
    });

    socketRef.current.on('disconnect', (reason) => {
      console.error('❌ Disconnected:', reason);
    });

    socketRef.current.on('error', (error) => {
      console.error('❌ Error:', error);
    });

    socketRef.current.on('rooms-list', (roomList) => {
      try {
        setRooms(roomList);
      } catch (err) {
        console.error('❌ Error in rooms-list:', err);
      }
    });

    socketRef.current.on('join-room-error', (data) => {
      try {
        alert(data.error);
        setJoined(false);
      } catch (err) {
        console.error('❌ Error:', err);
      }
    });

    socketRef.current.on('peers-in-room', async (peerIds) => {
      try {
        setPeers(peerIds);
        if (webrtcRef.current && peerIds.length > 0) {
          for (const peerId of peerIds) {
            try {
              await webrtcRef.current.initiateCall(peerId);
            } catch (err) {
              console.error('❌ Error calling peer:', err);
            }
          }
        }
      } catch (err) {
        console.error('❌ Error:', err);
      }
    });

    socketRef.current.on('new-peer', async (data) => {
      try {
        setPeers(prev => [...prev, data.peerId]);
        if (webrtcRef.current) {
          await webrtcRef.current.initiateCall(data.peerId);
        }
      } catch (err) {
        console.error('❌ Error:', err);
      }
    });

    socketRef.current.on('offer', async (data) => {
      try {
        if (webrtcRef.current) {
          await webrtcRef.current.handleOffer(data.from, data.offer);
        }
      } catch (err) {
        console.error('❌ Error:', err);
      }
    });

    socketRef.current.on('answer', async (data) => {
      try {
        if (webrtcRef.current) {
          await webrtcRef.current.handleAnswer(data.from, data.answer);
        }
      } catch (err) {
        console.error('❌ Error:', err);
      }
    });

    socketRef.current.on('ice-candidate', async (data) => {
      try {
        if (webrtcRef.current) {
          await webrtcRef.current.handleIceCandidate(data.from, data.candidate);
        }
      } catch (err) {
        console.error('❌ Error:', err);
      }
    });

    socketRef.current.on('peer-disconnected', (data) => {
      try {
        setPeers(prev => prev.filter(id => id !== data.peerId));
        setRemoteStreams(prev => {
          const updated = new Map(prev);
          updated.delete(data.peerId);
          return updated;
        });
      } catch (err) {
        console.error('❌ Error:', err);
      }
    });

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, []);

  // WEBRTC INITIALIZATION
  useEffect(() => {
    console.log('🔧 Init WebRTC');
    
    try {
      if (!socketRef.current) return;

      webrtcRef.current = new WebRTCService(socketRef.current);

      webrtcRef.current.onRemoteStream = (peerId, stream) => {
        setRemoteStreams(prev => new Map(prev).set(peerId, stream));

        if (remoteVideoRefs.current.has(peerId)) {
          const video = remoteVideoRefs.current.get(peerId);
          if (video) {
            video.srcObject = stream;
            video.play().catch(() => {});
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

      console.log('✅ WebRTC ready');
    } catch (err) {
      console.error('❌ Error:', err);
    }
  }, []);

  const handleJoinRoom = async (roomData) => {
    try {
      const { roomId, passkey } = roomData;
      
      if (!roomId?.trim()) {
        alert('Enter room ID');
        return;
      }

      if (!socketRef.current?.connected) {
        alert('Not connected');
        return;
      }

      socketRef.current.emit('join-room', { roomId, passkey });
      setRoomId(roomId);
      setJoined(true);
      setIsSharing(false);
    } catch (err) {
      alert('Error: ' + err.message);
    }
  };

  const handleStartSharing = async () => {
    try {
      if (!roomId) return;
      if (!webrtcRef.current) {
        alert('WebRTC not ready');
        return;
      }

      const stream = await webrtcRef.current.getLocalStream(true, false);
      
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      if (!socketRef.current?.connected) {
        alert('No connection');
        return;
      }

      socketRef.current.emit('start-streaming', roomId);
      setIsSharing(true);

      for (const peerId of peers) {
        try {
          await webrtcRef.current.initiateCall(peerId);
        } catch (err) {
          console.error('Error:', err);
        }
      }
    } catch (err) {
      alert('Error: ' + err.message);
    }
  };

  const handleWatchStream = async (streamerId) => {
    try {
      if (!webrtcRef.current) {
        alert('WebRTC not ready');
        return;
      }

      await webrtcRef.current.createPeerConnection(streamerId, false, null);
      const pc = webrtcRef.current.peerConnections.get(streamerId);
      
      if (!pc) {
        alert('Connection failed');
        return;
      }

      const offer = await pc.createOffer({
        offerToReceiveAudio: false,
        offerToReceiveVideo: true
      });

      await pc.setLocalDescription(offer);

      if (!socketRef.current?.connected) {
        alert('No connection');
        return;
      }

      socketRef.current.emit('offer', { to: streamerId, offer });
      console.log('✅ Watch request sent');
    } catch (err) {
      alert('Error: ' + err.message);
    }
  };

  const handleStopSharing = () => {
    if (roomId) {
      socketRef.current?.emit('stop-streaming', roomId);
    }
    webrtcRef.current?.closeAllConnections();
    setIsSharing(false);
    setPeers([]);
    setRemoteStreams(new Map());
    if (localVideoRef.current?.srcObject) {
      localVideoRef.current.srcObject.getTracks().forEach(t => t.stop());
      localVideoRef.current.srcObject = null;
    }
  };

  const handleLeaveRoom = () => {
    if (roomId && isSharing) {
      socketRef.current?.emit('stop-streaming', roomId);
    }
    webrtcRef.current?.closeAllConnections();
    setJoined(false);
    setRoomId(null);
    setPeers([]);
    setRemoteStreams(new Map());
    setIsSharing(false);
  };

  if (!joined) {
    return <RoomLobby socket={socketRef.current} onJoinRoom={handleJoinRoom} />;
  }

  if (joined && !isSharing) {
    return (
      <RoomWaiting
        roomId={roomId}
        onStartShare={handleStartSharing}
        onWatchStream={handleWatchStream}
        socket={socketRef.current}
        peerCount={peers.length}
      />
    );
  }

  return (
    <div className="app">
      <div className="app-header">
        <h1>🎥 4K Streaming</h1>
        <p>Room: {roomId}</p>
      </div>

      <div className="stream-container">
        <div className="video-grid">
          <div className="video-wrapper local">
            <video ref={localVideoRef} autoPlay muted playsInline className="video" />
            <div className="video-label">You (Sharing)</div>
          </div>

          {Array.from(remoteStreams.entries()).map(([peerId]) => (
            <div key={peerId} className="video-wrapper remote">
              <video
                ref={(el) => {
                  if (el) remoteVideoRefs.current.set(peerId, el);
                }}
                autoPlay
                playsInline
                className="video"
              />
              <div className="video-label">{peerId.slice(0, 8)}</div>
            </div>
          ))}
        </div>

        <div className="action-buttons">
          <button className="stop-share-btn" onClick={handleStopSharing}>
            ⛔ Stop
          </button>
          <button className="leave-btn" onClick={handleLeaveRoom}>
            🚪 Leave
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;
