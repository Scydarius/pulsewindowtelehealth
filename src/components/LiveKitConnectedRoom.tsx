import {
  ConnectionStateToast,
  ControlBar,
  LiveKitRoom,
  ParticipantTile,
  RoomAudioRenderer,
  useTracks,
} from '@livekit/components-react';
import { Track } from 'livekit-client';
import { ArrowLeftRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import { liveKitUrl } from '../services/livekit';

type LiveKitConnectedRoomProps = {
  token: string;
};

function ConsultationVideoLayout() {
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  );

  const localTrack = tracks.find((t) => t.participant.isLocal);
  const remoteScreenShare = tracks.find((t) => !t.participant.isLocal && t.source === Track.Source.ScreenShare);
  const remoteCamera = tracks.find((t) => !t.participant.isLocal && t.source === Track.Source.Camera);
  const remoteTrack = remoteScreenShare ?? remoteCamera;

  const [isSwapped, setIsSwapped] = useState(false);

  // If remote participant disconnects, reset swap
  useEffect(() => {
    if (!remoteTrack) {
      setIsSwapped(false);
    }
  }, [remoteTrack]);

  // If alone in room, display local user full size
  if (!remoteTrack) {
    return (
      <div className="consultation-stage-inner">
        <div className="stage-single-view">
          {localTrack ? (
            <ParticipantTile trackRef={localTrack} />
          ) : (
            <div className="video-loading">Connecting camera…</div>
          )}
        </div>
        <ControlBar controls={{ chat: false, settings: false }} />
        <RoomAudioRenderer />
        <ConnectionStateToast />
      </div>
    );
  }

  // Default: remote is large main view, local is small corner PiP
  // Swapped: local is large main view, remote is small corner PiP
  const mainTrack = isSwapped ? localTrack : remoteTrack;
  const pipTrack = isSwapped ? remoteTrack : localTrack;

  return (
    <div className="consultation-stage-inner">
      <div className="consultation-pip-stage">
        {/* Main Fullview Participant */}
        <div className="main-video-view">
          {mainTrack && <ParticipantTile trackRef={mainTrack} />}
        </div>

        {/* Small Picture-in-Picture Mini-Window in the bottom-right corner */}
        {pipTrack && (
          <div
            className="pip-video-view"
            onClick={() => setIsSwapped((prev) => !prev)}
            title="Click to swap who is in fullscreen and who is in PiP"
          >
            <ParticipantTile trackRef={pipTrack} />
            <button
              type="button"
              className="pip-swap-btn"
              onClick={(e) => {
                e.stopPropagation();
                setIsSwapped((prev) => !prev);
              }}
              title="Swap video views"
              aria-label="Swap video views"
            >
              <ArrowLeftRight size={13} />
            </button>
            <span className="pip-label">{isSwapped ? 'Remote' : 'You'}</span>
          </div>
        )}
      </div>

      <ControlBar controls={{ chat: false, settings: false }} />
      <RoomAudioRenderer />
      <ConnectionStateToast />
    </div>
  );
}

export default function LiveKitConnectedRoom({ token }: LiveKitConnectedRoomProps) {
  return (
    <div className="livekit-frame" data-lk-theme="default">
      <LiveKitRoom token={token} serverUrl={liveKitUrl} connect video audio>
        <ConsultationVideoLayout />
      </LiveKitRoom>
    </div>
  );
}
