export type MeasurementStatus = 'idle' | 'preparing' | 'measuring' | 'complete' | 'failed';

export type MeasurementUpdate = {
  status: MeasurementStatus;
  progress: number;
  signalQuality: number;
  heartRateBpm: number | null;
  respiratoryRate: number | null;
  message: string;
  algorithmVersion?: string;
  faceDetected?: boolean;
  trackingState?: string;
};

export interface RppgClient {
  startMeasurement(context: MeasurementContext, onUpdate: (update: MeasurementUpdate) => void): Promise<() => void>;
}

export type MeasurementContext = {
  appointmentId: string;
  role: 'patient' | 'clinician';
  invitationToken?: string;
  onCameraStream?: (stream: MediaStream | null) => void;
};

class MockRppgClient implements RppgClient {
  async startMeasurement(_context: MeasurementContext, onUpdate: (update: MeasurementUpdate) => void) {
    let progress = 0;
    let cancelled = false;

    onUpdate({
      status: 'preparing',
      progress,
      signalQuality: 0,
      heartRateBpm: null,
      respiratoryRate: null,
      message: 'Checking lighting and face position…',
    });

    const interval = window.setInterval(() => {
      if (cancelled) return;
      progress = Math.min(progress + 4, 100);
      const complete = progress === 100;
      const wave = Math.sin(progress / 7);

      onUpdate({
        status: complete ? 'complete' : 'measuring',
        progress,
        signalQuality: Math.min(0.94, 0.55 + progress / 260),
        heartRateBpm: progress > 20 ? Math.round(72 + wave * 2) : null,
        respiratoryRate: complete ? 15 : null,
        message: complete ? 'Measurement complete' : 'Keep still and breathe normally',
        algorithmVersion: complete ? 'demo-0.1.0' : undefined,
      });

      if (complete) window.clearInterval(interval);
    }, 320);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }
}

class WebSocketRppgClient implements RppgClient {
  async startMeasurement(context: MeasurementContext, onUpdate: (update: MeasurementUpdate) => void) {
    const response = await fetch('/api/rppg-ticket', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(context),
    });
    const responseText = await response.text();
    let ticket: { websocketUrl?: string; error?: string } = {};
    try { ticket = JSON.parse(responseText) as typeof ticket; } catch { throw new Error('The secure measurement service is temporarily unavailable.'); }
    if (!response.ok || !ticket.websocketUrl) throw new Error(ticket.error ?? 'Unable to start secure measurement.');

    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 15 } }, audio: false });
    context.onCameraStream?.(stream);
    const video = document.createElement('video');
    video.srcObject = stream;
    video.muted = true;
    video.playsInline = true;
    await video.play();
    const canvas = document.createElement('canvas');
    canvas.width = 640; canvas.height = 480;
    const drawingContext = canvas.getContext('2d');
    const socket = new WebSocket(ticket.websocketUrl);
    let interval: number | undefined;

    let stopped = false;
    let receivedTelemetry = false;
    let receivedReady = false;
    let serverFailureMessage = '';
    socket.addEventListener('message', (event) => {
      let eventData: Record<string, unknown>;
      try { eventData = JSON.parse(event.data) as Record<string, unknown>; }
      catch { return; }
      if (eventData.type === 'error') {
        serverFailureMessage = String(eventData.message ?? 'The measurement service rejected this stream.');
        onUpdate({ status: 'failed', progress: 0, signalQuality: 0, heartRateBpm: null, respiratoryRate: null, message: serverFailureMessage });
        return;
      }
      if (eventData.type === 'ready') {
        receivedReady = true;
        onUpdate({ status: 'preparing', progress: 5, signalQuality: 0, heartRateBpm: null, respiratoryRate: null, message: 'Checking lighting and face position…' });
        interval = window.setInterval(() => {
          if (socket.readyState !== WebSocket.OPEN || !drawingContext) return;
          drawingContext.drawImage(video, 0, 0, canvas.width, canvas.height);
          canvas.toBlob((blob) => { if (blob && socket.readyState === WebSocket.OPEN) socket.send(blob); }, 'image/jpeg', 0.75);
        }, 1000 / 15);
      }
      if (eventData.type === 'telemetry') {
        receivedTelemetry = true;
        const cardiac = eventData.cardiac as { bpm?: number } | undefined;
        const respiration = eventData.respiration as { brpm?: number | null } | undefined;
        const quality = Number(eventData.quality_score ?? 0);
        const state = String(eventData.tracking_state ?? 'CALIBRATING');
        const validReadout = eventData.is_valid_readout === true;
        onUpdate({ status: validReadout ? 'complete' : state === 'SEARCHING' ? 'preparing' : 'measuring', progress: validReadout ? 100 : Math.min(95, Math.round(quality * 100)), signalQuality: quality, heartRateBpm: validReadout ? cardiac?.bpm ?? null : null, respiratoryRate: validReadout ? respiration?.brpm ?? null : null, message: validReadout ? 'Face tracked · reading ready' : state === 'SEARCHING' ? 'Face not found — centre your face in the camera' : state === 'HOLDING' ? 'Movement detected — hold still' : 'Face tracked · calibrating measurement…', algorithmVersion: 'railway-rppg-2.16', faceDetected: eventData.face_detected === true, trackingState: state });
      }
    });
    socket.addEventListener('error', () => {
      onUpdate({
        status: 'failed',
        progress: 0,
        signalQuality: 0,
        heartRateBpm: null,
        respiratoryRate: null,
        message: 'The measurement service is unavailable. The consultation can continue.',
      });
    });
    socket.addEventListener('close', () => {
      if (!stopped && !receivedTelemetry) onUpdate({ status: 'failed', progress: 0, signalQuality: 0, heartRateBpm: null, respiratoryRate: null, message: serverFailureMessage || (receivedReady ? 'Railway ended the measurement before it produced a reading.' : 'Railway rejected the secure measurement connection. Check that its RPPG_TICKET_SECRET exactly matches Vercel.') });
    });

    return () => { stopped = true; if (interval) window.clearInterval(interval); socket.close(); stream.getTracks().forEach((track) => track.stop()); video.srcObject = null; context.onCameraStream?.(null); };
  }
}

export const rppgClient: RppgClient = import.meta.env.VITE_USE_MOCK_RPPG === 'false'
  ? new WebSocketRppgClient()
  : new MockRppgClient();
