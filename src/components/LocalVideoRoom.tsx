import {
  Camera,
  CameraOff,
  LoaderCircle,
  Mic,
  MicOff,
  PhoneOff,
  ShieldCheck,
  UsersRound,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

type LocalVideoRoomProps = {
  appointmentId: string;
  displayName: string;
  role: 'patient' | 'clinician';
};

type SignalMessage = {
  roomName: string;
  from: string;
  displayName: string;
  type: 'join' | 'ready' | 'offer' | 'answer' | 'candidate' | 'leave';
  payload?: RTCSessionDescriptionInit | RTCIceCandidateInit;
};

type ConnectionState = 'preparing' | 'waiting' | 'connecting' | 'connected' | 'failed';

export default function LocalVideoRoom({ appointmentId, displayName, role }: LocalVideoRoomProps) {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | undefined>(undefined);
  const remoteStreamRef = useRef<MediaStream | undefined>(undefined);
  const peerRef = useRef<RTCPeerConnection | undefined>(undefined);
  const channelRef = useRef<BroadcastChannel | undefined>(undefined);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const makingOfferRef = useRef(false);
  const localIdRef = useRef(`${role}-${crypto.randomUUID()}`);
  const [connectionState, setConnectionState] = useState<ConnectionState>('preparing');
  const [remoteName, setRemoteName] = useState(role === 'patient' ? 'Your clinician' : 'Your patient');
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [microphoneEnabled, setMicrophoneEnabled] = useState(true);
  const [speakerEnabled, setSpeakerEnabled] = useState(true);
  const [error, setError] = useState<string>();

  const sendSignal = useCallback((type: SignalMessage['type'], payload?: SignalMessage['payload']) => {
    channelRef.current?.postMessage({
      roomName: appointmentId,
      from: localIdRef.current,
      displayName,
      type,
      payload,
    } satisfies SignalMessage);
  }, [appointmentId, displayName]);

  const createPeer = useCallback(() => {
    if (peerRef.current) return peerRef.current;

    const peer = new RTCPeerConnection();
    const remoteStream = new MediaStream();
    remoteStreamRef.current = remoteStream;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream;

    localStreamRef.current?.getTracks().forEach((track) => {
      peer.addTrack(track, localStreamRef.current!);
    });

    peer.addEventListener('track', (event) => {
      event.streams[0]?.getTracks().forEach((track) => {
        if (!remoteStream.getTracks().some((existingTrack) => existingTrack.id === track.id)) {
          remoteStream.addTrack(track);
        }
      });
      setConnectionState('connected');
    });

    peer.addEventListener('icecandidate', (event) => {
      if (event.candidate) sendSignal('candidate', event.candidate.toJSON());
    });

    peer.addEventListener('connectionstatechange', () => {
      if (peer.connectionState === 'connected') setConnectionState('connected');
      if (peer.connectionState === 'connecting') setConnectionState('connecting');
      if (peer.connectionState === 'failed' || peer.connectionState === 'disconnected') {
        setConnectionState('failed');
      }
    });

    peerRef.current = peer;
    return peer;
  }, [sendSignal]);

  const startOffer = useCallback(async () => {
    if (makingOfferRef.current) return;
    makingOfferRef.current = true;
    setConnectionState('connecting');
    try {
      const peer = createPeer();
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      sendSignal('offer', offer);
    } finally {
      makingOfferRef.current = false;
    }
  }, [createPeer, sendSignal]);

  const addPendingCandidates = useCallback(async (peer: RTCPeerConnection) => {
    const candidates = pendingCandidatesRef.current.splice(0);
    for (const candidate of candidates) await peer.addIceCandidate(candidate);
  }, []);

  useEffect(() => {
    let active = true;
    const roomName = `pulsewindow-local-${appointmentId}`;
    const channel = new BroadcastChannel(roomName);
    channelRef.current = channel;

    const handleSignal = async (event: MessageEvent<SignalMessage>) => {
      const message = event.data;
      if (!active || message.roomName !== appointmentId || message.from === localIdRef.current) return;

      setRemoteName(message.displayName);

      try {
        if (message.type === 'join') {
          sendSignal('ready');
          if (role === 'clinician') await startOffer();
          return;
        }

        if (message.type === 'ready') {
          if (role === 'clinician') await startOffer();
          return;
        }

        if (message.type === 'offer') {
          setConnectionState('connecting');
          const peer = createPeer();
          await peer.setRemoteDescription(message.payload as RTCSessionDescriptionInit);
          await addPendingCandidates(peer);
          const answer = await peer.createAnswer();
          await peer.setLocalDescription(answer);
          sendSignal('answer', answer);
          return;
        }

        if (message.type === 'answer') {
          const peer = createPeer();
          await peer.setRemoteDescription(message.payload as RTCSessionDescriptionInit);
          await addPendingCandidates(peer);
          return;
        }

        if (message.type === 'candidate') {
          const peer = createPeer();
          if (peer.remoteDescription) {
            await peer.addIceCandidate(message.payload as RTCIceCandidateInit);
          } else {
            pendingCandidatesRef.current.push(message.payload as RTCIceCandidateInit);
          }
          return;
        }

        if (message.type === 'leave') {
          remoteStreamRef.current?.getTracks().forEach((track) => track.stop());
          remoteStreamRef.current = new MediaStream();
          if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStreamRef.current;
          peerRef.current?.close();
          peerRef.current = undefined;
          pendingCandidatesRef.current = [];
          setConnectionState('waiting');
        }
      } catch {
        setConnectionState('failed');
        setError('The local video connection could not be completed. Refresh both portals and try again.');
      }
    };

    channel.addEventListener('message', handleSignal);

    navigator.mediaDevices
      .getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: { echoCancellation: true, noiseSuppression: true },
      })
      .then((stream) => {
        if (!active) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        localStreamRef.current = stream;
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;
        setConnectionState('waiting');
        sendSignal('join');
      })
      .catch(() => {
        setConnectionState('failed');
        setError('Camera and microphone access are required for the consultation.');
      });

    return () => {
      active = false;
      sendSignal('leave');
      channel.removeEventListener('message', handleSignal);
      channel.close();
      peerRef.current?.close();
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      remoteStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, [addPendingCandidates, appointmentId, createPeer, role, sendSignal, startOffer]);

  useEffect(() => {
    localStreamRef.current?.getVideoTracks().forEach((track) => { track.enabled = cameraEnabled; });
  }, [cameraEnabled]);

  useEffect(() => {
    localStreamRef.current?.getAudioTracks().forEach((track) => { track.enabled = microphoneEnabled; });
  }, [microphoneEnabled]);

  useEffect(() => {
    if (remoteVideoRef.current) remoteVideoRef.current.muted = !speakerEnabled;
  }, [speakerEnabled]);

  const connectionCopy = {
    preparing: 'Starting camera…',
    waiting: `Waiting for ${role === 'patient' ? 'clinician' : 'patient'} to join`,
    connecting: `Connecting to ${remoteName}…`,
    connected: `Connected to ${remoteName}`,
    failed: 'Connection unavailable',
  }[connectionState];

  const leaveCall = () => {
    sendSignal('leave');
    peerRef.current?.close();
    peerRef.current = undefined;
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    remoteStreamRef.current?.getTracks().forEach((track) => track.stop());
    setCameraEnabled(false);
    setMicrophoneEnabled(false);
    setConnectionState('waiting');
    setError('You left the consultation. Return to your dashboard when you are ready.');
  };

  return (
    <div className="video-stage local-call-stage">
      <video ref={remoteVideoRef} autoPlay playsInline className="remote-video" />

      {connectionState !== 'connected' && (
        <div className="call-waiting-state">
          {connectionState === 'preparing' || connectionState === 'connecting'
            ? <LoaderCircle className="spin" size={38} />
            : <UsersRound size={40} />}
          <strong>{connectionCopy}</strong>
          <span>{error ?? `Open this appointment from the ${role === 'patient' ? 'clinician' : 'patient'} portal in another tab.`}</span>
        </div>
      )}

      <div className="local-video-tile">
        <video ref={localVideoRef} autoPlay muted playsInline className={cameraEnabled ? '' : 'is-hidden'} />
        {!cameraEnabled && <CameraOff />}
        <span>You · {displayName}</span>
      </div>

      <div className="privacy-chip"><ShieldCheck size={15} /> Local encrypted WebRTC call</div>
      <div className={`connection-chip connection-${connectionState}`}><span />{connectionCopy}</div>

      <div className="call-controls" aria-label="Call controls">
        <button className={!microphoneEnabled ? 'control-off' : ''} onClick={() => setMicrophoneEnabled((value) => !value)} aria-label={microphoneEnabled ? 'Mute microphone' : 'Unmute microphone'}>
          {microphoneEnabled ? <Mic /> : <MicOff />}
        </button>
        <button className={!cameraEnabled ? 'control-off' : ''} onClick={() => setCameraEnabled((value) => !value)} aria-label={cameraEnabled ? 'Turn camera off' : 'Turn camera on'}>
          {cameraEnabled ? <Camera /> : <CameraOff />}
        </button>
        <button className={!speakerEnabled ? 'control-off' : ''} onClick={() => setSpeakerEnabled((value) => !value)} aria-label={speakerEnabled ? 'Mute speaker' : 'Unmute speaker'}>
          {speakerEnabled ? <Volume2 /> : <VolumeX />}
        </button>
        <button className="hang-up" onClick={leaveCall} aria-label="Leave consultation"><PhoneOff /></button>
      </div>

      <div className="demo-banner">Local calling mode · use headphones when testing two tabs on one computer</div>
    </div>
  );
}
