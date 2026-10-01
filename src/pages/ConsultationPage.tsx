import { ArrowLeft, CheckCircle2, Clock3, Pill, UserRound, Video } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { MeasurementPanel } from '../components/MeasurementPanel';
import { VideoRoom } from '../components/VideoRoom';
import { subscribeToCameraCheck, type CameraCheckSyncState } from '../services/consultationSync';

export function ConsultationPage() {
  const { appointmentId = 'demo' } = useParams();
  const [searchParams] = useSearchParams();
  const role = searchParams.get('role') === 'clinician' ? 'clinician' : 'patient';
  const invitationToken = searchParams.get('invite') ?? undefined;
  const displayName = role === 'clinician' ? 'Clinician' : 'Patient';
  const dashboardPath = role === 'clinician' ? '/clinician' : '/join';

  const [patientSync, setPatientSync] = useState<CameraCheckSyncState | null>(null);
  const [showCompleteNotice, setShowCompleteNotice] = useState(false);

  useEffect(() => {
    if (role !== 'clinician') return;
    const unsub = subscribeToCameraCheck(appointmentId, (sync) => {
      setPatientSync(sync);
      if (sync.status === 'complete') {
        setShowCompleteNotice(true);
        const timer = setTimeout(() => setShowCompleteNotice(false), 7000);
        return () => clearTimeout(timer);
      }
    });
    return unsub;
  }, [appointmentId, role]);

  return (
    <div className={`consultation-page ventricura-consultation ${role === 'clinician' ? 'clinician-consultation' : 'patient-consultation'}`}>
      <header className="consultation-heading consultation-toolbar">
        <Link to={dashboardPath} className="back-link"><ArrowLeft size={18} /> Leave consultation</Link>
        <div className="consultation-person"><div className="avatar"><UserRound size={19} /></div><div><strong>{role === 'clinician' ? 'Clinician workspace' : 'Patient appointment'}</strong><span>Secure video appointment</span></div></div>
        <div className="call-time"><span className="live-dot" /><Clock3 size={16} /> 00:00</div>
      </header>

      <main className={`consultation-grid consultation-workspace ${role === 'patient' ? 'patient-consultation-grid' : ''}`}>
        <section className="video-column consultation-video-panel">
          <div className="consultation-video-heading">
            <div><p className="eyebrow">Live room</p><h1>{role === 'clinician' ? 'Patient video' : 'Your video appointment'}</h1></div>
            <span><Video size={15} /> Connected room</span>
          </div>

          {role === 'clinician' && patientSync?.isRecording && (
            <div className="clinician-video-reading-alert" role="status" aria-live="polite">
              <div className="reading-alert-top">
                <div className="reading-indicator-radar">
                  <span className="radar-core" />
                  <span className="radar-ring" />
                </div>
                <div className="reading-alert-text">
                  <div className="reading-alert-title">
                    <strong>PATIENT CAMERA CHECK IN PROGRESS</strong>
                    <span className="reading-time-badge">
                      <Clock3 size={11} /> {patientSync.secondsRemaining > 0 ? `${patientSync.secondsRemaining}s remaining` : 'Finalizing…'}
                    </span>
                  </div>
                  <p className="reading-alert-subtext">
                    {patientSync.motionDetected ? (
                      <span className="warning">⚠️ Patient movement detected — remind patient to remain still while baseline settles</span>
                    ) : !patientSync.faceDetected ? (
                      <span className="warning">⚠️ Patient face not detected — advise patient to center face in camera</span>
                    ) : patientSync.isCalibrating ? (
                      'Establishing 30-second optical baseline — remind patient to remain still and breathe naturally'
                    ) : (
                      'Optical signal locked — stabilizing 30s quality-weighted clinical average'
                    )}
                  </p>
                </div>
              </div>
              <div className="reading-progress-track">
                <div className="reading-progress-bar" style={{ width: `${Math.max(5, patientSync.progress)}%` }} />
              </div>
            </div>
          )}

          {role === 'clinician' && showCompleteNotice && (
            <div className="clinician-video-reading-complete" role="status">
              <CheckCircle2 size={16} />
              <span>
                <strong>Patient reading complete:</strong> {patientSync?.heartRateBpm != null ? `${Math.round(patientSync.heartRateBpm)} BPM` : ''} {patientSync?.respiratoryRate != null ? `· ${(Math.round(patientSync.respiratoryRate * 10) / 10).toFixed(1)} /min` : ''} · Results locked into chart
              </span>
            </div>
          )}

          <VideoRoom appointmentId={appointmentId} displayName={displayName} role={role} invitationToken={invitationToken} />
          <div className="medication-context"><div><Pill /></div><span><strong>Appointment privacy</strong>This call is available only to the clinician and the holder of the secure patient link.</span></div>
        </section>
        <section className="consultation-measurements-panel">
          {role === 'patient' && <MeasurementPanel appointmentId={appointmentId} role={role} invitationToken={invitationToken} />}
          {role === 'clinician' && <MeasurementPanel appointmentId={appointmentId} role={role} invitationToken={invitationToken} />}
        </section>
      </main>
    </div>
  );
}
