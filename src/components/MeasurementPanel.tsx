import { Activity, CheckCircle2, CircleAlert, LoaderCircle, Play, RotateCcw, Wind } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { type MeasurementUpdate, rppgClient } from '../services/rppgClient';

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

  useEffect(() => () => stopRef.current?.(), []);

  const startMeasurement = async () => {
    stopRef.current?.();
    setMeasurement({ ...initialState, status: 'preparing', message: 'Preparing measurement…' });
    try {
      stopRef.current = await rppgClient.startMeasurement({ appointmentId, role, invitationToken }, setMeasurement);
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
        <div className="face-guide-small"><span /></div>
        <div><strong>{isPatient ? 'Face the camera' : 'Patient measurement'}</strong><span>{isPatient ? 'Stay still and breathe normally while PulseWindow measures.' : 'The patient starts their camera-based check from their secure appointment link.'}</span></div>
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
        {isComplete && <div className="signal-line success"><CheckCircle2 size={16} /> Complete · result ready to save</div>}
        {measurement.status === 'failed' && <div className="signal-line error"><CircleAlert size={16} /> Video consultation remains available</div>}
      </div>

      {isPatient ? <button className="button button-primary button-full" onClick={() => void startMeasurement()} disabled={isRunning}>
        {isComplete ? <><RotateCcw size={18} /> Measure again</> : <><Play size={18} /> {isRunning ? 'Measuring…' : 'Start measurement'}</>}
      </button> : <p className="clinician-measurement-note">The patient’s live measurement will be shown here once the clinician results view is connected.</p>}

      <p className="clinical-note">Measurements are not intended for diagnosis or emergency assessment.</p>
    </aside>
  );
}
