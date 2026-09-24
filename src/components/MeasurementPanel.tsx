import { Activity, CheckCircle2, CircleAlert, LoaderCircle, Play, RotateCcw, Wind } from 'lucide-react';
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
        <div className={`face-guide-small ${cameraStream ? 'camera-active' : ''}`}>{cameraStream ? <video ref={videoRef} autoPlay muted playsInline /> : <span />} {cameraStream && <i className={measurement.faceDetected ? 'face-locked' : ''} />}</div>
        <div><strong>{isPatient ? (measurement.faceDetected ? 'Face tracking active' : 'Face the camera') : 'Patient measurement'}</strong><span>{isPatient ? (cameraStream ? measurement.message : 'Start the check to open the camera and begin face tracking.') : measurement.status === 'complete' ? 'Latest patient reading is shown below.' : 'The patient starts their camera-based check from their secure appointment link.'}</span></div>
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

      {isPatient ? <button className="button button-primary button-full" onClick={() => void startMeasurement()} disabled={isRunning}>
        {isComplete ? <><RotateCcw size={18} /> Measure again</> : <><Play size={18} /> {isRunning ? 'Measuring…' : 'Start measurement'}</>}
      </button> : <p className="clinician-measurement-note">The patient’s live measurement will be shown here once the clinician results view is connected.</p>}

      <p className="clinical-note">Measurements are not intended for diagnosis or emergency assessment.</p>
    </aside>
  );
}
