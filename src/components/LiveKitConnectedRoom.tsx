import { LiveKitRoom, useRemoteParticipants, VideoConference } from '@livekit/components-react';
import { liveKitUrl } from '../services/livekit';

type LiveKitConnectedRoomProps = {
  token: string;
};

function ConsultationConference() {
  const remoteParticipants = useRemoteParticipants();
  const hasRemote = remoteParticipants.length > 0;

  return (
    <div className={`livekit-pip-container ${hasRemote ? 'has-remote-participant' : 'single-participant'}`}>
      <VideoConference />
    </div>
  );
}

export default function LiveKitConnectedRoom({ token }: LiveKitConnectedRoomProps) {
  return (
    <div className="livekit-frame" data-lk-theme="default">
      <LiveKitRoom token={token} serverUrl={liveKitUrl} connect video audio>
        <ConsultationConference />
      </LiveKitRoom>
    </div>
  );
}
