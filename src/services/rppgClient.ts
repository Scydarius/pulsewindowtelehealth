import {
  type CardiacData,
  type RespirationData,
  type TelemetryDiagnostics,
  type TelemetryPayload,
} from '../types/rppg';

export type {
  CardiacData,
  RespirationData,
  TelemetryDiagnostics,
  TelemetryPayload,
};

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
const ACTIVE_RPPG_ALGORITHM = 'POS';
// Keep capture in lockstep with the API session. The engine, rather than the
// browser, owns all temporal signal processing.
const CAPTURE_FPS = 30;

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
      const isCalibrated = progress >= 60;
      const wave = Math.sin(progress / 7);
      const remainingSeconds = Math.max(0, Math.ceil((60 - progress) * 0.5));
      const bpm = isCalibrated ? Math.round(72 + wave * 2) : null;
      const brpm = isCalibrated ? 15 : null;
      const quality = Math.min(0.94, 0.55 + progress / 260);

      const mockDiagnostics: TelemetryPayload = {
        type: 'telemetry',
        timestamp: Date.now() / 1000,
        session_id: 'mock-session',
        frame_index: progress * 10,
        face_detected: true,
        motion_detected: false,
        tracking_state: isCalibrated ? 'LOCKED' : 'CALIBRATING',
        is_valid_readout: isCalibrated,
        snr_db: 6.8,
        quality_score: quality,
        cardiac: {
          bpm,
          clinical_bpm: bpm,
          session_average_bpm: isCalibrated ? 72 : null,
          confidence_interval_bpm: 1.8,
          kalman_bpm: bpm ?? 71.5,
          hrv_rmssd_ms: isCalibrated ? 42 : null,
          hrv_sdnn_ms: isCalibrated ? 55 : null,
          hrv_pnn50_pct: isCalibrated ? 18 : null,
          hrv_lf_hf_ratio: isCalibrated ? 1.25 : null,
          stress_index: isCalibrated ? 28 : null,
          stress_score: isCalibrated ? 28 : null,
          stress_level: 'Normal',
          peak_freq_hz: 1.2,
          waveform_sample: 0.1,
          waveform: [0.1, 0.2, 0.5, 0.8, 0.3, -0.2],
        },
        respiration: {
          brpm,
          clinical_brpm: brpm,
          session_average_brpm: isCalibrated ? 15 : null,
          freq_hz: 0.25,
          phase: 'Inhaling',
          phase_pct: 45,
          depth: 'Normal',
          is_apnea: false,
          ie_ratio: '1:2',
          rqi_pct: 92,
          rrv_sdnn_s: 0.2,
          rsa_gain_bpm: 4.5,
          volumetric_symmetry: 'Normal',
          speech_detected: false,
          burg_pole_radius: null,
          burg_pole_freq: null,
          waveform_sample: 0.2,
          waveform: [0.1, 0.3, 0.6, 0.4, 0.1],
        },
        roi_weights: { Forehead: 0.4, 'Left Cheek': 0.3, 'Right Cheek': 0.3 },
        ambient_canceling: true,
        ambient_cancellation_db: 12.4,
        processing_latency_ms: 18,
        diagnostics: {
          is_calibrated: isCalibrated,
          calibration_progress_pct: Math.min(100, Math.round((progress / 60) * 100)),
          calibration_seconds_remaining: remainingSeconds,
          calibration_seconds_elapsed: progress * 0.5,
          calibration_duration_seconds: 30,
          motion_velocity: 0.05,
          motion_displacement_px: 1.2,
          spectral_entropy: 0.45,
          skin_pixels: 42000,
          landmarks_detected: 468,
          confidence_interval_bpm: 1.8,
          kalman_bpm: bpm ?? 71.5,
        },
      };

      const message = complete
        ? '30-second camera check complete'
        : isCalibrated
        ? '● LIVE MONITORING — 30-second baseline established'
        : `Establishing 30s baseline (${remainingSeconds}s left) — keep still & breathe naturally`;

      onUpdate({
        status: complete ? 'complete' : 'measuring',
        progress,
        signalQuality: quality,
        heartRateBpm: bpm,
        respiratoryRate: brpm,
        message,
        algorithmVersion: complete ? 'demo-0.1.0' : undefined,
        diagnostics: mockDiagnostics as unknown as ResearchDiagnostics,
        sample: isCalibrated && progress % 3 === 0 && bpm !== null && brpm !== null
          ? { capturedAt: new Date().toISOString(), heartRateBpm: bpm, respiratoryRate: brpm, signalQuality: quality, diagnostics: mockDiagnostics as unknown as ResearchDiagnostics }
          : undefined,
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
    let encodingFrame = false;

    let stopped = false;
    let receivedReady = false;
    let serverFailureMessage = '';
    let latestSample: MeasurementUpdate['sample'];
    let latestSessionBpm: number | null = null;
    let latestSessionBrpm: number | null = null;
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
        const finalBpm = latestSessionBpm ?? latestSample.heartRateBpm;
        const finalBrpm = latestSessionBrpm ?? latestSample.respiratoryRate;
        onUpdate({
          status: 'complete',
          progress: 100,
          signalQuality: latestSample.signalQuality,
          heartRateBpm: finalBpm,
          respiratoryRate: finalBrpm,
          message: '30-second camera check complete',
          algorithmVersion: 'railway-rppg-2.16',
          faceDetected: true,
          trackingState: 'LOCKED',
          diagnostics: latestSample.diagnostics,
          sample: { ...latestSample, heartRateBpm: finalBpm, respiratoryRate: finalBrpm },
        });
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
          // Mirror the live demo transport: do not pile JPEG encodes or frames
          // onto a slow connection. The rPPG engine receives one raw camera
          // frame at a time, at up to 30 FPS, with no browser-side averaging.
          if (socket.readyState !== WebSocket.OPEN || !drawingContext || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || encodingFrame || socket.bufferedAmount > 128_000) return;
          drawingContext.drawImage(video, 0, 0, canvas.width, canvas.height);
          encodingFrame = true;
          canvas.toBlob((blob) => {
            encodingFrame = false;
            if (blob && socket.readyState === WebSocket.OPEN) socket.send(blob);
          }, 'image/jpeg', 0.75);
        }, 1000 / CAPTURE_FPS);
      }
      if (eventData.type === 'telemetry') {
        const payload = eventData as unknown as TelemetryPayload;
        const cardiac = payload.cardiac;
        const respiration = payload.respiration;
        const diag = (payload.diagnostics ?? {}) as TelemetryDiagnostics;
        const quality = Number(payload.quality_score ?? 0);
        const state = String(payload.tracking_state ?? 'CALIBRATING');
        const validReadout = payload.is_valid_readout === true;
        const motionDetected = payload.motion_detected === true;

        const isCalibrated = diag.is_calibrated === true;
        const calibRemaining = Number(diag.calibration_seconds_remaining ?? 0);
        const calibProgress = Number(diag.calibration_progress_pct ?? 0);

        // Use clinical_bpm and clinical_brpm (anchored to 30s quality-weighted average)
        const bpmRaw = cardiac?.clinical_bpm ?? cardiac?.bpm;
        const brpmRaw = respiration?.clinical_brpm ?? respiration?.brpm;
        const bpm = bpmRaw != null && Number.isFinite(Number(bpmRaw)) ? Number(bpmRaw) : null;
        const brpm = brpmRaw != null && Number.isFinite(Number(brpmRaw)) ? Number(brpmRaw) : null;

        // Keep track of explicit 30s session averages for final reading & export
        if (cardiac?.session_average_bpm != null && Number.isFinite(Number(cardiac.session_average_bpm))) {
          latestSessionBpm = Number(cardiac.session_average_bpm);
        }
        if (respiration?.session_average_brpm != null && Number.isFinite(Number(respiration.session_average_brpm))) {
          latestSessionBrpm = Number(respiration.session_average_brpm);
        }

        // The engine owns all signal-quality decisions. The browser accepts
        // vitals only when engine marks readout valid, calibrated, and numeric.
        const acceptedByEngine = isCalibrated && validReadout && bpm !== null && brpm !== null;
        const now = Date.now();

        if (acceptedByEngine && !recordingStartedAt) {
          recordingStartedAt = now;
          // When 30s calibration baseline is established, finalize shortly after capturing the reading.
          // If calibration was set to 0s (dev mode), use the full window.
          const duration = Number(diag.calibration_duration_seconds ?? 30);
          const waitMs = duration > 0 ? 2500 : CAPTURE_WINDOW_MS;
          captureTimer = window.setTimeout(finishWindow, waitMs);
        }

        const candidateSample = acceptedByEngine && bpm !== null && brpm !== null
          ? {
              capturedAt: new Date().toISOString(),
              heartRateBpm: bpm,
              respiratoryRate: brpm,
              signalQuality: quality,
              // Save the complete telemetry message verbatim.
              diagnostics: eventData,
            }
          : undefined;

        if (candidateSample) latestSample = candidateSample;
        const sample = candidateSample;

        let message = '';
        let progress = 0;

        if (!payload.face_detected) {
          message = 'Face not found — centre your face in the camera';
          progress = 5;
        } else if (motionDetected) {
          message = isCalibrated
            ? 'Movement detected — hold still'
            : `Movement detected (${Math.ceil(calibRemaining)}s left) — hold still while baseline settles`;
          progress = isCalibrated ? 99 : Math.max(5, Math.min(99, Math.round(calibProgress)));
        } else if (!isCalibrated) {
          const secondsLeft = Math.ceil(calibRemaining);
          message = `Establishing 30s baseline (${secondsLeft}s left) — keep still & breathe naturally`;
          progress = Math.max(5, Math.min(99, Math.round(calibProgress)));
        } else {
          message = '● LIVE MONITORING — 30-second baseline established';
          progress = 100;
        }

        onUpdate({
          status: recordingStartedAt || isCalibrated ? 'measuring' : 'preparing',
          progress,
          signalQuality: quality,
          heartRateBpm: isCalibrated ? (bpm ?? latestSample?.heartRateBpm ?? null) : null,
          respiratoryRate: isCalibrated ? (brpm ?? latestSample?.respiratoryRate ?? null) : null,
          message,
          algorithmVersion: `${ACTIVE_RPPG_ALGORITHM.toLowerCase()}-rppg-2.16`,
          faceDetected: payload.face_detected === true,
          trackingState: isCalibrated ? (payload.tracking_state ?? 'LOCKED') : 'CALIBRATING',
          diagnostics: eventData,
          sample,
        });
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

// Production should use the Railway signal service unless mock mode is
// explicitly requested for local interface development.
export const rppgClient: RppgClient = import.meta.env.VITE_USE_MOCK_RPPG === 'true'
  ? new MockRppgClient()
  : new WebSocketRppgClient();
