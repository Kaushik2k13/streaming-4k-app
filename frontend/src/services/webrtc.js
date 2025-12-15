// ICE servers for NAT traversal
const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' }
  ]
};

export class WebRTCService {
  constructor(socket) {
    console.log('🔧 WebRTCService constructor called');
    this.socket = socket;
    this.peerConnections = new Map();
    this.localStream = null;
    this.iceCandidateQueue = new Map();
    this.statsMonitor = null;

    // Initialize quality manager
    this.qualityManager = {
      getVideoConstraints: () => ({
        width: { max: 3840 },
        height: { max: 2160 },
        frameRate: { max: 30 }
      }),
      getQualityName: () => '4K (Excellent)'
    };

    // Callback handlers
    this.onRemoteStream = null;
    this.onPeerDisconnected = null;

    console.log('✅ WebRTCService initialized');
  }

  // Get local media stream
  async getLocalStream(isScreenShare = false, useAudio = false) {
    try {
      console.log(`📹 Getting local stream... (screen: ${isScreenShare})`);
      
      let stream;

      if (isScreenShare) {
        // SCREEN SHARING MODE
        console.log('🖥️  Using getDisplayMedia for screen sharing');
        try {
          stream = await navigator.mediaDevices.getDisplayMedia({
            video: {
              width: { ideal: 1920 },
              height: { ideal: 1080 },
              frameRate: { ideal: 30 }
            },
            audio: useAudio
          });
          console.log('✅ Display media acquired');
        } catch (err) {
          console.error('❌ getDisplayMedia failed:', err);
          throw new Error('Screen sharing not supported or blocked by user: ' + err.message);
        }
      } else {
        // WEBCAM MODE
        console.log('📷 Using getUserMedia for webcam');
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: useAudio,
            video: {
              width: { ideal: 1280 },
              height: { ideal: 720 }
            }
          });
          console.log('✅ User media acquired');
        } catch (err) {
          console.error('❌ getUserMedia failed:', err);
          throw new Error('Camera/microphone access denied: ' + err.message);
        }
      }

      if (!stream) {
        throw new Error('No stream returned from media devices');
      }

      this.localStream = stream;
      
      console.log('🎬 Local stream set, tracks:', {
        video: stream.getVideoTracks().length,
        audio: stream.getAudioTracks().length
      });

      // Handle screen share being stopped by user
      if (isScreenShare) {
        const videoTracks = stream.getVideoTracks();
        if (videoTracks.length > 0) {
          // Get the FIRST track (index 0), not the array
          const videoTrack = videoTracks[0];
          
          // Use onended property, NOT addEventListener
          videoTrack.onended = () => {
            console.log('⛔ Screen sharing stopped by user (track ended)');
            // Stop all tracks when user stops sharing
            if (this.localStream) {
              this.localStream.getTracks().forEach(track => track.stop());
              this.localStream = null;
            }
          };
          console.log('✅ Screen stop handler attached to track');
        }
      }

      return stream;
    } catch (err) {
      console.error('❌ Error getting local stream:', err);
      throw err;
    }
  }

  // Start stats monitoring
  startStatsMonitoring() {
    if (this.statsMonitor) {
      clearInterval(this.statsMonitor);
    }
    
    this.statsMonitor = setInterval(() => {
      // Monitor connection quality
      if (this.localStream) {
        const videoTracks = this.localStream.getVideoTracks();
        if (videoTracks.length > 0) {
          // You can add stats logging here if needed
        }
      }
    }, 5000);
    
    console.log('📊 Stats monitoring started');
  }

  // Create peer connection for a specific peer
  createPeerConnection(peerId, isInitiator = true, localStream = null) {
    console.log(`🔌 Creating peer connection for ${peerId} (initiator: ${isInitiator})`);
    
    const peerConnection = new RTCPeerConnection(ICE_SERVERS);

    // Add local tracks to peer connection
    const streamToAdd = localStream || this.localStream;
    if (streamToAdd) {
      console.log(`📤 Adding local tracks to ${peerId}`);
      streamToAdd.getTracks().forEach(track => {
        peerConnection.addTrack(track, streamToAdd);
      });
    } else {
      console.log(`⚠️  No local stream to add to ${peerId}`);
    }

    // Handle ICE candidates
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        console.log(`❄️  ICE candidate for ${peerId}`);
        this.socket.emit('ice-candidate', {
          to: peerId,
          candidate: event.candidate
        });
      }
    };

    // Handle remote stream
    peerConnection.ontrack = (event) => {
      console.log(`📹 Remote track received from ${peerId}`);
      console.log(`🎬 Track kind: ${event.track.kind}, Stream ID: ${event.streams[0]?.id}`);
      
      if (this.onRemoteStream && event.streams.length > 0) {
        this.onRemoteStream(peerId, event.streams[0]);
      }
    };

    // Connection state changes
    peerConnection.onconnectionstatechange = () => {
      console.log(`🔗 Connection state with ${peerId}: ${peerConnection.connectionState}`);
      if (peerConnection.connectionState === 'disconnected' ||
          peerConnection.connectionState === 'failed' ||
          peerConnection.connectionState === 'closed') {
        this.peerConnections.delete(peerId);
        if (this.onPeerDisconnected) {
          this.onPeerDisconnected(peerId);
        }
      }
    };

    // ICE connection state changes
    peerConnection.oniceconnectionstatechange = () => {
      console.log(`❄️  ICE connection state with ${peerId}: ${peerConnection.iceConnectionState}`);
    };

    // Signaling state changes
    peerConnection.onsignalingstatechange = () => {
      console.log(`📡 Signaling state with ${peerId}: ${peerConnection.signalingState}`);
    };

    this.peerConnections.set(peerId, peerConnection);
    console.log(`✅ Peer connection created for ${peerId}`);
    return peerConnection;
  }

  // Initiate call (create offer)
  async initiateCall(peerId) {
    try {
      console.log(`📞 Initiating call with ${peerId}`);

      if (this.peerConnections.has(peerId)) {
        console.warn(`⚠️  Already connected to ${peerId}`);
        return;
      }

      const peerConnection = this.createPeerConnection(peerId, true, this.localStream);

      const offer = await peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
      });

      console.log('📤 Offer created');

      await peerConnection.setLocalDescription(offer);
      console.log('✅ Local description set');

      console.log(`📤 Sending offer to ${peerId}`);
      this.socket.emit('offer', {
        to: peerId,
        offer: offer
      });

      console.log('✅ Offer sent');
    } catch (err) {
      console.error('❌ Error creating offer:', err);
      this.peerConnections.delete(peerId);
    }
  }

  // Handle incoming offer
  async handleOffer(peerId, offer) {
    try {
      console.log(`📥 Received offer from ${peerId}`);

      if (this.peerConnections.has(peerId)) {
        console.warn(`⚠️  Already connected to ${peerId}`);
        return;
      }

      const peerConnection = this.createPeerConnection(peerId, false, this.localStream);

      await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
      console.log(`✅ Remote description set from ${peerId}`);

      const answer = await peerConnection.createAnswer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
      });

      console.log('📨 Answer created');

      await peerConnection.setLocalDescription(answer);
      console.log('✅ Local description set');

      console.log(`📨 Sending answer to ${peerId}`);
      this.socket.emit('answer', {
        to: peerId,
        answer: answer
      });

      console.log('✅ Answer sent');
    } catch (err) {
      console.error('❌ Error handling offer:', err);
      this.peerConnections.delete(peerId);
    }
  }

  // Handle incoming answer
  async handleAnswer(peerId, answer) {
    try {
      console.log(`✅ Received answer from ${peerId}`);

      const peerConnection = this.peerConnections.get(peerId);
      if (!peerConnection) {
        console.error(`❌ No peer connection for ${peerId}`);
        return;
      }

      await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
      console.log(`🔗 Connection established with ${peerId}`);
    } catch (err) {
      console.error('❌ Error setting remote description:', err);
    }
  }

  // Handle incoming ICE candidate
  async handleIceCandidate(peerId, candidate) {
    try {
      const peerConnection = this.peerConnections.get(peerId);
      if (!peerConnection) {
        console.error(`❌ No peer connection for ${peerId}`);
        return;
      }

      await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      console.log(`❄️  ICE candidate added from ${peerId}`);
    } catch (err) {
      console.error(`❌ Error adding ICE candidate from ${peerId}:`, err);
    }
  }

  // Close peer connection
  closePeerConnection(peerId) {
    const peerConnection = this.peerConnections.get(peerId);
    if (peerConnection) {
      peerConnection.close();
      this.peerConnections.delete(peerId);
      console.log(`🚪 Closed connection with ${peerId}`);
    }
  }

  // Close all connections
  closeAllConnections() {
    try {
      console.log('🛑 Closing all connections...');
      
      if (this.statsMonitor) {
        clearInterval(this.statsMonitor);
        this.statsMonitor = null;
        console.log('⏹️  Stats monitor stopped');
      }

      for (const [peerId, pc] of this.peerConnections.entries()) {
        try {
          pc.close();
          console.log(`🔌 Closed connection with ${peerId}`);
        } catch (err) {
          console.error(`Error closing connection with ${peerId}:`, err);
        }
      }
      this.peerConnections.clear();
      console.log('📋 All peer connections cleared');

      if (this.localStream) {
        const trackCount = this.localStream.getTracks().length;
        this.localStream.getTracks().forEach(track => {
          try {
            track.stop();
            console.log(`⏹️  Stopped ${track.kind} track`);
          } catch (err) {
            console.error(`Error stopping ${track.kind} track:`, err);
          }
        });
        this.localStream = null;
        console.log(`✅ Stopped ${trackCount} tracks`);
      }
      
      console.log('🛑 All connections closed successfully');
    } catch (err) {
      console.error('❌ Error closing connections:', err);
    }
  }
}
