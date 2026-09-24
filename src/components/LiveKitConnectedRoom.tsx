import { LiveKitRoom, VideoConference } from '@livekit/components-react';
import { liveKitUrl } from '../services/livekit';

type LiveKitConnectedRoomProps = {
  token: string;
};

export default function LiveKitConnectedRoom({ token }: LiveKitConnectedRoomProps) {
  return (
    <div className="livekit-frame" data-lk-theme="default">
      <LiveKitRoom token={token} serverUrl={liveKitUrl} connect video audio>
        <VideoConference />
      </LiveKitRoom>
    </div>
  );
}
