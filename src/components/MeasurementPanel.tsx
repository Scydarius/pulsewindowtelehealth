import { Activity, CheckCircle2, CircleAlert, LoaderCircle, Play, RotateCcw, ShieldCheck, Wind } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { type MeasurementUpdate, rppgClient } from '../services/rppgClient';
import { loadPatientMeasurementTrend, savePatientMeasurement, type SavedMeasurement } from '../services/clinicAccess';

type MeasurementPanelProps = { appointmentId: string; role: 'patient' | 'clinician'; invitationToken?: string };

const initialState: MeasurementUpdate = {
  status: 'idle',
  progress: 0,
  signalQuality: 0,
  heartRateBpm: null,
  respiratoryRate: null,
  message: 'Ready when the patient is comfortable and still.',
};

function HeartRateTrend({ samples }: { samples: SavedMeasurement[] }) {
  if (samples.length < 2) return <div className="trend-empty">The 30-second trend will appear here once stable readings arrive.</div>;
  const values = samples.map((sample) => Number(sample.heart_rate_bpm)).filter(Number.isFinite);
  if (values.length < 2) return <div className="trend-empty">Waiting for stable heart-rate observations.</div>;
  const min = Math.min(...values) - 2;
  const max = Math.max(...values) + 2;
  const range = Math.max(1, max - min);
  const points = values.map((value, index) => `${(index / (values.length - 1)) * 100},${42 - ((value - min) / range) * 34}`).join(' ');
  return <div className="trend-chart" role="img" aria-label="Heart rate over the current 30-second camera check"><div className="trend-scale"><span>{Math.round(max)}</span><span>{Math.round(min)}</span></div><svg viewBox="0 0 100 46" preserveAspectRatio="none"><polyline points={points} /></svg><div className="trend-axis"><span>Start</span><span>30 seconds</span></div></div>;
}

function values(value: unknown) { return Array.isArray(value) ? value.map(Number).filter(Number.isFinite) : []; }
function SignalPlot({ title, values: series, tone = 'green', primary = false, detail }: { title: string; values: number[]; tone?: 'green' | 'blue' | 'amber'; primary?: boolean; detail?: string }) {
  if (series.length < 2) return <div className="research-plot-empty">Waiting for live engine telemetry…</div>;
  const min = Math.min(...series); const max = Math.max(...series); const range = Math.max(.0001, max - min);
  const points = series.map((value, index) => `${(index / (series.length - 1)) * 100},${42 - ((value - min) / range) * 34}`).join(' ');
  return <section className={`research-plot research-${tone} ${primary ? 'research-plot-primary' : ''}`}><div><strong>{title}</strong><span>{detail ?? `${series.length} samples`}</span></div><svg viewBox="0 0 100 46" preserveAspectRatio="none" role="img" aria-label={title}><polyline points={points} /></svg></section>;
}
function ResearchDiagnostics({ diagnostics }: { diagnostics?: Record<string, unknown> | null }) {
  if (!diagnostics) return <section className="research-diagnostics"><div className="diagnostics-heading"><div><p className="eyebrow">Clinician monitoring workspace</p><h3>Live plethysmography and DSP</h3></div><span>Research use only</span></div><div className="trend-empty">The patient’s live waveforms, spectra, and processing telemetry will appear here as their camera check starts.</div></section>;
  const engine = (diagnostics.engine ?? {}) as Record<string, unknown>;
  const roi = (diagnostics.roi_weights ?? {}) as Record<string, unknown>;
  const snr = Number(diagnostics.snr_db ?? 0);
  const latency = Number(diagnostics.processing_latency_ms ?? 0);
  const cardiacFrequencies = values(diagnostics.cardiac_spectrum_freq_hz);
  const respirationFrequencies = values(diagnostics.respiration_spectrum_freq_hz);
  const frequencyLabel = (frequencies: number[]) => frequencies.length > 1 ? `${Math.min(...frequencies).toFixed(2)}–${Math.max(...frequencies).toFixed(2)} Hz` : 'Frequency spectrum';
  return <section className="research-diagnostics">
    <div className="diagnostics-heading"><div><p className="eyebrow">Clinician monitoring workspace</p><h3>Live plethysmography and DSP</h3></div><span>Research use only</span></div>
    <div className="diagnostics-grid diagnostics-grid-wide">
      <span><strong>{Number.isFinite(snr) ? `${snr.toFixed(1)} dB` : '—'}</strong>SNR</span>
      <span><strong>{Number(diagnostics.quality_score ?? 0).toFixed(2)}</strong>Signal quality</span>
      <span><strong>{Number.isFinite(latency) ? `${Math.round(latency)} ms` : '—'}</strong>Processing latency</span>
      <span><strong>{String(diagnostics.tracking_state ?? '—')}</strong>Tracking state</span>
      <span><strong>{Number(engine.kalman_bpm ?? 0).toFixed(1)} BPM</strong>Kalman estimate</span>
      <span><strong>±{Number(engine.confidence_interval_bpm ?? 0).toFixed(1)} BPM</strong>95% interval</span>
    </div>
    <div className="roi-grid"><strong>Regions of interest</strong><span>Forehead {Math.round(Number(roi.Forehead ?? 0) * 100)}%</span><span>Left cheek {Math.round(Number(roi['Left Cheek'] ?? 0) * 100)}%</span><span>Right cheek {Math.round(Number(roi['Right Cheek'] ?? 0) * 100)}%</span><span>Face mesh {String(engine.landmarks_detected ?? '—')} points</span><span>Skin {String(engine.skin_pixels ?? '—')} px</span></div>
    <SignalPlot title="Photoplethysmogram (PPG) waveform" values={values(diagnostics.cardiac_waveform)} primary detail="Live filtered optical pulse signal" />
    <div className="research-secondary-plots">
      <SignalPlot title="Respiratory modulation waveform" values={values(diagnostics.respiratory_waveform)} tone="blue" detail="Live respiratory signal" />
      <SignalPlot title="Cardiac power spectrum" values={values(diagnostics.cardiac_spectrum_power)} tone="amber" detail={frequencyLabel(cardiacFrequencies)} />
      <SignalPlot title="Respiratory power spectrum" values={values(diagnostics.respiration_spectrum_power)} tone="blue" detail={frequencyLabel(respirationFrequencies)} />
    </div>
    <div className="engine-line">POS algorithm · motion {Number(engine.motion_velocity ?? 0).toFixed(2)} IOD/s · landmark displacement {Number(engine.motion_displacement_px ?? 0).toFixed(2)} px · spectral entropy {Number(engine.spectral_entropy ?? 0).toFixed(2)} · buffer {String(engine.buffer_samples ?? '—')}/{String(engine.buffer_capacity ?? '—')} samples</div>
  </section>;
}

export function MeasurementPanel({ appointmentId, role, invitationToken }: MeasurementPanelProps) {
  const [measurement, setMeasurement] = useState<MeasurementUpdate>(initialState);
  const stopRef = useRef<(() => void) | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const savedReadingRef = useRef(false);
  const savedSampleIdsRef = useRef(new Set<string>());
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [recordMessage, setRecordMessage] = useState('');
  const [trend, setTrend] = useState<SavedMeasurement[]>([]);

  useEffect(() => () => stopRef.current?.(), []);
  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = cameraStream;
  }, [cameraStream]);

  useEffect(() => {
    if (role !== 'clinician') return;
    let active = true;
    const loadResult = async () => {
      try {
        const readings = await loadPatientMeasurementTrend(appointmentId);
        if (!active || !readings.length) return;
        const latest = readings.at(-1)!;
        setTrend(readings);
        setMeasurement({ status: 'complete', progress: 100, signalQuality: latest.signal_quality, heartRateBpm: latest.heart_rate_bpm, respiratoryRate: latest.respiratory_rate_bpm, message: `${readings.length}-point camera-check trend received`, algorithmVersion: latest.algorithm_version ?? undefined, faceDetected: true, trackingState: 'LOCKED', diagnostics: latest.diagnostics ?? undefined });
      } catch {
        // A clinician may open the call before their authenticated session has refreshed.
      }
    };
    void loadResult();
    const interval = window.setInterval(() => void loadResult(), 3000);
    return () => { active = false; window.clearInterval(interval); };
  }, [appointmentId, role]);

  useEffect(() => {
    const sample = measurement.sample;
    if (role !== 'patient' || !sample || !invitationToken || savedSampleIdsRef.current.has(sample.capturedAt)) return;
    savedSampleIdsRef.current.add(sample.capturedAt);
    void savePatientMeasurement({ appointmentId, invitationToken, heartRateBpm: sample.heartRateBpm, respiratoryRateBpm: sample.respiratoryRate, signalQuality: sample.signalQuality, algorithmVersion: measurement.algorithmVersion, diagnostics: sample.diagnostics })
      .then(() => { if (measurement.status === 'complete') setRecordMessage('30-second trend saved for your clinician.'); })
      .catch(() => setRecordMessage('Reading is visible here, but could not be saved for your clinician.'));
  }, [appointmentId, invitationToken, measurement, role]);

  const startMeasurement = async () => {
    stopRef.current?.();
    savedReadingRef.current = false;
    savedSampleIdsRef.current.clear();
    setRecordMessage('');
    setCameraStream(null);
    setMeasurement({ ...initialState, status: 'preparing', message: 'Preparing measurement…' });
    try {
      stopRef.current = await rppgClient.startMeasurement({ appointmentId, role, invitationToken, onCameraStream: setCameraStream }, setMeasurement);
    } catch (error) {
      setMeasurement({
        ...initialState,
        status: 'failed',
        message: error instanceof Error ? error.message : 'The measurement service is unavailable.',
      });
    }
  };

  const isRunning = measurement.status === 'preparing' || measurement.status === 'measuring';
  const isComplete = measurement.status === 'complete';
  const isPatient = role === 'patient';

  if (isPatient) return (
    <aside className={`patient-camera-check ${isRunning ? 'patient-camera-check-active' : ''}`}>
      <div className="patient-camera-copy"><ShieldCheck size={21} /><div><strong>{isComplete ? 'Camera check complete' : 'Camera check'}</strong><span>{isComplete ? (recordMessage || 'Your clinician can now view the reading.') : 'Only start this when your clinician asks. Results are shown to your clinician, not in this call view.'}</span></div></div>
      {isRunning && <div className="patient-camera-running"><div className={`face-guide-small patient-camera-preview ${cameraStream ? 'camera-active' : ''}`}>{cameraStream ? <video ref={videoRef} autoPlay muted playsInline /> : <span />} {cameraStream && <i className={measurement.faceDetected ? 'face-locked' : ''} />}</div><div><strong>{measurement.faceDetected ? 'Face tracking active' : 'Centre your face'}</strong><span>{measurement.message} · {measurement.progress}%</span></div></div>}
      {measurement.status === 'failed' && <div className="signal-line error"><CircleAlert size={16} /> {measurement.message}</div>}
      <button className="button button-secondary patient-camera-button" onClick={() => void startMeasurement()} disabled={isRunning}>
        {isComplete ? <><RotateCcw size={17} /> Run again</> : <><Play size={17} /> {isRunning ? 'Camera check running…' : 'Enable camera check'}</>}
      </button>
    </aside>
  );

  return (
    <aside className="measurement-panel">
      <div className="section-heading compact">
        <div>
          <p className="eyebrow">Contactless check</p>
          <h2>Vitals measurement</h2>
        </div>
        <span className={`status-dot ${isRunning ? 'active' : ''}`} aria-hidden="true" />
      </div>

      <div className="instruction-card">
        <div className="face-guide-small"><span /></div>
        <div><strong>{measurement.status === 'complete' ? 'Patient reading received' : 'Patient camera status'}</strong><span>{measurement.status === 'complete' ? 'Latest patient reading is shown below.' : 'The patient completes a small camera check from their call screen. Results appear here automatically.'}</span></div>
      </div>

      <div className="live-metrics">
        <article>
          <Activity />
          <span>Pulse</span>
          <strong>{measurement.heartRateBpm ?? '— —'}</strong>
          <small>BPM</small>
        </article>
        <article>
          <Wind />
          <span>Breathing</span>
          <strong>{measurement.respiratoryRate ?? '— —'}</strong>
          <small>breaths/min</small>
        </article>
      </div>

      <section className="measurement-trend">
        <div><strong>Heart-rate trend</strong><span>Current 30-second camera check</span></div>
        <HeartRateTrend samples={trend} />
      </section>

      <ResearchDiagnostics diagnostics={measurement.diagnostics} />

      <div className="progress-block">
        <div className="progress-label"><span>{measurement.message}</span><strong>{measurement.progress}%</strong></div>
        <div className="progress-track"><span style={{ width: `${measurement.progress}%` }} /></div>
        {isRunning && <div className="signal-line"><LoaderCircle className="spin" size={16} /> Signal quality {Math.round(measurement.signalQuality * 100)}%</div>}
        {isComplete && <div className="signal-line success"><CheckCircle2 size={16} /> {recordMessage || (isPatient ? 'Reading ready — saving for your clinician…' : 'Patient result received')}</div>}
        {measurement.status === 'failed' && <div className="signal-line error"><CircleAlert size={16} /> Video consultation remains available</div>}
      </div>

      <p className="clinician-measurement-note">This is the clinician-only results panel. It updates automatically when the patient completes their camera check.</p>

      <p className="clinical-note">Measurements are not intended for diagnosis or emergency assessment.</p>
    </aside>
  );
}
