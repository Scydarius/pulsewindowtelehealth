import { supabase } from './supabase';

export type CameraCheckSyncState = {
  appointmentId: string;
  senderRole: 'patient' | 'clinician';
  timestamp: number;
  status: 'idle' | 'preparing' | 'measuring' | 'complete' | 'failed';
  isRecording: boolean;
  progress: number;
  secondsRemaining: number;
  isCalibrating: boolean;
  faceDetected: boolean;
  motionDetected: boolean;
  heartRateBpm: number | null;
  respiratoryRate: number | null;
  signalQuality: number;
  message: string;
  algorithmVersion?: string;
  diagnostics?: Record<string, unknown> | null;
  patientName?: string;
  clinicianName?: string;
};

type SyncBroadcastMessage =
  | { type: 'camera_check_sync'; payload: CameraCheckSyncState }
  | { type: 'camera_check_ping'; appointmentId: string; senderRole: 'patient' | 'clinician' };

let localBroadcastChannel: BroadcastChannel | null = null;
let activeSupabaseChannel: ReturnType<NonNullable<typeof supabase>['channel']> | null = null;
let currentAppointmentId: string | null = null;
let lastBroadcastTime = 0;
let lastBroadcastStatus = '';
let lastBroadcastCalibrated: boolean | null = null;
let latestLocalState: CameraCheckSyncState | null = null;

const THROTTLE_MS = 250;

function getBroadcastChannel(appointmentId: string): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null;
  if (!localBroadcastChannel || currentAppointmentId !== appointmentId) {
    localBroadcastChannel?.close();
    localBroadcastChannel = new BroadcastChannel(`ventricura-camera-${appointmentId}`);
    currentAppointmentId = appointmentId;
  }
  return localBroadcastChannel;
}

function getSupabaseChannel(appointmentId: string) {
  if (!supabase) return null;
  if (!activeSupabaseChannel || currentAppointmentId !== appointmentId) {
    if (activeSupabaseChannel) void supabase.removeChannel(activeSupabaseChannel);
    activeSupabaseChannel = supabase.channel(`consultation-camera-${appointmentId}`, {
      config: { broadcast: { self: false } },
    });
    activeSupabaseChannel.subscribe();
    currentAppointmentId = appointmentId;
  }
  return activeSupabaseChannel;
}

/**
 * Broadcast patient camera check status to clinician in real time.
 * Dispatches via both BroadcastChannel (for local cross-tab demo/testing) and
 * Supabase Realtime Broadcast (for remote cross-device consultations).
 */
export function broadcastCameraCheckState(
  appointmentId: string,
  state: Omit<CameraCheckSyncState, 'appointmentId' | 'senderRole' | 'timestamp'>,
  role: 'patient' | 'clinician' = 'patient'
) {
  const now = Date.now();
  const fullState: CameraCheckSyncState = {
    ...state,
    appointmentId,
    senderRole: role,
    timestamp: now,
  };

  latestLocalState = fullState;

  // Immediate send on important transitions (starting, completing, failing, calibration flip)
  const isTransition =
    state.status !== lastBroadcastStatus ||
    state.isCalibrating !== lastBroadcastCalibrated ||
    state.status === 'complete' ||
    state.status === 'failed';

  if (!isTransition && now - lastBroadcastTime < THROTTLE_MS) {
    return;
  }

  lastBroadcastTime = now;
  lastBroadcastStatus = state.status;
  lastBroadcastCalibrated = state.isCalibrating;

  const message: SyncBroadcastMessage = {
    type: 'camera_check_sync',
    payload: fullState,
  };

  // 1. Post to local browser BroadcastChannel
  try {
    const bc = getBroadcastChannel(appointmentId);
    bc?.postMessage(message);
  } catch {
    // Ignore BroadcastChannel errors in restrictive sandbox environments
  }

  // 2. Post to Supabase Realtime broadcast channel
  try {
    const channel = getSupabaseChannel(appointmentId);
    if (channel) {
      void channel.send({
        type: 'broadcast',
        event: 'camera_check_sync',
        payload: fullState,
      });
    }
  } catch {
    // Ignore network or broadcast errors
  }
}

/**
 * Request an immediate sync from the patient (e.g. when clinician mounts or reconnects).
 */
export function requestCameraCheckState(appointmentId: string, role: 'patient' | 'clinician' = 'clinician') {
  const ping: SyncBroadcastMessage = {
    type: 'camera_check_ping',
    appointmentId,
    senderRole: role,
  };

  try {
    getBroadcastChannel(appointmentId)?.postMessage(ping);
  } catch {
    // ignore
  }

  try {
    const channel = getSupabaseChannel(appointmentId);
    if (channel) {
      void channel.send({
        type: 'broadcast',
        event: 'camera_check_ping',
        payload: ping,
      });
    }
  } catch {
    // ignore
  }
}

/**
 * Subscribe to camera check state updates.
 * Clinicians use this to receive live patient recording events.
 * Patients also listen for 'ping' events to immediately reply with their current state.
 */
export function subscribeToCameraCheck(
  appointmentId: string,
  onUpdate: (state: CameraCheckSyncState) => void,
  onPing?: () => void
): () => void {
  let latestTimestamp = 0;

  const handleMessage = (msg: SyncBroadcastMessage) => {
    if (msg.type === 'camera_check_ping') {
      if (msg.appointmentId === appointmentId) {
        onPing?.();
      }
      return;
    }

    if (msg.type === 'camera_check_sync' && msg.payload) {
      const payload = msg.payload;
      if (payload.appointmentId !== appointmentId) return;
      if (payload.timestamp < latestTimestamp) return;
      latestTimestamp = payload.timestamp;
      onUpdate(payload);
    }
  };

  // 1. Listen on BroadcastChannel
  const bc = getBroadcastChannel(appointmentId);
  const bcHandler = (event: MessageEvent<SyncBroadcastMessage>) => {
    if (event.data) handleMessage(event.data);
  };
  bc?.addEventListener('message', bcHandler);

  // 2. Listen on Supabase Realtime broadcast
  const channel = getSupabaseChannel(appointmentId);
  if (channel) {
    channel.on('broadcast', { event: 'camera_check_sync' }, ({ payload }) => {
      if (payload) {
        handleMessage({ type: 'camera_check_sync', payload: payload as CameraCheckSyncState });
      }
    });
    channel.on('broadcast', { event: 'camera_check_ping' }, () => {
      onPing?.();
    });
  }

  // If there's already a recent local state in memory for this appointment, dispatch it immediately
  if (latestLocalState && latestLocalState.appointmentId === appointmentId) {
    onUpdate(latestLocalState);
  }

  return () => {
    bc?.removeEventListener('message', bcHandler);
  };
}
