export type MeasurementStatus = 'idle' | 'preparing' | 'measuring' | 'complete' | 'failed';

export type MeasurementUpdate = {
  status: MeasurementStatus;
  progress: number;
  signalQuality: number;
  heartRateBpm: number | null;
  respiratoryRate: number | null;
  message: string;
  algorithmVersion?: string;
};

export interface RppgClient {
  startMeasurement(context: MeasurementContext, onUpdate: (update: MeasurementUpdate) => void): Promise<() => void>;
}

export type MeasurementContext = { appointmentId: string; role: 'patient' | 'clinician'; invitationToken?: string };

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

    socket.addEventListener('message', (event) => {
      const eventData = JSON.parse(event.data) as Record<string, unknown>;
      if (eventData.type === 'ready') {
        onUpdate({ status: 'preparing', progress: 5, signalQuality: 0, heartRateBpm: null, respiratoryRate: null, message: 'Checking lighting and face position…' });
        interval = window.setInterval(() => {
          if (socket.readyState !== WebSocket.OPEN || !drawingContext) return;
          drawingContext.drawImage(video, 0, 0, canvas.width, canvas.height);
          canvas.toBlob((blob) => { if (blob && socket.readyState === WebSocket.OPEN) socket.send(blob); }, 'image/jpeg', 0.75);
        }, 1000 / 15);
      }
      if (eventData.type === 'telemetry') {
        const cardiac = eventData.cardiac as { bpm?: number } | undefined;
        const respiration = eventData.respiration as { brpm?: number | null } | undefined;
        const quality = Number(eventData.quality_score ?? 0);
        const state = String(eventData.tracking_state ?? 'CALIBRATING');
        onUpdate({ status: state === 'SEARCHING' ? 'preparing' : 'measuring', progress: state === 'LOCKED' ? 100 : Math.min(95, Math.round(quality * 100)), signalQuality: quality, heartRateBpm: eventData.is_valid_readout ? cardiac?.bpm ?? null : null, respiratoryRate: eventData.is_valid_readout ? respiration?.brpm ?? null : null, message: state === 'LOCKED' ? 'Signal locked · keep still for a stable reading' : state === 'SEARCHING' ? 'Keep your face in the frame' : state === 'HOLDING' ? 'Hold still while the signal recovers' : 'Calibrating measurement…', algorithmVersion: 'railway-rppg-2.16' });
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

    return () => { if (interval) window.clearInterval(interval); socket.close(); stream.getTracks().forEach((track) => track.stop()); video.srcObject = null; };
  }
}

export const rppgClient: RppgClient = import.meta.env.VITE_USE_MOCK_RPPG === 'false'
  ? new WebSocketRppgClient()
  : new MockRppgClient();
