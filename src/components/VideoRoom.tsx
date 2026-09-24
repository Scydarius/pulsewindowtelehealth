import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, LoaderCircle, Mic, MicOff, PhoneOff, ShieldCheck } from 'lucide-react';
import { fetchLiveKitToken, hasLiveKitConfiguration } from '../services/livekit';

const LiveKitConnectedRoom = lazy(() => import('./LiveKitConnectedRoom'));

type VideoRoomProps = {
  appointmentId: string;
};

export function VideoRoom({ appointmentId }: VideoRoomProps) {
  const [token, setToken] = useState<string>();
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [microphoneEnabled, setMicrophoneEnabled] = useState(true);
  const [cameraError, setCameraError] = useState<string>();
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (hasLiveKitConfiguration) {
      void fetchLiveKitToken({
        roomName: appointmentId,
        identity: 'patient-demo',
        displayName: 'Claire Williams',
        role: 'patient',
      }).then(setToken).catch((error: Error) => setCameraError(error.message));
      return;
    }

    let stream: MediaStream | undefined;
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: 'user' }, audio: false })
      .then((mediaStream) => {
        stream = mediaStream;
        if (videoRef.current) videoRef.current.srcObject = mediaStream;
      })
      .catch(() => setCameraError('Allow camera access to use the consultation preview.'));

    return () => stream?.getTracks().forEach((track) => track.stop());
  }, [appointmentId]);

  useEffect(() => {
    const stream = videoRef.current?.srcObject as MediaStream | null;
    stream?.getVideoTracks().forEach((track) => { track.enabled = cameraEnabled; });
  }, [cameraEnabled]);

  if (hasLiveKitConfiguration && token) {
    return (
      <Suspense fallback={<div className="video-loading"><LoaderCircle className="spin" /> Loading video controls…</div>}>
        <LiveKitConnectedRoom token={token} />
      </Suspense>
    );
  }

  if (hasLiveKitConfiguration && !token && !cameraError) {
    return <div className="video-loading"><LoaderCircle className="spin" /> Joining consultation…</div>;
  }

  return (
    <div className="video-stage">
      <video ref={videoRef} autoPlay muted playsInline className={cameraEnabled ? '' : 'is-hidden'} />
      {!cameraEnabled && <div className="camera-off-state"><CameraOff size={40} /><span>Camera is off</span></div>}
      {cameraError && <div className="camera-permission"><CameraOff size={30} /><strong>Camera unavailable</strong><span>{cameraError}</span></div>}

      <div className="remote-participant">
        <div className="remote-avatar">MP</div>
        <div><strong>Dr Maya Patel</strong><span>Waiting to join</span></div>
      </div>

      <div className="privacy-chip"><ShieldCheck size={15} /> Encrypted consultation</div>

      <div className="call-controls" aria-label="Call controls">
        <button className={!microphoneEnabled ? 'control-off' : ''} onClick={() => setMicrophoneEnabled((value) => !value)} aria-label={microphoneEnabled ? 'Mute microphone' : 'Unmute microphone'}>
          {microphoneEnabled ? <Mic /> : <MicOff />}
        </button>
        <button className={!cameraEnabled ? 'control-off' : ''} onClick={() => setCameraEnabled((value) => !value)} aria-label={cameraEnabled ? 'Turn camera off' : 'Turn camera on'}>
          {cameraEnabled ? <Camera /> : <CameraOff />}
        </button>
        <button className="hang-up" aria-label="Leave consultation"><PhoneOff /></button>
      </div>

      <div className="demo-banner">Video preview · LiveKit connects when environment credentials are added</div>
    </div>
  );
}
