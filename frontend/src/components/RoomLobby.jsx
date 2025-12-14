import { useState, useEffect } from 'react';
import './RoomLobby.css';

export function RoomLobby({ socket, onJoinRoom }) {
  const [rooms, setRooms] = useState([]);
  const [newRoomId, setNewRoomId] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!socket) return;

    // Receive initial room list
    socket.on('rooms-list', (roomList) => {
      setRooms(roomList);
      setLoading(false);
    });

    // Listen for room updates
    return () => {
      socket.off('rooms-list');
    };
  }, [socket]);

  const handleJoinExistingRoom = (roomId) => {
    if (socket) {
      onJoinRoom(roomId);
    }
  };

  const handleCreateNewRoom = (e) => {
    e.preventDefault();
    if (!newRoomId.trim()) {
      alert('Please enter a room ID');
      return;
    }
    onJoinRoom(newRoomId);
    setNewRoomId('');
  };

  return (
    <div className="room-lobby">
      <div className="lobby-container">
        <div className="lobby-header">
          <h1>🎥 4K Streaming Rooms</h1>
          <p>Join an active room or create a new one</p>
        </div>

        {/* Create New Room Section */}
        <div className="create-room-section">
          <h2>Create New Room</h2>
          <form onSubmit={handleCreateNewRoom}>
            <input
              type="text"
              placeholder="Enter room ID (e.g., myroom123)"
              value={newRoomId}
              onChange={(e) => setNewRoomId(e.target.value)}
              maxLength="50"
            />
            <button type="submit" className="btn-primary">
              ➕ Create & Join Room
            </button>
          </form>
        </div>

        {/* Active Rooms Section */}
        <div className="active-rooms-section">
          <h2>Active Rooms ({rooms.length})</h2>

          {loading ? (
            <p className="loading-text">Loading rooms...</p>
          ) : rooms.length === 0 ? (
            <div className="empty-state">
              <p>No active rooms yet</p>
              <p className="hint">Create one using the form above</p>
            </div>
          ) : (
            <div className="rooms-grid">
              {rooms.map((room) => (
                <div key={room.roomId} className="room-card">
                  <div className="room-header">
                    <h3>{room.roomId}</h3>
                    {room.isStreaming && (
                      <span className="badge streaming">🔴 LIVE</span>
                    )}
                  </div>

                  <div className="room-info">
                    <div className="info-item">
                      <span className="label">👥 Peers:</span>
                      <span className="value">{room.peerCount}</span>
                    </div>
                    <div className="info-item">
                      <span className="label">⏰ Created:</span>
                      <span className="value">
                        {new Date(room.createdAt).toLocaleTimeString()}
                      </span>
                    </div>
                  </div>

                  <button
                    className="btn-join"
                    onClick={() => handleJoinExistingRoom(room.roomId)}
                  >
                    {room.peerCount === 0
                      ? '📺 Join & Share'
                      : `👁️ Join (${room.peerCount} watching)`}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
