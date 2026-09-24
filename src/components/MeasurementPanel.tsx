import { Activity, CheckCircle2, CircleAlert, LoaderCircle, Play, RotateCcw, ShieldCheck, Wind } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { type MeasurementUpdate, rppgClient } from '../services/rppgClient';
import { loadLatestPatientMeasurement, savePatientMeasurement } from '../services/clinicAccess';

type MeasurementPanelProps = { appointmentId: string; role: 'patient' | 'clinician'; invitationToken?: string };

const initialState: MeasurementUpdate = {
  status: 'idle',
  progress: 0,
  signalQuality: 0,
  heartRateBpm: null,
  respiratoryRate: null,
  message: 'Ready when the patient is comfortable and still.',
};

export function MeasurementPanel({ appointmentId, role, invitationToken }: MeasurementPanelProps) {
  const [measurement, setMeasurement] = useState<MeasurementUpdate>(initialState);
  const stopRef = useRef<(() => void) | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const savedReadingRef = useRef(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [recordMessage, setRecordMessage] = useState('');

  useEffect(() => () => stopRef.current?.(), []);
  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = cameraStream;
  }, [cameraStream]);

  useEffect(() => {
    if (role !== 'clinician') return;
    let active = true;
    const loadResult = async () => {
      try {
        const latest = await loadLatestPatientMeasurement(appointmentId);
        if (!active || !latest) return;
        setMeasurement({ status: 'complete', progress: 100, signalQuality: latest.signal_quality, heartRateBpm: latest.heart_rate_bpm, respiratoryRate: latest.respiratory_rate_bpm, message: `Patient reading saved ${new Date(latest.measured_at).toLocaleTimeString()}`, algorithmVersion: latest.algorithm_version ?? undefined, faceDetected: true, trackingState: 'LOCKED' });
      } catch {
        // A clinician may open the call before their authenticated session has refreshed.
      }
    };
    void loadResult();
    const interval = window.setInterval(() => void loadResult(), 3000);
    return () => { active = false; window.clearInterval(interval); };
  }, [appointmentId, role]);

  useEffect(() => {
    if (role !== 'patient' || measurement.status !== 'complete' || savedReadingRef.current || !invitationToken || measurement.heartRateBpm === null || measurement.respiratoryRate === null) return;
    savedReadingRef.current = true;
    void savePatientMeasurement({ appointmentId, invitationToken, heartRateBpm: measurement.heartRateBpm, respiratoryRateBpm: measurement.respiratoryRate, signalQuality: measurement.signalQuality, algorithmVersion: measurement.algorithmVersion })
      .then(() => setRecordMessage('Reading saved for your clinician.'))
      .catch(() => setRecordMessage('Reading is visible here, but could not be saved for your clinician.'));
  }, [appointmentId, invitationToken, measurement, role]);

  const startMeasurement = async () => {
    stopRef.current?.();
    savedReadingRef.current = false;
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
