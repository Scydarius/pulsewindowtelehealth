export type MeasurementStatus = 'idle' | 'preparing' | 'measuring' | 'complete' | 'failed';

export type ResearchDiagnostics = Record<string, unknown>;

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
  diagnostics?: ResearchDiagnostics;
  sample?: { capturedAt: string; heartRateBpm: number; respiratoryRate: number; signalQuality: number; diagnostics?: ResearchDiagnostics };
};

const CAPTURE_WINDOW_MS = 30_000;
const SETUP_TIMEOUT_MS = 90_000;
// The original validated browser stream ran at 15 FPS.  Keeping the browser,
// pipeline timing and face-mesh motion model on the same cadence avoids
// treating normal landmark jitter as continuous head movement.
const CAPTURE_FPS = 15;

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
      progress = Math.min(progress + 1, 100);
      const complete = progress === 100;
      const wave = Math.sin(progress / 7);

      onUpdate({
        status: complete ? 'complete' : 'measuring',
        progress,
        signalQuality: Math.min(0.94, 0.55 + progress / 260),
        heartRateBpm: progress > 12 ? Math.round(72 + wave * 2) : null,
        respiratoryRate: progress > 12 ? 15 : null,
        message: complete ? '30-second measurement complete' : `Recording ${Math.ceil((100 - progress) * .3)}s remaining`,
        algorithmVersion: complete ? 'demo-0.1.0' : undefined,
        sample: progress > 12 && progress % 3 === 0 ? { capturedAt: new Date().toISOString(), heartRateBpm: Math.round(72 + wave * 2), respiratoryRate: 15, signalQuality: Math.min(0.94, 0.55 + progress / 260) } : undefined,
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

    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: CAPTURE_FPS } }, audio: false });
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
    let receivedReady = false;
    let serverFailureMessage = '';
    let lastUpdateAt = 0;
    let latestSample: MeasurementUpdate['sample'];
    let completed = false;
    let recordingStartedAt: number | undefined;
    let captureTimer: number | undefined;
    const finishWindow = () => {
      if (completed || stopped) return;
      completed = true;
      if (interval) window.clearInterval(interval);
      socket.close();
      stream.getTracks().forEach((track) => track.stop());
      video.srcObject = null;
      context.onCameraStream?.(null);
      if (latestSample) {
        onUpdate({ status: 'complete', progress: 100, signalQuality: latestSample.signalQuality, heartRateBpm: latestSample.heartRateBpm, respiratoryRate: latestSample.respiratoryRate, message: '30-second camera check complete', algorithmVersion: 'railway-rppg-2.16', faceDetected: true, trackingState: 'LOCKED', sample: latestSample });
      } else {
        onUpdate({ status: 'failed', progress: 0, signalQuality: 0, heartRateBpm: null, respiratoryRate: null, message: 'No stable reading was received during the 30-second camera check.' });
      }
    };
    const setupTimer = window.setTimeout(() => {
      if (stopped || completed || recordingStartedAt) return;
      stopped = true;
      if (interval) window.clearInterval(interval);
      socket.close();
      stream.getTracks().forEach((track) => track.stop());
      video.srcObject = null;
      context.onCameraStream?.(null);
      onUpdate({ status: 'failed', progress: 0, signalQuality: 0, heartRateBpm: null, respiratoryRate: null, message: 'A stable, well-lit face could not be confirmed. No measurement was recorded.' });
    }, SETUP_TIMEOUT_MS);
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
        }, 1000 / CAPTURE_FPS);
      }
      if (eventData.type === 'telemetry') {
        const cardiac = eventData.cardiac as { bpm?: number } | undefined;
        const respiration = eventData.respiration as { brpm?: number | null } | undefined;
        const quality = Number(eventData.quality_score ?? 0);
        const state = String(eventData.tracking_state ?? 'CALIBRATING');
        const validReadout = eventData.is_valid_readout === true;
        const bpm = Number(cardiac?.bpm);
        const brpm = Number(respiration?.brpm);
        const motionDetected = eventData.motion_detected === true;
        // The engine owns all signal-quality decisions.  The browser must not
        // apply another quality, SNR, movement, or tracking-state threshold.
        const acceptedByEngine = validReadout && Number.isFinite(bpm) && Number.isFinite(brpm);
        const now = Date.now();
        if (acceptedByEngine && !recordingStartedAt) {
          recordingStartedAt = now;
          captureTimer = window.setTimeout(finishWindow, CAPTURE_WINDOW_MS);
        }
        const candidateSample = acceptedByEngine && recordingStartedAt
          ? {
              capturedAt: new Date().toISOString(), heartRateBpm: bpm, respiratoryRate: brpm, signalQuality: quality,
              diagnostics: {
                snr_db: Number(eventData.snr_db ?? 0),
                quality_score: quality,
                tracking_state: state,
                face_detected: eventData.face_detected === true,
                motion_detected: motionDetected,
                processing_latency_ms: Number(eventData.processing_latency_ms ?? 0),
                roi_weights: eventData.roi_weights ?? {},
                cardiac_waveform: (eventData.cardiac as { waveform?: unknown[] } | undefined)?.waveform ?? [],
                respiratory_waveform: (eventData.respiration as { waveform?: unknown[] } | undefined)?.waveform ?? [],
                cardiac_spectrum_freq_hz: eventData.cardiac_spectrum_freq_hz ?? [],
                cardiac_spectrum_power: eventData.cardiac_spectrum_power ?? [],
                respiration_spectrum_freq_hz: eventData.respiration_spectrum_freq_hz ?? [],
                respiration_spectrum_power: eventData.respiration_spectrum_power ?? [],
                engine: eventData.diagnostics ?? {},
              },
            }
          : undefined;
        if (candidateSample) latestSample = candidateSample;
        if (now - lastUpdateAt < 900) return;
        lastUpdateAt = now;
        const sample = candidateSample;
        const captureElapsed = recordingStartedAt ? Math.min(CAPTURE_WINDOW_MS, now - recordingStartedAt) : 0;
        const message = recordingStartedAt ? `Recording · ${Math.ceil((CAPTURE_WINDOW_MS - captureElapsed) / 1000)}s remaining` : state === 'SEARCHING' ? 'Face not found — centre your face in the camera' : motionDetected || state === 'HOLDING' ? 'Movement detected — hold still' : 'Calibrating the rPPG engine…';
        onUpdate({ status: recordingStartedAt ? 'measuring' : 'preparing', progress: recordingStartedAt ? Math.min(99, Math.round((captureElapsed / CAPTURE_WINDOW_MS) * 100)) : 5, signalQuality: quality, heartRateBpm: latestSample?.heartRateBpm ?? null, respiratoryRate: latestSample?.respiratoryRate ?? null, message, algorithmVersion: 'railway-rppg-2.16', faceDetected: eventData.face_detected === true, trackingState: state, diagnostics: candidateSample?.diagnostics, sample });
      }
    });
    socket.addEventListener('error', () => {
      window.clearTimeout(setupTimer); if (captureTimer) window.clearTimeout(captureTimer);
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
      if (!completed) { window.clearTimeout(setupTimer); if (captureTimer) window.clearTimeout(captureTimer); }
      if (!stopped && !completed) onUpdate({ status: 'failed', progress: 0, signalQuality: 0, heartRateBpm: null, respiratoryRate: null, message: serverFailureMessage || (receivedReady ? 'Railway ended the measurement before the 30-second check finished.' : 'Railway rejected the secure measurement connection. Check that its RPPG_TICKET_SECRET exactly matches Vercel.') });
    });

    return () => { stopped = true; window.clearTimeout(setupTimer); if (captureTimer) window.clearTimeout(captureTimer); if (interval) window.clearInterval(interval); socket.close(); stream.getTracks().forEach((track) => track.stop()); video.srcObject = null; context.onCameraStream?.(null); };
  }
}

export const rppgClient: RppgClient = import.meta.env.VITE_USE_MOCK_RPPG === 'false'
  ? new WebSocketRppgClient()
  : new MockRppgClient();
