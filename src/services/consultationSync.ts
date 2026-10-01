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

export type CameraCheckRequestMessage = {
  appointmentId: string;
  clinicianName: string;
  timestamp: number;
};

export type CameraCheckResponseMessage = {
  appointmentId: string;
  patientName: string;
  accepted: boolean;
  timestamp: number;
};

type SyncBroadcastMessage =
  | { type: 'camera_check_sync'; payload: CameraCheckSyncState }
  | { type: 'camera_check_ping'; appointmentId: string; senderRole: 'patient' | 'clinician' }
  | { type: 'camera_check_request'; payload: CameraCheckRequestMessage }
  | { type: 'camera_check_request_cancel'; appointmentId: string }
  | { type: 'camera_check_response'; payload: CameraCheckResponseMessage };

let localBroadcastChannel: BroadcastChannel | null = null;
let activeSupabaseChannel: ReturnType<NonNullable<typeof supabase>['channel']> | null = null;
let currentAppointmentId: string | null = null;
let lastBroadcastTime = 0;
let lastBroadcastStatus = '';
let lastBroadcastCalibrated: boolean | null = null;
let latestLocalState: CameraCheckSyncState | null = null;
let latestLocalRequest: CameraCheckRequestMessage | null = null;

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

  try {
    getBroadcastChannel(appointmentId)?.postMessage(message);
  } catch {
    // Ignore
  }

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
    // Ignore
  }
}

/**
 * Clinician initiates a request for the patient to take a 30s vitals check.
 */
export function broadcastCameraCheckRequest(appointmentId: string, clinicianName: string) {
  const payload: CameraCheckRequestMessage = {
    appointmentId,
    clinicianName,
    timestamp: Date.now(),
  };
  latestLocalRequest = payload;

  const message: SyncBroadcastMessage = {
    type: 'camera_check_request',
    payload,
  };

  try {
    getBroadcastChannel(appointmentId)?.postMessage(message);
  } catch {
    // Ignore
  }

  try {
    const channel = getSupabaseChannel(appointmentId);
    if (channel) {
      void channel.send({
        type: 'broadcast',
        event: 'camera_check_request',
        payload,
      });
    }
  } catch {
    // Ignore
  }
}

/**
 * Clinician cancels the outstanding vitals check request.
 */
export function cancelCameraCheckRequest(appointmentId: string) {
  latestLocalRequest = null;
  const message: SyncBroadcastMessage = {
    type: 'camera_check_request_cancel',
    appointmentId,
  };

  try {
    getBroadcastChannel(appointmentId)?.postMessage(message);
  } catch {
    // Ignore
  }

  try {
    const channel = getSupabaseChannel(appointmentId);
    if (channel) {
      void channel.send({
        type: 'broadcast',
        event: 'camera_check_request_cancel',
        payload: { appointmentId },
      });
    }
  } catch {
    // Ignore
  }
}

/**
 * Patient responds to the clinician's request (consent accepted or declined).
 */
export function broadcastCameraCheckResponse(appointmentId: string, patientName: string, accepted: boolean) {
  if (accepted) latestLocalRequest = null;
  const payload: CameraCheckResponseMessage = {
    appointmentId,
    patientName,
    accepted,
    timestamp: Date.now(),
  };

  const message: SyncBroadcastMessage = {
    type: 'camera_check_response',
    payload,
  };

  try {
    getBroadcastChannel(appointmentId)?.postMessage(message);
  } catch {
    // Ignore
  }

  try {
    const channel = getSupabaseChannel(appointmentId);
    if (channel) {
      void channel.send({
        type: 'broadcast',
        event: 'camera_check_response',
        payload,
      });
    }
  } catch {
    // Ignore
  }
}

/**
 * Request an immediate sync from the patient.
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

export type CameraCheckCallbacks = {
  onRequest?: (request: CameraCheckRequestMessage) => void;
  onRequestCancel?: () => void;
  onResponse?: (response: CameraCheckResponseMessage) => void;
};

/**
 * Subscribe to camera check updates and clinician/patient consent interactions.
 */
export function subscribeToCameraCheck(
  appointmentId: string,
  onUpdate: (state: CameraCheckSyncState) => void,
  onPing?: () => void,
  callbacks?: CameraCheckCallbacks
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
      return;
    }

    if (msg.type === 'camera_check_request' && msg.payload) {
      if (msg.payload.appointmentId === appointmentId) {
        callbacks?.onRequest?.(msg.payload);
      }
      return;
    }

    if (msg.type === 'camera_check_request_cancel') {
      if (msg.appointmentId === appointmentId) {
        callbacks?.onRequestCancel?.();
      }
      return;
    }

    if (msg.type === 'camera_check_response' && msg.payload) {
      if (msg.payload.appointmentId === appointmentId) {
        callbacks?.onResponse?.(msg.payload);
      }
      return;
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
    channel.on('broadcast', { event: 'camera_check_request' }, ({ payload }) => {
      if (payload) {
        handleMessage({ type: 'camera_check_request', payload: payload as CameraCheckRequestMessage });
      }
    });
    channel.on('broadcast', { event: 'camera_check_request_cancel' }, ({ payload }) => {
      handleMessage({ type: 'camera_check_request_cancel', appointmentId: (payload as { appointmentId?: string })?.appointmentId ?? appointmentId });
    });
    channel.on('broadcast', { event: 'camera_check_response' }, ({ payload }) => {
      if (payload) {
        handleMessage({ type: 'camera_check_response', payload: payload as CameraCheckResponseMessage });
      }
    });
  }

  // If there's an active in-memory state, dispatch it
  if (latestLocalState && latestLocalState.appointmentId === appointmentId) {
    onUpdate(latestLocalState);
  }

  // If there's an active in-memory request pending, dispatch it
  if (latestLocalRequest && latestLocalRequest.appointmentId === appointmentId) {
    callbacks?.onRequest?.(latestLocalRequest);
  }

  return () => {
    bc?.removeEventListener('message', bcHandler);
  };
}
