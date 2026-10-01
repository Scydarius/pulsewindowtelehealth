import { LiveKitRoom, useRemoteParticipants, VideoConference } from '@livekit/components-react';
import { useEffect, useState } from 'react';
import { liveKitUrl } from '../services/livekit';

type LiveKitConnectedRoomProps = {
  token: string;
};

function ConsultationConference() {
  const remoteParticipants = useRemoteParticipants();
  const hasRemote = remoteParticipants.length > 0;
  const [isSwapped, setIsSwapped] = useState(false);

  useEffect(() => {
    if (!hasRemote) setIsSwapped(false);
  }, [hasRemote]);

  const handleContainerClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement | null;
    if (!target) return;

    // Check if clicked the focus toggle / fullscreen button
    const clickedFocusBtn = target.closest('.lk-focus-toggle-button');

    // Or clicked the current PiP mini-window
    const pipSelector = isSwapped
      ? '.lk-participant-tile[data-lk-local-participant="false"]'
      : '.lk-participant-tile[data-lk-local-participant="true"]';
    const clickedPipTile = target.closest(pipSelector);

    // Ignore if clicked on the bottom control bar or chat
    const clickedControl = target.closest('.lk-control-bar, .lk-chat, button:not(.lk-focus-toggle-button)');
    if (clickedControl && !clickedFocusBtn) return;

    if (clickedFocusBtn || clickedPipTile) {
      e.stopPropagation();
      e.preventDefault();
      setIsSwapped((prev) => !prev);
    }
  };

  return (
    <div
      className={`livekit-pip-container ${hasRemote ? 'has-remote-participant' : 'single-participant'} ${isSwapped ? 'is-swapped' : ''}`}
      onClickCapture={hasRemote ? handleContainerClick : undefined}
    >
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
