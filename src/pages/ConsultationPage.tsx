import {
  Activity,
  ArrowLeft,
  BookmarkCheck,
  BookmarkPlus,
  CheckCircle2,
  ChevronDown,
  Clock3,
  LoaderCircle,
  Maximize2,
  Minimize2,
  Pill,
  Play,
  RotateCcw,
  UserRound,
  Video,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { MeasurementPanel } from '../components/MeasurementPanel';
import { PrescribeMedicationModal } from '../components/PrescribeMedicationModal';
import { VideoRoom } from '../components/VideoRoom';
import {
  fetchPatientInvitation,
  getAppointmentReviewStatus,
  loadPatientMedications,
  type PatientMedication,
  updateAppointmentReviewStatus,
} from '../services/clinicAccess';
import { loadConsultationDetails } from '../services/clinicianData';
import {
  broadcastCameraCheckRequest,
  cancelCameraCheckRequest,
  subscribeToCameraCheck,
  type CameraCheckSyncState,
} from '../services/consultationSync';

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
  const [patientId, setPatientId] = useState<string | undefined>(undefined);

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

  // Clinician camera check request state from the side dock
  const [requestStatus, setRequestStatus] = useState<'idle' | 'waiting' | 'accepted' | 'declined'>('idle');

  // Prescribing modal state & active medications
  const [showPrescribeModal, setShowPrescribeModal] = useState(false);
  const [prescribeNotice, setPrescribeNotice] = useState('');
  const [medications, setMedications] = useState<PatientMedication[]>([]);
  const [lastPrescribedMed, setLastPrescribedMed] = useState<PatientMedication | null>(null);

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

  // Load participant names, patient ID, medications and review status
  useEffect(() => {
    let active = true;
    if (role === 'clinician') {
      void loadConsultationDetails(appointmentId).then((details) => {
        if (!active || !details) return;
        if (details.clinicianName && details.clinicianName !== 'Clinician') setClinicianName(details.clinicianName);
        if (details.patientName && details.patientName !== 'Patient') setPatientName(details.patientName);
        if (details.patientId) {
          setPatientId(details.patientId);
          void loadPatientMedications(details.patientId).then(({ medications: meds }) => {
            if (active) setMedications(meds);
          }).catch(() => {});
        } else if (appointmentId) {
          void loadPatientMedications(appointmentId).then(({ medications: meds }) => {
            if (active) setMedications(meds);
          }).catch(() => {});
        }
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
      if (sync.isRecording) {
        setRequestStatus('accepted');
      }
      if (sync.status === 'complete') {
        setRequestStatus('idle');
        setShowCompleteNotice(true);
        // Automatically mark as needing review when a camera reading finishes
        setNeedsReview(true);
        void updateAppointmentReviewStatus(appointmentId, true);
        const timer = setTimeout(() => setShowCompleteNotice(false), 7000);
        return () => clearTimeout(timer);
      }
    });

    // Listen for patient response to reading request
    const onSyncMsg = (e: Event) => {
      const custom = e as CustomEvent<{ type?: string; payload?: { appointmentId?: string; accepted?: boolean } }>;
      const msg = custom.detail;
      if (msg?.type === 'camera_check_response' && msg.payload?.appointmentId === appointmentId) {
        if (msg.payload.accepted) {
          setRequestStatus('accepted');
        } else {
          setRequestStatus('declined');
        }
      }
    };
    window.addEventListener('ventricura_camera_check_msg', onSyncMsg);

    return () => {
      unsub();
      window.removeEventListener('ventricura_camera_check_msg', onSyncMsg);
    };
  }, [appointmentId, role]);

  const effectivePatientDisplay = patientName !== 'Patient' ? patientName : 'Patient';
  const effectiveClinicianDisplay = clinicianName !== 'Clinician' ? clinicianName : 'Clinician';

  const handleInitiateReading = () => {
    setRequestStatus('waiting');
    broadcastCameraCheckRequest(appointmentId, effectiveClinicianDisplay);
  };

  const handleCancelReading = () => {
    setRequestStatus('idle');
    cancelCameraCheckRequest(appointmentId);
  };

  const scrollToTelemetry = () => {
    document.getElementById('consultation-telemetry-section')?.scrollIntoView({ behavior: 'smooth' });
  };

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
            <>
              <button
                type="button"
                className="consult-toolbar-prescribe-btn"
                onClick={() => setShowPrescribeModal(true)}
                title={`Prescribe medication for ${effectivePatientDisplay}`}
              >
                <Pill size={14} />
                <span>Prescribe</span>
                {medications.length > 0 && <span className="hud-pill-count">{medications.length}</span>}
              </button>
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
            </>
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
        {/* TOP SECTION: WIDE FULL-WIDTH VIDEO PANEL + CLINICIAN HUD SIDE DOCK */}
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

          <div className="consultation-video-stage-wrapper">
            <div className="consultation-video-viewport">
              <VideoRoom
                appointmentId={appointmentId}
                displayName={displayName}
                role={role}
                invitationToken={invitationToken}
                patientName={patientName}
                clinicianName={clinicianName}
                onLeave={role === 'patient' ? () => setMeasurementStopRequest((request) => request + 1) : undefined}
              />
            </div>

            {/* SIDE DOCK: Start reading and see live vitals right alongside video without scrolling past patient */}
            {role === 'clinician' && (
              <aside className="consultation-clinician-side-dock" aria-label="Clinical Telemetry HUD">
                <div className="side-dock-top">
                  <div className="side-dock-header">
                    <span className="side-dock-title">TELEMETRY HUD</span>
                    <span className={`side-dock-status-badge ${patientSync?.isRecording ? 'live' : patientSync?.heartRateBpm != null ? 'complete' : ''}`}>
                      {patientSync?.isRecording ? '● CHECKING' : patientSync?.heartRateBpm != null ? 'LOCKED' : 'READY'}
                    </span>
                  </div>

                  {/* Reading status / Vitals display */}
                  {patientSync?.isRecording ? (
                    <div className="side-dock-recording-card">
                      <div className="side-dock-recording-header">
                        <span className="side-dock-vital-label">RECORDING VITALS</span>
                        <span className="side-dock-recording-countdown">{patientSync.secondsRemaining}s</span>
                      </div>
                      <div className="side-dock-progress-bar">
                        <div className="side-dock-progress-fill" style={{ width: `${Math.max(5, patientSync.progress)}%` }} />
                      </div>
                      <p>
                        {patientSync.motionDetected
                          ? 'Motion detected — advise patient to settle'
                          : patientSync.isCalibrating
                          ? 'Establishing optical baseline'
                          : 'Locking quality-weighted pulse'}
                      </p>
                      <button
                        type="button"
                        className="side-dock-cancel-btn"
                        onClick={handleCancelReading}
                      >
                        <X size={13} /> Cancel reading
                      </button>
                    </div>
                  ) : requestStatus === 'waiting' ? (
                    <div className="side-dock-waiting-card">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <LoaderCircle className="spin" size={15} color="#d97706" />
                        <strong>Awaiting patient consent…</strong>
                      </div>
                      <span>Consent prompt displayed on {effectivePatientDisplay}'s screen</span>
                      <button
                        type="button"
                        className="side-dock-cancel-btn"
                        onClick={handleCancelReading}
                      >
                        <X size={13} /> Cancel request
                      </button>
                    </div>
                  ) : patientSync?.heartRateBpm != null ? (
                    <div className="side-dock-vitals-card">
                      <div className="side-dock-vitals-grid">
                        <div className="side-dock-vital-item">
                          <span className="side-dock-vital-label">PULSE</span>
                          <span className="side-dock-vital-val">
                            {Math.round(patientSync.heartRateBpm)} <small>BPM</small>
                          </span>
                        </div>
                        <div className="side-dock-vital-item">
                          <span className="side-dock-vital-label">BREATHING</span>
                          <span className="side-dock-vital-val">
                            {patientSync.respiratoryRate != null ? (Math.round(patientSync.respiratoryRate * 10) / 10).toFixed(1) : '--'} <small>/min</small>
                          </span>
                        </div>
                      </div>
                      <div className="side-dock-vital-meta">
                        <span>Quality: {Math.round((patientSync.signalQuality ?? 0) * 100)}%</span>
                        <span style={{ color: '#10b981', fontWeight: 700 }}>● Locked</span>
                      </div>
                      <button
                        type="button"
                        className="side-dock-action-btn secondary"
                        onClick={handleInitiateReading}
                        title="Run another 30-second camera check"
                      >
                        <RotateCcw size={14} /> Start new reading
                      </button>
                    </div>
                  ) : (
                    <div className="side-dock-idle-card">
                      <strong>Contactless Vitals</strong>
                      <span>30-second optical face camera check for pulse & respiration.</span>
                      <button
                        type="button"
                        className="side-dock-action-btn primary"
                        onClick={handleInitiateReading}
                      >
                        <Play size={14} /> Start camera check
                      </button>
                    </div>
                  )}

                  {/* 1-Click Prescribe in Call */}
                  <button
                    type="button"
                    className="side-dock-action-btn prescribe"
                    onClick={() => setShowPrescribeModal(true)}
                    title="Prescribe medication from Australian ARTG"
                  >
                    <Pill size={15} /> Prescribe medication
                    {medications.length > 0 && <span className="hud-pill-count">{medications.length}</span>}
                  </button>
                </div>

                <div className="side-dock-bottom">
                  <button
                    type="button"
                    className="side-dock-scroll-btn"
                    onClick={scrollToTelemetry}
                    title="Scroll down to waveforms, trend graphs, and clinical notes"
                  >
                    <ChevronDown size={14} /> Full notes & waveforms below
                  </button>
                </div>
              </aside>
            )}
          </div>

          <div className="medication-context">
            <div><Pill /></div>
            <span><strong>Appointment privacy</strong>This call is available only to the clinician and the holder of the secure patient link.</span>
          </div>
        </section>

        {/* BOTTOM SECTION: ALL THE BULKY STUFF BELOW (Readings, Waveforms, Notes, Pharmacotherapy) */}
        <section id="consultation-telemetry-section" className="consultation-measurements-panel">
          <MeasurementPanel
            appointmentId={appointmentId}
            role={role}
            invitationToken={invitationToken}
            patientName={patientName}
            clinicianName={clinicianName}
            stopRequest={measurementStopRequest}
            isFlaggedForReview={needsReview}
            onToggleReviewFlag={role === 'clinician' ? () => void handleToggleReviewFlag() : undefined}
            patientId={patientId}
            medications={medications}
            onOpenPrescribe={role === 'clinician' ? () => setShowPrescribeModal(true) : undefined}
            lastPrescribedMed={lastPrescribedMed}
          />
        </section>
      </main>

      {/* AUSTRALIAN ARTG PRESCRIBE MODAL */}
      {role === 'clinician' && (
        <PrescribeMedicationModal
          isOpen={showPrescribeModal}
          patientId={patientId || appointmentId}
          patientName={effectivePatientDisplay}
          onClose={() => setShowPrescribeModal(false)}
          onPrescribed={(created) => {
            setMedications((prev) => [created, ...prev.filter((m) => m.id !== created.id)]);
            setLastPrescribedMed(created);
            setPrescribeNotice(`Prescribed: ${created.medication_name} ${created.dose} (${created.repeats} repeats)`);
            setTimeout(() => setPrescribeNotice(''), 6000);
          }}
          existingMedications={medications}
        />
      )}

      {/* IN-CALL PRESCRIPTION SUCCESS TOAST */}
      {prescribeNotice && (
        <div className="consult-prescribe-toast" role="status">
          <CheckCircle2 size={16} />
          <span>{prescribeNotice}</span>
        </div>
      )}
    </div>
  );
}
