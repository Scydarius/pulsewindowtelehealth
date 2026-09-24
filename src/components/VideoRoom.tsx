import { lazy, Suspense, useEffect, useState } from 'react';
import { CameraOff, LoaderCircle } from 'lucide-react';
import { fetchLiveKitToken, hasLiveKitConfiguration } from '../services/livekit';

const LiveKitConnectedRoom = lazy(() => import('./LiveKitConnectedRoom'));
const LocalVideoRoom = lazy(() => import('./LocalVideoRoom'));

type VideoRoomProps = {
  appointmentId: string;
  displayName: string;
  role: 'patient' | 'clinician';
};

export function VideoRoom({ appointmentId, displayName, role }: VideoRoomProps) {
  const [token, setToken] = useState<string>();
  const [connectionError, setConnectionError] = useState<string>();
  const useLiveKit = import.meta.env.VITE_VIDEO_PROVIDER === 'livekit' && hasLiveKitConfiguration;

  useEffect(() => {
    if (!useLiveKit) return;

    void fetchLiveKitToken({
      roomName: appointmentId,
      identity: `${role}-${appointmentId}`,
      displayName,
      role,
    }).then(setToken).catch((error: Error) => setConnectionError(error.message));
  }, [appointmentId, displayName, role, useLiveKit]);

  if (!useLiveKit) {
    return (
      <Suspense fallback={<div className="video-loading"><LoaderCircle className="spin" /> Starting local call…</div>}>
        <LocalVideoRoom appointmentId={appointmentId} displayName={displayName} role={role} />
      </Suspense>
    );
  }

  if (token) {
    return (
      <Suspense fallback={<div className="video-loading"><LoaderCircle className="spin" /> Loading video controls…</div>}>
        <LiveKitConnectedRoom token={token} />
      </Suspense>
    );
  }

  if (connectionError) return (
    <div className="video-stage">
      <div className="camera-permission"><CameraOff size={30} /><strong>Unable to join the consultation</strong><span>{connectionError}</span></div>
    </div>
  );

  return <div className="video-loading"><LoaderCircle className="spin" /> Joining consultation…</div>;
}
