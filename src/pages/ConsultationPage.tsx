import { ArrowLeft, BookmarkCheck, BookmarkPlus, CheckCircle2, Clock3, LoaderCircle, Maximize2, Minimize2, Pill, UserRound, Video } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { MeasurementPanel } from '../components/MeasurementPanel';
import { VideoRoom } from '../components/VideoRoom';
import { fetchPatientInvitation, getAppointmentReviewStatus, updateAppointmentReviewStatus } from '../services/clinicAccess';
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
  const [measurementStopRequest, setMeasurementStopRequest] = useState(0);
  const [needsReview, setNeedsReview] = useState(false);
  const [reviewSaving, setReviewSaving] = useState(false);
  const [reviewNotice, setReviewNotice] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      // Browser prevented fullscreen or not supported
    }
  };

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

  // Load participant names and review status from appointment or patient invite
  useEffect(() => {
    let active = true;
    if (role === 'clinician') {
      void loadConsultationDetails(appointmentId).then((details) => {
        if (!active || !details) return;
        if (details.clinicianName && details.clinicianName !== 'Clinician') setClinicianName(details.clinicianName);
        if (details.patientName && details.patientName !== 'Patient') setPatientName(details.patientName);
        if (typeof details.needsReview === 'boolean') setNeedsReview(details.needsReview);
      }).catch(() => {});

      void getAppointmentReviewStatus(appointmentId).then((res) => {
        if (active) setNeedsReview(res.needsReview);
      }).catch(() => {});

      const onReviewUpdated = (e: Event) => {
        const custom = e as CustomEvent<{ appointmentId: string; needsReview: boolean }>;
        if (custom.detail?.appointmentId === appointmentId && active) {
          setNeedsReview(custom.detail.needsReview);
        }
      };
      window.addEventListener('ventricura:review-updated', onReviewUpdated);
      return () => {
        active = false;
        window.removeEventListener('ventricura:review-updated', onReviewUpdated);
      };
    } else if (role === 'patient' && invitationToken) {
      void fetchPatientInvitation(invitationToken).then((details) => {
        if (!active || !details) return;
        if (details.clinicianName && details.clinicianName !== 'Your clinician') setClinicianName(details.clinicianName);
        if (details.patientName && details.patientName !== 'Patient') setPatientName(details.patientName);
      }).catch(() => {});
    }
    return () => { active = false; };
  }, [appointmentId, invitationToken, role]);

  const handleToggleReviewFlag = async () => {
    if (role !== 'clinician' || reviewSaving) return;
    const nextState = !needsReview;
    setReviewSaving(true);
    setNeedsReview(nextState);
    try {
      await updateAppointmentReviewStatus(appointmentId, nextState);
      setReviewNotice(nextState ? 'Flagged for review — added to review queue' : 'Removed from review queue');
      setTimeout(() => setReviewNotice(''), 4000);
    } catch {
      setNeedsReview(!nextState);
    } finally {
      setReviewSaving(false);
    }
  };

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
        // Automatically mark as needing review when a camera reading finishes
        setNeedsReview(true);
        void updateAppointmentReviewStatus(appointmentId, true);
        const timer = setTimeout(() => setShowCompleteNotice(false), 7000);
        return () => clearTimeout(timer);
      }
    });
    return unsub;
  }, [appointmentId, role]);

  const effectivePatientDisplay = patientName !== 'Patient' ? patientName : 'Patient';
  const effectiveClinicianDisplay = clinicianName !== 'Clinician' ? clinicianName : 'Clinician';

  return (
    <div className={`consultation-page ventricura-consultation ${role === 'clinician' ? 'clinician-consultation' : 'patient-consultation'} ${isFullscreen ? 'is-fullscreen' : ''}`}>
      <header className="consultation-heading consultation-toolbar">
        <div className="consultation-toolbar-left">
          <Link to={dashboardPath} className="back-link"><ArrowLeft size={18} /> Leave consultation</Link>
          <div className="consultation-person">
            <div className="avatar"><UserRound size={18} /></div>
            <div>
              <strong>
                {role === 'clinician'
                  ? (effectivePatientDisplay !== 'Patient' ? `Consultation with ${effectivePatientDisplay}` : 'Clinician workspace')
                  : (effectiveClinicianDisplay !== 'Clinician' ? `Appointment with ${effectiveClinicianDisplay}` : 'Patient appointment')}
              </strong>
              <span>{role === 'clinician' ? 'Secure clinical consultation' : 'Secure video appointment'}</span>
            </div>
          </div>
        </div>

        <div className="consultation-toolbar-center">
          <div className="call-time" aria-label={`Call elapsed time: ${formatCallDuration(elapsedSeconds)}`}>
            <span className="live-dot" />
            <Clock3 size={15} />
            <span>{formatCallDuration(elapsedSeconds)}</span>
          </div>
        </div>

        <div className="consultation-toolbar-actions">
          {role === 'clinician' && (
            <div className="consultation-flag-container">
              <button
                type="button"
                className={`consult-flag-review-btn ${needsReview ? 'flagged' : ''}`}
                onClick={() => void handleToggleReviewFlag()}
                disabled={reviewSaving}
                title={needsReview ? 'Patient flagged as Needs Review. Click to remove from review queue.' : 'Flag this patient as Needs Review for follow-up'}
              >
                {reviewSaving ? (
                  <LoaderCircle className="spin" size={14} />
                ) : needsReview ? (
                  <BookmarkCheck size={14} />
                ) : (
                  <BookmarkPlus size={14} />
                )}
                <span>{needsReview ? 'Needs review' : 'Flag for review'}</span>
              </button>
              {reviewNotice && <span className="consult-review-toast">{reviewNotice}</span>}
            </div>
          )}
          <button
            type="button"
            className="consultation-fullscreen-btn"
            onClick={() => void toggleFullscreen()}
            title={isFullscreen ? 'Exit full screen (Esc)' : 'Expand video call to full screen'}
            aria-label={isFullscreen ? 'Exit full screen' : 'Full screen'}
          >
            {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            <span>{isFullscreen ? 'Exit full screen' : 'Full screen'}</span>
          </button>
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
            onLeave={role === 'patient' ? () => setMeasurementStopRequest((request) => request + 1) : undefined}
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
            stopRequest={measurementStopRequest}
            isFlaggedForReview={needsReview}
            onToggleReviewFlag={role === 'clinician' ? () => void handleToggleReviewFlag() : undefined}
          />
        </section>
      </main>
    </div>
  );
}
