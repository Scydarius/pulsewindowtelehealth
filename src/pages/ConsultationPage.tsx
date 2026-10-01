import { ArrowLeft, CheckCircle2, Clock3, Pill, UserRound, Video } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { MeasurementPanel } from '../components/MeasurementPanel';
import { VideoRoom } from '../components/VideoRoom';
import { fetchPatientInvitation } from '../services/clinicAccess';
import { loadConsultationDetails } from '../services/clinicianData';
import { subscribeToCameraCheck, type CameraCheckSyncState } from '../services/consultationSync';

function getCallStartTime(appointmentId: string): number {
  if (typeof window === 'undefined') return Date.now();
  const storageKey = `ventricura_call_start_${appointmentId}`;
  try {
    const saved = sessionStorage.getItem(storageKey);
    if (saved) {
      const parsed = parseInt(saved, 10);
      if (!isNaN(parsed) && Date.now() - parsed >= 0 && Date.now() - parsed < 12 * 3600 * 1000) {
        return parsed;
      }
    }
  } catch {}
  const now = Date.now();
  try {
    sessionStorage.setItem(storageKey, String(now));
  } catch {}
  return now;
}

function formatCallDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  if (hours > 0) {
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  }
  return `${pad(minutes)}:${pad(seconds)}`;
}

export function ConsultationPage() {
  const { appointmentId = 'demo' } = useParams();
  const [searchParams] = useSearchParams();
  const role = searchParams.get('role') === 'clinician' ? 'clinician' : 'patient';
  const invitationToken = searchParams.get('invite') ?? undefined;

  const defaultClinicianName = searchParams.get('clinicianName') || (appointmentId === 'demo' ? 'Dr Taylor Morgan' : 'Clinician');
  const defaultPatientName = searchParams.get('patientName') || (appointmentId === 'demo' ? 'Sarah Jenkins' : 'Patient');

  const [clinicianName, setClinicianName] = useState(defaultClinicianName);
  const [patientName, setPatientName] = useState(defaultPatientName);

  const displayName = role === 'clinician' ? clinicianName : patientName;
  const dashboardPath = role === 'clinician' ? '/clinician' : '/join';

  const [patientSync, setPatientSync] = useState<CameraCheckSyncState | null>(null);
  const [showCompleteNotice, setShowCompleteNotice] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Live call timer counting up from appointment start
  useEffect(() => {
    const startTime = getCallStartTime(appointmentId);
    const update = () => {
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startTime) / 1000)));
    };
    update();
    const interval = window.setInterval(update, 1000);
    return () => window.clearInterval(interval);
  }, [appointmentId]);

  // Load participant names from appointment or patient invite
  useEffect(() => {
    let active = true;
    if (role === 'clinician') {
      void loadConsultationDetails(appointmentId).then((details) => {
        if (!active || !details) return;
        if (details.clinicianName && details.clinicianName !== 'Clinician') setClinicianName(details.clinicianName);
        if (details.patientName && details.patientName !== 'Patient') setPatientName(details.patientName);
      }).catch(() => {});
    } else if (role === 'patient' && invitationToken) {
      void fetchPatientInvitation(invitationToken).then((details) => {
        if (!active || !details) return;
        if (details.clinicianName && details.clinicianName !== 'Your clinician') setClinicianName(details.clinicianName);
        if (details.patientName && details.patientName !== 'Patient') setPatientName(details.patientName);
      }).catch(() => {});
    }
    return () => { active = false; };
  }, [appointmentId, invitationToken, role]);

  useEffect(() => {
    if (role !== 'clinician') return;
    const unsub = subscribeToCameraCheck(appointmentId, (sync) => {
      setPatientSync(sync);
      if (sync.patientName && sync.patientName !== 'Patient') {
        setPatientName(sync.patientName);
      }
      if (sync.clinicianName && sync.clinicianName !== 'Clinician') {
        setClinicianName(sync.clinicianName);
      }
      if (sync.status === 'complete') {
        setShowCompleteNotice(true);
        const timer = setTimeout(() => setShowCompleteNotice(false), 7000);
        return () => clearTimeout(timer);
      }
    });
    return unsub;
  }, [appointmentId, role]);

  const effectivePatientDisplay = patientName !== 'Patient' ? patientName : 'Patient';
  const effectiveClinicianDisplay = clinicianName !== 'Clinician' ? clinicianName : 'Clinician';

  return (
    <div className={`consultation-page ventricura-consultation ${role === 'clinician' ? 'clinician-consultation' : 'patient-consultation'}`}>
      <header className="consultation-heading consultation-toolbar">
        <Link to={dashboardPath} className="back-link"><ArrowLeft size={18} /> Leave consultation</Link>
        <div className="consultation-person">
          <div className="avatar"><UserRound size={19} /></div>
          <div>
            <strong>
              {role === 'clinician'
                ? (effectivePatientDisplay !== 'Patient' ? `Consultation with ${effectivePatientDisplay}` : 'Clinician workspace')
                : (effectiveClinicianDisplay !== 'Clinician' ? `Appointment with ${effectiveClinicianDisplay}` : 'Patient appointment')}
            </strong>
            <span>{role === 'clinician' ? 'Secure clinical consultation' : 'Secure video appointment'}</span>
          </div>
        </div>
        <div className="call-time" aria-label={`Call elapsed time: ${formatCallDuration(elapsedSeconds)}`}>
          <span className="live-dot" />
          <Clock3 size={16} /> {formatCallDuration(elapsedSeconds)}
        </div>
      </header>

      <main className={`consultation-grid consultation-workspace ${role === 'patient' ? 'patient-consultation-grid' : ''}`}>
        <section className="video-column consultation-video-panel">
          <div className="consultation-video-heading">
            <div>
              <p className="eyebrow">{role === 'clinician' ? 'Patient stream' : 'Clinician stream'}</p>
              <h1>
                {role === 'clinician'
                  ? (effectivePatientDisplay !== 'Patient' ? effectivePatientDisplay : 'Patient video')
                  : (effectiveClinicianDisplay !== 'Clinician' ? effectiveClinicianDisplay : 'Your clinician')}
              </h1>
            </div>
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
                    <strong>{effectivePatientDisplay !== 'Patient' ? `${effectivePatientDisplay.toUpperCase()} CAMERA CHECK IN PROGRESS` : 'PATIENT CAMERA CHECK IN PROGRESS'}</strong>
                    <span className="reading-time-badge">
                      <Clock3 size={11} /> {patientSync.secondsRemaining > 0 ? `${patientSync.secondsRemaining}s remaining` : 'Finalizing…'}
                    </span>
                  </div>
                  <p className="reading-alert-subtext">
                    {patientSync.motionDetected ? (
                      <span className="warning">⚠️ Movement detected on {effectivePatientDisplay !== 'Patient' ? `${effectivePatientDisplay}'s` : 'patient'} camera — remind {effectivePatientDisplay !== 'Patient' ? effectivePatientDisplay : 'patient'} to remain still while baseline settles</span>
                    ) : !patientSync.faceDetected ? (
                      <span className="warning">⚠️ {effectivePatientDisplay !== 'Patient' ? `${effectivePatientDisplay}'s face` : 'Patient face'} not detected — advise {effectivePatientDisplay !== 'Patient' ? effectivePatientDisplay : 'patient'} to center face in camera</span>
                    ) : patientSync.isCalibrating ? (
                      `Establishing 30-second optical baseline — remind ${effectivePatientDisplay !== 'Patient' ? effectivePatientDisplay : 'patient'} to remain still and breathe naturally`
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
                <strong>Reading complete for {effectivePatientDisplay !== 'Patient' ? effectivePatientDisplay : 'patient'}:</strong> {patientSync?.heartRateBpm != null ? `${Math.round(patientSync.heartRateBpm)} BPM` : ''} {patientSync?.respiratoryRate != null ? `· ${(Math.round(patientSync.respiratoryRate * 10) / 10).toFixed(1)} /min` : ''} · Results locked into chart
              </span>
            </div>
          )}

          <VideoRoom
            appointmentId={appointmentId}
            displayName={displayName}
            role={role}
            invitationToken={invitationToken}
            patientName={patientName}
            clinicianName={clinicianName}
          />
          <div className="medication-context"><div><Pill /></div><span><strong>Appointment privacy</strong>This call is available only to the clinician and the holder of the secure patient link.</span></div>
        </section>
        <section className="consultation-measurements-panel">
          <MeasurementPanel
            appointmentId={appointmentId}
            role={role}
            invitationToken={invitationToken}
            patientName={patientName}
            clinicianName={clinicianName}
          />
        </section>
      </main>
    </div>
  );
}
