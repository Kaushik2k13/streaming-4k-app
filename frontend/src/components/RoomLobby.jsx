import { useState } from 'react';
import './RoomLobby.css';

export function RoomLobby({ socket, onJoinRoom }) {
  const [roomId, setRoomId] = useState('');
  const [passkey, setPasskey] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    onJoinRoom({ roomId, passkey });
  };

  return (
    <div className="lobby">
      <div className="lobby-content">
        <h1>🎥 4K Streaming Platform</h1>
        <p className="subtitle">Share and watch streams in 4K quality</p>

        <form onSubmit={handleSubmit} className="join-form">
          <div className="form-group">
            <label htmlFor="roomId">Room ID</label>
            <input
              id="roomId"
              type="text"
              placeholder="Enter room ID"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              required
              className="form-input"
            />
          </div>

          <div className="form-group">
            <label htmlFor="passkey">Passkey (Optional)</label>
            <input
              id="passkey"
              type="password"
              placeholder="Enter passkey if required"
              value={passkey}
              onChange={(e) => setPasskey(e.target.value)}
              className="form-input"
            />
          </div>

          <button type="submit" className="join-btn">
            🚪 Join Room
          </button>
        </form>

        <div className="info">
          <h3>How it works:</h3>
          <ul>
            <li>🎬 Create or join a room</li>
            <li>📹 Share your screen or camera</li>
            <li>👥 Others can watch your stream</li>
            <li>🎥 4K quality for all participants</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
