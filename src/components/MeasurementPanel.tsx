import { Activity, Check, CheckCircle2, ChevronDown, ChevronUp, CircleAlert, Clock3, Copy, Download, FileText, LoaderCircle, LockKeyhole, Play, RotateCcw, ShieldCheck, Wind, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { type MeasurementUpdate, rppgClient } from '../services/rppgClient';
import { loadPatientMeasurementTrend, loadPrivateClinicalNote, savePatientMeasurement, savePrivateClinicalNote, type SavedMeasurement } from '../services/clinicAccess';
import {
  broadcastCameraCheckRequest,
  broadcastCameraCheckResponse,
  broadcastCameraCheckState,
  cancelCameraCheckRequest,
  requestCameraCheckState,
  subscribeToCameraCheck,
  type CameraCheckRequestMessage,
  type CameraCheckSyncState,
} from '../services/consultationSync';

type MeasurementPanelProps = {
  appointmentId: string;
  role: 'patient' | 'clinician';
  invitationToken?: string;
  patientName?: string;
  clinicianName?: string;
};

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
function SignalPlot({ title, values: series, tone = 'primary', primary = false, detail, xAxis = 'Time (recent samples)', yAxis = 'Normalised amplitude (a.u.)', active = false, onSelect }: { title: string; values: number[]; tone?: 'primary' | 'secondary' | 'tertiary'; primary?: boolean; detail?: string; xAxis?: string; yAxis?: string; active?: boolean; onSelect?: () => void }) {
  if (series.length < 2) return <div className="research-plot-empty">Waiting for live engine telemetry…</div>;
  const min = Math.min(...series); const max = Math.max(...series); const range = Math.max(.0001, max - min);
  const points = series.map((value, index) => `${(index / (series.length - 1)) * 100},${42 - ((value - min) / range) * 34}`).join(' ');
  return <button type="button" className={`research-plot research-${tone} ${primary ? 'research-plot-primary' : ''} ${active ? 'research-plot-active' : ''}`} onClick={onSelect} aria-pressed={active} aria-label={`Show ${title} as the main chart`}><div><strong>{title}</strong><span>{detail ?? `${series.length} samples`}</span></div><div className="plot-canvas"><span className="plot-y-axis">{yAxis}</span><svg viewBox="0 0 100 46" preserveAspectRatio="none" role="img" aria-label={`${title}; ${yAxis} against ${xAxis}`}><polyline points={points} /></svg></div><div className="plot-x-axis"><span>{primary ? 'Start' : min.toFixed(2)}</span><strong>{xAxis}</strong><span>{primary ? 'Now' : max.toFixed(2)}</span></div></button>;
}
function ResearchDiagnostics({ diagnostics }: { diagnostics?: Record<string, unknown> | null }) {
  const [selectedPlot, setSelectedPlot] = useState<'ppg' | 'respiratory' | 'cardiacSpectrum' | 'respiratorySpectrum'>('ppg');
  const [expanded, setExpanded] = useState(false);
  if (!diagnostics) return <section className="research-diagnostics"><div className="diagnostics-heading"><div><p className="eyebrow">Signal detail</p><h3>Waveform analysis</h3></div></div><button type="button" className="diagnostics-toggle" onClick={() => setExpanded((isExpanded) => !isExpanded)} aria-expanded={expanded}>{expanded ? <><ChevronUp size={16} /> Hide waveform drawer</> : <><ChevronDown size={16} /> Open waveform drawer</>}</button>{expanded && <div className="diagnostics-expanded-content"><div className="trend-empty">Waveforms, spectra, and engine telemetry will appear here as soon as a patient camera check is underway.</div></div>}</section>;
  const engine = (diagnostics.diagnostics ?? {}) as Record<string, unknown>;
  const roi = (diagnostics.roi_weights ?? {}) as Record<string, unknown>;
  const cardiac = (diagnostics.cardiac ?? {}) as Record<string, unknown>;
  const respiration = (diagnostics.respiration ?? {}) as Record<string, unknown>;
  const snr = Number(diagnostics.snr_db ?? 0);
  const latency = Number(diagnostics.processing_latency_ms ?? 0);
  const cardiacFrequencies = values(diagnostics.cardiac_spectrum_freq_hz);
  const respirationFrequencies = values(diagnostics.respiration_spectrum_freq_hz);
  const frequencyLabel = (frequencies: number[]) => frequencies.length > 1 ? `${Math.min(...frequencies).toFixed(2)}–${Math.max(...frequencies).toFixed(2)} Hz` : 'Frequency spectrum';
  const plots = {
    ppg: { title: 'Photoplethysmogram (PPG) waveform', series: values(cardiac.waveform), tone: 'primary' as const, detail: 'API optical pulse signal', xAxis: 'Time (API samples)', yAxis: 'Normalised PPG amplitude (a.u.)' },
    respiratory: { title: 'Respiratory modulation waveform', series: values(respiration.waveform), tone: 'secondary' as const, detail: 'API respiratory signal', xAxis: 'Time (API samples)', yAxis: 'Normalised modulation (a.u.)' },
    cardiacSpectrum: { title: 'Cardiac power spectrum', series: values(diagnostics.cardiac_spectrum_power), tone: 'tertiary' as const, detail: frequencyLabel(cardiacFrequencies), xAxis: 'Frequency (Hz)', yAxis: 'Normalised power' },
    respiratorySpectrum: { title: 'Respiratory power spectrum', series: values(respiration.waveform), tone: 'secondary' as const, detail: frequencyLabel(respirationFrequencies), xAxis: 'Frequency (Hz)', yAxis: 'Normalised power' },
  };
  const selected = plots[selectedPlot];
    const kalmanBpm = engine.kalman_bpm != null && Number.isFinite(Number(engine.kalman_bpm)) ? `${Number(engine.kalman_bpm).toFixed(1)} BPM` : '—';
    const confInterval = engine.confidence_interval_bpm != null && Number.isFinite(Number(engine.confidence_interval_bpm)) ? `±${Number(engine.confidence_interval_bpm).toFixed(1)} BPM` : '—';

    return <section className="research-diagnostics">
      <div className="diagnostics-heading"><div><p className="eyebrow">Signal detail</p><h3>Waveform analysis</h3></div></div>
      <div className="diagnostics-grid diagnostics-grid-wide">
        <span><strong>{Number.isFinite(snr) ? `${snr.toFixed(1)} dB` : '—'}</strong>SNR</span>
        <span><strong>{Number(diagnostics.quality_score ?? 0).toFixed(2)}</strong>Signal quality</span>
        <span><strong>{Number.isFinite(latency) ? `${Math.round(latency)} ms` : '—'}</strong>Processing latency</span>
        <span><strong>{String(diagnostics.tracking_state ?? '—')}</strong>Tracking state</span>
        <span><strong>{kalmanBpm}</strong>Kalman estimate</span>
        <span><strong>{confInterval}</strong>95% interval</span>
      </div>
      <div className="roi-grid"><strong>Regions of interest</strong><span>Forehead {Math.round(Number(roi.Forehead ?? 0) * 100)}%</span><span>Left cheek {Math.round(Number(roi['Left Cheek'] ?? 0) * 100)}%</span><span>Right cheek {Math.round(Number(roi['Right Cheek'] ?? 0) * 100)}%</span><span>Face mesh {String(engine.landmarks_detected ?? '—')} points</span><span>Skin {String(engine.skin_pixels ?? '—')} px</span></div>
      <button type="button" className="diagnostics-toggle" onClick={() => setExpanded((isExpanded) => !isExpanded)} aria-expanded={expanded}>{expanded ? <><ChevronUp size={16} /> Hide waveform drawer</> : <><ChevronDown size={16} /> Open waveforms and raw DSP</>}</button>
      {expanded && <div className="diagnostics-expanded-content">
        <div className="featured-plot-label"><span>Selected trace</span><strong>Choose any trace to bring it forward</strong></div>
        <SignalPlot title={selected.title} values={selected.series} tone={selected.tone} primary detail={selected.detail} xAxis={selected.xAxis} yAxis={selected.yAxis} active />
        <div className="research-secondary-plots">
          {(Object.entries(plots) as [keyof typeof plots, typeof selected][]).map(([key, plot]) => <SignalPlot key={key} title={plot.title} values={plot.series} tone={plot.tone} detail={plot.detail} xAxis={plot.xAxis} yAxis={plot.yAxis} active={selectedPlot === key} onSelect={() => setSelectedPlot(key)} />)}
        </div>
        <section className="advanced-telemetry"><div><p className="eyebrow">Expanded engine telemetry</p><h4>Raw API diagnostics</h4></div><div className="advanced-telemetry-grid"><span><strong>{cardiac.hrv_rmssd_ms != null && Number.isFinite(Number(cardiac.hrv_rmssd_ms)) ? `${Number(cardiac.hrv_rmssd_ms).toFixed(0)} ms` : '—'}</strong>HRV RMSSD</span><span><strong>{cardiac.hrv_sdnn_ms != null && Number.isFinite(Number(cardiac.hrv_sdnn_ms)) ? `${Number(cardiac.hrv_sdnn_ms).toFixed(0)} ms` : '—'}</strong>HRV SDNN</span><span><strong>{cardiac.hrv_pnn50_pct != null && Number.isFinite(Number(cardiac.hrv_pnn50_pct)) ? `${Number(cardiac.hrv_pnn50_pct).toFixed(0)}%` : '—'}</strong>pNN50</span><span><strong>{cardiac.hrv_lf_hf_ratio != null && Number.isFinite(Number(cardiac.hrv_lf_hf_ratio)) ? Number(cardiac.hrv_lf_hf_ratio).toFixed(2) : '—'}</strong>LF/HF ratio</span><span><strong>{respiration.rqi_pct != null && Number.isFinite(Number(respiration.rqi_pct)) ? `${Number(respiration.rqi_pct).toFixed(0)}%` : '—'}</strong>Respiratory quality</span><span><strong>{String(respiration.phase ?? '—')}</strong>Breathing phase</span></div></section>
        <div className="engine-line">{String(engine.algorithm ?? 'FUSION')} algorithm · motion {Number(engine.motion_velocity ?? 0).toFixed(2)} IOD/s · landmark displacement {Number(engine.motion_displacement_px ?? 0).toFixed(2)} px · spectral entropy {Number(engine.spectral_entropy ?? 0).toFixed(2)} · buffer {String(engine.buffer_samples ?? '—')}/{String(engine.buffer_capacity ?? '—')} samples</div>
      </div>}
    </section>;
}

function PrivateNotes({
  appointmentId,
  vitals,
  patientName,
}: {
  appointmentId: string;
  patientName?: string;
  vitals?: {
    heartRateBpm: number | null;
    respiratoryRate: number | null;
    signalQuality: number;
    diagnostics?: Record<string, unknown>;
  } | null;
}) {
  const [content, setContent] = useState('');
  const [status, setStatus] = useState<'loading' | 'saved' | 'saving' | 'error'>('loading');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    void loadPrivateClinicalNote(appointmentId).then((note) => { if (active) { setContent(note.content); setStatus('saved'); } }).catch(() => { if (active) setStatus('error'); });
    return () => { active = false; };
  }, [appointmentId]);

  const save = async () => {
    setStatus('saving');
    try { await savePrivateClinicalNote(appointmentId, content); setStatus('saved'); }
    catch { setStatus('error'); }
  };

  const insertVitals = () => {
    const timeStr = new Date().toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' });
    const cardiac = vitals?.diagnostics?.cardiac as { session_average_bpm?: number | null; clinical_bpm?: number | null; bpm?: number | null; hrv_rmssd_ms?: number | null; stress_score?: number | null } | undefined;
    const respiration = vitals?.diagnostics?.respiration as { session_average_brpm?: number | null; clinical_brpm?: number | null; brpm?: number | null } | undefined;
    const bpm = cardiac?.session_average_bpm ?? cardiac?.clinical_bpm ?? cardiac?.bpm ?? vitals?.heartRateBpm;
    const brpm = respiration?.session_average_brpm ?? respiration?.clinical_brpm ?? respiration?.brpm ?? vitals?.respiratoryRate;
    const hrv = cardiac?.hrv_rmssd_ms != null && Number.isFinite(Number(cardiac.hrv_rmssd_ms)) ? ` · HRV: ${Number(cardiac.hrv_rmssd_ms).toFixed(0)} ms` : '';
    const stress = cardiac?.stress_score != null && Number.isFinite(Number(cardiac.stress_score)) ? ` · Stress: ${Number(cardiac.stress_score).toFixed(0)}/100` : '';
    const quality = vitals?.signalQuality != null && Number.isFinite(vitals.signalQuality) ? ` · Signal Quality: ${Math.round(vitals.signalQuality * 100)}%` : '';

    const targetName = patientName && patientName !== 'Patient' ? ` — ${patientName}` : '';
    const snippet = `[Ventricura rPPG Vitals${targetName} — ${timeStr}]\n• Pulse: ${bpm != null && Number.isFinite(Number(bpm)) ? `${Math.round(Number(bpm))} BPM (30s clinical average)` : 'Pending'}\n• Respiration: ${brpm != null && Number.isFinite(Number(brpm)) ? `${Math.round(Number(brpm))} /min` : 'Pending'}${hrv}${stress}${quality}\n`;
    setContent((prev) => (prev.trim() ? `${prev.trimEnd()}\n\n${snippet}` : snippet));
    setStatus('saved');
  };

  const insertSoapTemplate = () => {
    const template = `SUBJECTIVE:\n- Presenting complaint:\n- History of onset:\n\nOBJECTIVE:\n- Contactless rPPG vitals:\n- Clinical observations:\n\nASSESSMENT:\n- Clinical impression:\n\nPLAN:\n- Management:\n- Prescriptions & follow-up:`;
    setContent((prev) => (prev.trim() ? `${prev.trimEnd()}\n\n${template}` : template));
    setStatus('saved');
  };

  const copyForEhr = async () => {
    if (!content.trim()) return;
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  const cardiacData = vitals?.diagnostics?.cardiac as { bpm?: number | null; clinical_bpm?: number | null; session_average_bpm?: number | null } | undefined;
  const hasVitals = (vitals?.heartRateBpm != null && Number.isFinite(vitals.heartRateBpm)) ||
    (cardiacData?.clinical_bpm != null && Number.isFinite(Number(cardiacData.clinical_bpm))) ||
    (cardiacData?.session_average_bpm != null && Number.isFinite(Number(cardiacData.session_average_bpm))) ||
    (cardiacData?.bpm != null && Number.isFinite(Number(cardiacData.bpm)));

  return (
    <section className="private-notes" aria-label="Private clinician notes">
      <div className="private-notes-heading">
        <div>
          <p className="eyebrow"><LockKeyhole size={13} /> Private clinician notes</p>
          <h3>Consultation notes</h3>
          <span>Only clinicians assigned to this appointment can access these notes.</span>
        </div>
        <button className="button button-secondary" type="button" onClick={() => void save()} disabled={status === 'saving' || status === 'loading'}>
          {status === 'saving' ? 'Saving…' : 'Save notes'}
        </button>
      </div>

      <div className="private-notes-toolbar" role="toolbar" aria-label="Clinical note shortcuts">
        <button
          type="button"
          className="note-shortcut-btn"
          onClick={insertVitals}
          disabled={!hasVitals}
          title={hasVitals ? 'Insert measured vitals snapshot into notes' : 'Run camera check to capture vitals first'}
        >
          <Activity size={12} /> Insert vitals
        </button>
        <button
          type="button"
          className="note-shortcut-btn"
          onClick={insertSoapTemplate}
          title="Insert standard SOAP clinical template"
        >
          <FileText size={12} /> SOAP template
        </button>
        <button
          type="button"
          className="note-shortcut-btn"
          onClick={() => void copyForEhr()}
          disabled={!content.trim()}
          title="Copy notes to clipboard for EHR"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? 'Copied' : 'Copy for EHR'}
        </button>
      </div>

      <textarea
        value={content}
        onChange={(event) => { setContent(event.target.value); if (status !== 'loading') setStatus('saved'); }}
        placeholder="Document observations, discussion, and follow-up…"
        maxLength={10000}
      />
      <div className="notes-footer">
        <span>{status === 'error' ? 'Could not save notes. Please try again.' : status === 'loading' ? 'Loading secure notes…' : `${content.length.toLocaleString()}/10,000 characters`}</span>
        <span>Stored on Ventricura</span>
      </div>
    </section>
  );
}

function exportMeasurementCsv(appointmentId: string, samples: SavedMeasurement[]) {
  const header = ['appointment_id', 'measured_at', 'heart_rate_bpm', 'respiratory_rate_bpm', 'signal_quality', 'algorithm_version'];
  const rows = samples.map((sample) => {
    const diag = sample.diagnostics as { cardiac?: { session_average_bpm?: number; clinical_bpm?: number }; respiration?: { session_average_brpm?: number; clinical_brpm?: number } } | undefined;
    const bpm = diag?.cardiac?.session_average_bpm ?? diag?.cardiac?.clinical_bpm ?? sample.heart_rate_bpm;
    const brpm = diag?.respiration?.session_average_brpm ?? diag?.respiration?.clinical_brpm ?? sample.respiratory_rate_bpm;
    return [appointmentId, sample.measured_at, bpm, brpm, sample.signal_quality, sample.algorithm_version ?? ''].map((value) => `"${String(value).replaceAll('"', '""')}"`).join(',');
  });
  const blob = new Blob([[header.join(','), ...rows].join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = `ventricura-measurement-${appointmentId}.csv`; anchor.click(); URL.revokeObjectURL(url);
}

export function MeasurementPanel({
  appointmentId,
  role,
  invitationToken,
  patientName = 'Patient',
  clinicianName = 'Clinician',
}: MeasurementPanelProps) {
  const [measurement, setMeasurement] = useState<MeasurementUpdate>(initialState);
  const stopRef = useRef<(() => void) | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const savedReadingRef = useRef(false);
  const savedSampleIdsRef = useRef(new Set<string>());
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [recordMessage, setRecordMessage] = useState('');
  const [trend, setTrend] = useState<SavedMeasurement[]>([]);
  const [patientSyncState, setPatientSyncState] = useState<CameraCheckSyncState | null>(null);
  const [requestStatus, setRequestStatus] = useState<'idle' | 'waiting' | 'accepted' | 'declined'>('idle');
  const [incomingConsent, setIncomingConsent] = useState<CameraCheckRequestMessage | null>(null);

  const effectivePatientName = (patientSyncState?.patientName && patientSyncState.patientName !== 'Patient')
    ? patientSyncState.patientName
    : (patientName !== 'Patient' ? patientName : 'Patient');

  const effectiveClinicianName = (patientSyncState?.clinicianName && patientSyncState.clinicianName !== 'Clinician')
    ? patientSyncState.clinicianName
    : (clinicianName !== 'Clinician' ? clinicianName : 'Clinician');

  const handleInitiateRequest = () => {
    setRequestStatus('waiting');
    broadcastCameraCheckRequest(appointmentId, effectiveClinicianName);
  };

  const handleCancelRequest = () => {
    setRequestStatus('idle');
    cancelCameraCheckRequest(appointmentId);
  };

  const handleAcceptConsent = () => {
    broadcastCameraCheckResponse(appointmentId, effectivePatientName, true);
    setIncomingConsent(null);
    void startMeasurement();
  };

  const handleDeclineConsent = () => {
    broadcastCameraCheckResponse(appointmentId, effectivePatientName, false);
    setIncomingConsent(null);
  };

  useEffect(() => () => stopRef.current?.(), []);
  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = cameraStream;
  }, [cameraStream]);

  // Clinician: listen for real-time camera check broadcasts from patient
  useEffect(() => {
    if (role !== 'clinician') return;
    requestCameraCheckState(appointmentId, 'clinician');
    const unsub = subscribeToCameraCheck(
      appointmentId,
      (sync) => {
        setPatientSyncState(sync);
        if (sync.isRecording || sync.status === 'preparing' || sync.status === 'measuring') {
          setRequestStatus('idle');
          setMeasurement({
            status: sync.status,
            progress: sync.progress,
            signalQuality: sync.signalQuality,
            heartRateBpm: sync.heartRateBpm,
            respiratoryRate: sync.respiratoryRate,
            message: sync.message,
            algorithmVersion: sync.algorithmVersion,
            faceDetected: sync.faceDetected,
            trackingState: sync.isCalibrating ? 'CALIBRATING' : 'LOCKED',
            diagnostics: sync.diagnostics ?? undefined,
          });
        } else if (sync.status === 'complete') {
          setMeasurement((prev) => ({
            ...prev,
            status: 'complete',
            progress: 100,
            signalQuality: sync.signalQuality,
            heartRateBpm: sync.heartRateBpm,
            respiratoryRate: sync.respiratoryRate,
            message: sync.message || '30-second camera check complete',
            diagnostics: sync.diagnostics ?? prev.diagnostics,
          }));
          void loadPatientMeasurementTrend(appointmentId).then((readings) => {
            if (readings.length) setTrend(readings);
          }).catch(() => {});
        } else if (sync.status === 'failed') {
          setMeasurement((prev) => ({
            ...prev,
            status: 'failed',
            message: sync.message || 'Camera check interrupted',
          }));
        }
      },
      undefined,
      {
        onResponse: (response) => {
          if (response.accepted) {
            setRequestStatus('accepted');
          } else {
            setRequestStatus('declined');
          }
        },
      }
    );
    return unsub;
  }, [appointmentId, role]);

  // Clinician safety timeout: if patient stops sending updates for 12s, clear recording state
  useEffect(() => {
    if (role !== 'clinician' || !patientSyncState?.isRecording) return;
    const timer = window.setTimeout(() => {
      setPatientSyncState((prev) => (prev ? { ...prev, isRecording: false } : null));
    }, 12000);
    return () => window.clearTimeout(timer);
  }, [patientSyncState?.timestamp, role]);

  // Clinician: periodically re-broadcast check request while awaiting patient consent
  useEffect(() => {
    if (role !== 'clinician' || requestStatus !== 'waiting') return;
    const interval = window.setInterval(() => {
      broadcastCameraCheckRequest(appointmentId, effectiveClinicianName);
    }, 2500);
    return () => window.clearInterval(interval);
  }, [appointmentId, effectiveClinicianName, requestStatus, role]);

  // Clinician: poll saved readings as persistent fallback and trend history
  useEffect(() => {
    if (role !== 'clinician') return;
    let active = true;
    const loadResult = async () => {
      try {
        const readings = await loadPatientMeasurementTrend(appointmentId);
        if (!active || !readings.length) return;
        const latest = readings.at(-1)!;
        setTrend(readings);
        setMeasurement((prev) => {
          if (prev.status === 'measuring' || prev.status === 'preparing') return prev;
          return {
            status: 'complete',
            progress: 100,
            signalQuality: latest.signal_quality,
            heartRateBpm: latest.heart_rate_bpm,
            respiratoryRate: latest.respiratory_rate_bpm,
            message: `${readings.length}-point camera-check trend received`,
            algorithmVersion: latest.algorithm_version ?? undefined,
            faceDetected: true,
            trackingState: 'LOCKED',
            diagnostics: latest.diagnostics ?? undefined,
          };
        });
      } catch {
        // A clinician may open the call before their authenticated session has refreshed.
      }
    };
    void loadResult();
    const interval = window.setInterval(() => void loadResult(), 3000);
    return () => { active = false; window.clearInterval(interval); };
  }, [appointmentId, role]);

  // Patient: save sample to database
  useEffect(() => {
    const sample = measurement.sample;
    if (role !== 'patient' || !sample || !invitationToken || savedSampleIdsRef.current.has(sample.capturedAt)) return;
    savedSampleIdsRef.current.add(sample.capturedAt);
    void savePatientMeasurement({ appointmentId, invitationToken, heartRateBpm: sample.heartRateBpm, respiratoryRateBpm: sample.respiratoryRate, signalQuality: sample.signalQuality, algorithmVersion: measurement.algorithmVersion, diagnostics: sample.diagnostics })
      .then(() => { if (measurement.status === 'complete') setRecordMessage(`30-second trend saved for ${effectiveClinicianName !== 'Clinician' ? effectiveClinicianName : 'your clinician'}.`); })
      .catch(() => setRecordMessage(`Reading is visible here, but could not be saved for ${effectiveClinicianName !== 'Clinician' ? effectiveClinicianName : 'your clinician'}.`));
  }, [appointmentId, effectiveClinicianName, invitationToken, measurement, role]);

  // Patient: broadcast state to clinician in real time
  useEffect(() => {
    if (role !== 'patient') return;
    const isRunningNow = measurement.status === 'preparing' || measurement.status === 'measuring';
    const diagDataNow = measurement.diagnostics as {
      diagnostics?: {
        is_calibrated?: boolean;
        calibration_seconds_remaining?: number;
        calibration_progress_pct?: number;
      };
      motion_detected?: boolean;
    } | undefined;
    const isCalibratedNow = diagDataNow?.diagnostics?.is_calibrated ?? (measurement.status === 'complete' || measurement.heartRateBpm != null);
    const calibRemainingNow = Number(diagDataNow?.diagnostics?.calibration_seconds_remaining ?? 0);

    broadcastCameraCheckState(appointmentId, {
      status: measurement.status,
      isRecording: isRunningNow,
      progress: measurement.progress,
      secondsRemaining: Math.max(0, Math.ceil(calibRemainingNow)),
      isCalibrating: isRunningNow && !isCalibratedNow,
      faceDetected: measurement.faceDetected ?? true,
      motionDetected: Boolean(diagDataNow?.motion_detected),
      heartRateBpm: measurement.heartRateBpm,
      respiratoryRate: measurement.respiratoryRate,
      signalQuality: measurement.signalQuality,
      message: measurement.message,
      algorithmVersion: measurement.algorithmVersion,
      diagnostics: measurement.diagnostics,
      patientName: effectivePatientName,
      clinicianName: effectiveClinicianName,
    }, 'patient');
  }, [appointmentId, effectiveClinicianName, effectivePatientName, measurement, role]);

  const measurementRef = useRef(measurement);
  measurementRef.current = measurement;
  const effectiveNamesRef = useRef({ patient: effectivePatientName, clinician: effectiveClinicianName });
  effectiveNamesRef.current = { patient: effectivePatientName, clinician: effectiveClinicianName };

  // Patient: respond to clinician pings and listen for clinician check requests
  useEffect(() => {
    if (role !== 'patient') return;
    const unsub = subscribeToCameraCheck(
      appointmentId,
      () => {},
      () => {
        const cur = measurementRef.current;
        const isRunningNow = cur.status === 'preparing' || cur.status === 'measuring';
        const diagDataNow = cur.diagnostics as {
          diagnostics?: {
            is_calibrated?: boolean;
            calibration_seconds_remaining?: number;
          };
          motion_detected?: boolean;
        } | undefined;
        const isCalibratedNow = diagDataNow?.diagnostics?.is_calibrated ?? (cur.status === 'complete' || cur.heartRateBpm != null);
        const calibRemainingNow = Number(diagDataNow?.diagnostics?.calibration_seconds_remaining ?? 0);

        broadcastCameraCheckState(appointmentId, {
          status: cur.status,
          isRecording: isRunningNow,
          progress: cur.progress,
          secondsRemaining: Math.max(0, Math.ceil(calibRemainingNow)),
          isCalibrating: isRunningNow && !isCalibratedNow,
          faceDetected: cur.faceDetected ?? true,
          motionDetected: Boolean(diagDataNow?.motion_detected),
          heartRateBpm: cur.heartRateBpm,
          respiratoryRate: cur.respiratoryRate,
          signalQuality: cur.signalQuality,
          message: cur.message,
          algorithmVersion: cur.algorithmVersion,
          diagnostics: cur.diagnostics,
          patientName: effectiveNamesRef.current.patient,
          clinicianName: effectiveNamesRef.current.clinician,
        }, 'patient');
      },
      {
        onRequest: (request) => {
          setIncomingConsent(request);
        },
        onRequestCancel: () => {
          setIncomingConsent(null);
        },
      }
    );
    return unsub;
  }, [appointmentId, role]);

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

  const diagData = measurement.diagnostics as {
    diagnostics?: {
      is_calibrated?: boolean;
      calibration_seconds_remaining?: number;
      calibration_progress_pct?: number;
    };
    motion_detected?: boolean;
  } | undefined;
  const isCalibrated = diagData?.diagnostics?.is_calibrated ?? (isComplete || (measurement.heartRateBpm != null));
  const calibRemaining = Number(diagData?.diagnostics?.calibration_seconds_remaining ?? 0);
  const isCalibrating = isRunning && !isCalibrated;

  const isPatientRecording = role === 'clinician' && (patientSyncState?.isRecording || isRunning);
  const secondsRemaining = patientSyncState?.secondsRemaining ?? Math.max(0, Math.ceil(calibRemaining));

  if (isPatient) return (
    <>
      {incomingConsent && !isRunning && (
        <div className="patient-consent-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="consent-title" aria-describedby="consent-desc">
          <div className="patient-consent-modal">
            <div className="consent-modal-header">
              <div className="consent-icon-badge">
                <Activity size={24} className="consent-pulse-icon" />
              </div>
              <div className="consent-modal-titles">
                <span className="consent-eyebrow">Clinician Request</span>
                <h2 id="consent-title">30-Second Vitals Reading</h2>
              </div>
            </div>

            <div className="consent-modal-body">
              <p id="consent-desc" className="consent-message">
                <strong>{incomingConsent.clinicianName || effectiveClinicianName}</strong> has requested to perform a 30-second contactless vitals check.
              </p>

              <div className="consent-privacy-box">
                <div className="privacy-pill">
                  <ShieldCheck size={14} />
                  <span>Zero Video Stored</span>
                </div>
                <p className="privacy-details">
                  Using optical photoplethysmography (rPPG), subtle color variations in your skin are analyzed locally in your browser to measure your pulse and respiration.
                  <br />
                  <strong>No video, photo, or biometric identity data is recorded or sent to any server.</strong> Only anonymous numeric vitals are shared directly with your clinician.
                </p>
              </div>

              <div className="consent-positioning-hint">
                <div className="face-guide-small"><span /></div>
                <span>Sit comfortably, ensure good lighting on your face, and look towards the camera.</span>
              </div>
            </div>

            <div className="consent-modal-actions">
              <button
                type="button"
                className="button button-primary consent-accept-btn"
                onClick={handleAcceptConsent}
              >
                <Check size={18} /> Consent & Begin Reading (30s)
              </button>
              <button
                type="button"
                className="button button-ghost consent-decline-btn"
                onClick={handleDeclineConsent}
              >
                <X size={16} /> Decline
              </button>
            </div>
          </div>
        </div>
      )}

      <aside className={`patient-camera-check ${isRunning ? 'patient-camera-check-active' : ''}`}>
        <div className="patient-camera-copy">
          <ShieldCheck size={21} />
          <div>
            <strong>
              {incomingConsent && !isRunning
                ? `Reading requested by ${incomingConsent.clinicianName || effectiveClinicianName}`
                : isComplete
                ? 'Camera check complete'
                : isCalibrating
                ? `Calibrating baseline (${Math.ceil(calibRemaining)}s left)`
                : isRunning && isCalibrated
                ? 'Live monitoring'
                : 'Awaiting clinician request'}
            </strong>
            <span>
              {incomingConsent && !isRunning
                ? 'Please respond to the consent pop-up above to begin your 30-second reading.'
                : isComplete
                ? (recordMessage || `${effectiveClinicianName !== 'Clinician' ? effectiveClinicianName : 'Your clinician'} can now view the reading.`)
                : isCalibrating
                ? `Establishing 30s baseline — keep still & breathe naturally. ${effectiveClinicianName !== 'Clinician' ? effectiveClinicianName : 'Your clinician'} sees your live progress.`
                : isRunning && isCalibrated
                ? `Signal locked. Finalizing clinical average for ${effectiveClinicianName !== 'Clinician' ? effectiveClinicianName : 'your clinician'}.`
                : `${effectiveClinicianName !== 'Clinician' ? effectiveClinicianName : 'Your clinician'} will initiate your 30-second contactless vitals check when ready. When requested, a consent prompt will appear here.`}
            </span>
          </div>
        </div>

        {incomingConsent && !isRunning && (
          <div className="patient-consent-aside-actions">
            <button
              type="button"
              className="button button-primary consent-accept-btn"
              onClick={handleAcceptConsent}
            >
              <Check size={16} /> Consent & Begin (30s)
            </button>
            <button
              type="button"
              className="button button-ghost consent-decline-btn"
              onClick={handleDeclineConsent}
            >
              <X size={15} /> Decline
            </button>
          </div>
        )}

        {!incomingConsent && !isRunning && !isComplete && (
          <>
            <div className="patient-camera-positioning">
              <div className="face-guide-large"><span /></div>
              <div>
                <strong>Position your face here</strong>
                <span>Keep your forehead and both cheeks inside the oval. Sit comfortably, face the camera, and avoid looking directly into a bright window behind you.</span>
              </div>
            </div>
            <div className="patient-awaiting-badge">
              <span className="pulsing-beacon-dot" />
              <span>Ready for {effectiveClinicianName !== 'Clinician' ? effectiveClinicianName : 'clinician'} to initiate reading</span>
            </div>
          </>
        )}

        {isRunning && (
          <div className="patient-camera-running">
            <div className={`face-guide-small patient-camera-preview ${cameraStream ? 'camera-active' : ''}`}>
              {cameraStream ? <video ref={videoRef} autoPlay muted playsInline /> : <span />}
              {cameraStream && <i className={measurement.faceDetected ? 'face-locked' : ''} />}
            </div>
            <div>
              <strong>
                {isCalibrating
                  ? `Calibrating (${Math.ceil(calibRemaining)}s left)`
                  : measurement.faceDetected
                  ? 'Face tracking active'
                  : 'Centre your face'}
              </strong>
              <span>{measurement.message} · {measurement.progress}%</span>
            </div>
          </div>
        )}

        {measurement.status === 'failed' && <div className="signal-line error"><CircleAlert size={16} /> {measurement.message}</div>}

        {isComplete ? (
          <button className="button button-secondary patient-camera-button" onClick={() => void startMeasurement()} disabled={isRunning}>
            <RotateCcw size={17} /> Run again
          </button>
        ) : !isRunning && !incomingConsent ? (
          <button type="button" className="patient-self-test-btn" onClick={() => void startMeasurement()}>
            Or start self-test reading
          </button>
        ) : null}
      </aside>
    </>
  );

  return (
    <aside className="measurement-panel">
      <div className="section-heading compact">
        <div>
          <p className="eyebrow">Session telemetry</p>
          <h2>{effectivePatientName !== 'Patient' ? `${effectivePatientName}'s readings` : 'Patient readings'}</h2>
        </div>
        {role === 'clinician' && isPatientRecording ? (
          <div className="recording-pill-live" aria-live="polite">
            <span className="pulsing-record-dot" />
            <span>{effectivePatientName !== 'Patient' ? `${effectivePatientName.toUpperCase()} RECORDING` : 'PATIENT RECORDING'} ({secondsRemaining}s)</span>
          </div>
        ) : (
          <span className={`status-dot ${isCalibrating ? 'calibrating' : isRunning ? 'active' : ''}`} aria-hidden="true" />
        )}
      </div>

      {role === 'clinician' && isPatientRecording && (
        <section className="clinician-reading-active-banner" aria-live="assertive" role="alert">
          <div className="active-banner-main">
            <div className="pulsing-radar-beacon">
              <span className="beacon-ring beacon-ring-outer" />
              <span className="beacon-ring beacon-ring-inner" />
              <span className="beacon-dot" />
            </div>
            <div className="active-banner-details">
              <div className="active-banner-badges">
                <span className="status-tag status-recording">● {effectivePatientName !== 'Patient' ? `${effectivePatientName.toUpperCase()} RECORDING IN PROGRESS` : 'PATIENT RECORDING IN PROGRESS'}</span>
                <span className="status-tag status-time">
                  <Clock3 size={11} /> {secondsRemaining > 0 ? `${secondsRemaining}s remaining` : 'Finalizing…'}
                </span>
              </div>
              <h3 className="active-banner-title">
                {isCalibrating ? `Calibrating 30-second baseline${effectivePatientName !== 'Patient' ? ` for ${effectivePatientName}` : ''}` : 'Optical signal locked — measuring'}
              </h3>
              <p className="active-banner-description">
                {patientSyncState?.motionDetected || diagData?.motion_detected ? (
                  <span className="guidance-warning">
                    <CircleAlert size={14} /> Motion detected on {effectivePatientName !== 'Patient' ? `${effectivePatientName}'s` : 'patient'} camera — please advise {effectivePatientName !== 'Patient' ? effectivePatientName : 'patient'} to hold still.
                  </span>
                ) : measurement.faceDetected === false ? (
                  <span className="guidance-warning">
                    <CircleAlert size={14} /> {effectivePatientName !== 'Patient' ? `${effectivePatientName}'s face` : 'Patient face'} is not centered in their camera frame.
                  </span>
                ) : isCalibrating ? (
                  <span>
                    Establishing quality-weighted optical baseline. Instruct {effectivePatientName !== 'Patient' ? effectivePatientName : 'patient'} to remain still, face their camera, and breathe naturally.
                  </span>
                ) : (
                  <span>
                    Baseline locked. Finalizing 30-second quality-weighted clinical average into chart.
                  </span>
                )}
              </p>
            </div>
          </div>
          <div className="active-banner-progress-track">
            <div className="active-banner-progress-fill" style={{ width: `${Math.max(5, measurement.progress)}%` }} />
          </div>
        </section>
      )}

      {role === 'clinician' && isComplete && !isPatientRecording && (
        <div className="clinician-reading-complete-banner" role="status">
          <div className="complete-banner-left">
            <CheckCircle2 size={18} />
            <div>
              <strong>30-second reading received{effectivePatientName !== 'Patient' ? ` for ${effectivePatientName}` : ''}</strong>
              <span>
                Pulse: {measurement.heartRateBpm != null ? `${Math.round(measurement.heartRateBpm)} BPM` : '—'} · Respiration: {measurement.respiratoryRate != null ? `${(Math.round(measurement.respiratoryRate * 10) / 10).toFixed(1)} /min` : '—'} · Quality: {Math.round(measurement.signalQuality * 100)}%
              </span>
            </div>
          </div>
          <button
            type="button"
            className="retest-request-btn"
            onClick={handleInitiateRequest}
            disabled={requestStatus === 'waiting'}
          >
            <RotateCcw size={14} /> Request new reading
          </button>
        </div>
      )}

      {role === 'clinician' && !isPatientRecording && (!isComplete || requestStatus !== 'idle') && (
        <div className="clinician-vitals-initiate-card">
          {requestStatus === 'idle' && (
            <div className="clinician-request-idle">
              <div className="request-card-info">
                <div className="request-card-icon">
                  <Activity size={20} />
                </div>
                <div>
                  <strong>Request 30s Contactless Vitals</strong>
                  <span>Send a consent prompt to {effectivePatientName !== 'Patient' ? effectivePatientName : 'the patient'} to initiate their 30-second rPPG camera reading.</span>
                </div>
              </div>
              <button
                type="button"
                className="button button-primary request-vitals-button"
                onClick={handleInitiateRequest}
              >
                <Play size={16} /> Request vitals reading
              </button>
            </div>
          )}

          {requestStatus === 'waiting' && (
            <div className="clinician-request-pending" role="status">
              <div className="request-card-info">
                <div className="pending-spinner-box">
                  <LoaderCircle className="spin" size={22} />
                </div>
                <div>
                  <div className="pending-status-pill">
                    <span className="pulsing-beacon-dot" />
                    <span>AWAITING PATIENT CONSENT</span>
                  </div>
                  <strong>Waiting for {effectivePatientName !== 'Patient' ? effectivePatientName : 'patient'} to consent…</strong>
                  <span>A consent prompt has been displayed on {effectivePatientName !== 'Patient' ? `${effectivePatientName}'s` : "the patient's"} screen.</span>
                </div>
              </div>
              <button
                type="button"
                className="button button-secondary cancel-request-button"
                onClick={handleCancelRequest}
              >
                <X size={14} /> Cancel request
              </button>
            </div>
          )}

          {requestStatus === 'declined' && (
            <div className="clinician-request-declined" role="alert">
              <div className="request-card-info">
                <div className="declined-icon-box">
                  <CircleAlert size={20} />
                </div>
                <div>
                  <div className="declined-status-pill">DECLINED</div>
                  <strong>{effectivePatientName !== 'Patient' ? effectivePatientName : 'Patient'} declined the reading request</strong>
                  <span>You may discuss with the patient or request again when ready.</span>
                </div>
              </div>
              <button
                type="button"
                className="button button-primary request-vitals-button"
                onClick={handleInitiateRequest}
              >
                <RotateCcw size={15} /> Request again
              </button>
            </div>
          )}

          {requestStatus === 'accepted' && (
            <div className="clinician-request-accepted" role="status">
              <div className="request-card-info">
                <div className="accepted-icon-box">
                  <CheckCircle2 size={20} />
                </div>
                <div>
                  <strong>{effectivePatientName !== 'Patient' ? effectivePatientName : 'Patient'} accepted consent!</strong>
                  <span>Initializing camera and starting calibration…</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="live-metrics">
        <article className={isPatientRecording && isCalibrating ? 'metric-card-calibrating' : isPatientRecording ? 'metric-card-locked' : ''}>
          <Activity className={isPatientRecording ? 'pulse-anim' : ''} />
          <span>Pulse</span>
          {isPatientRecording && isCalibrating ? (
            <div className="metric-calibrating-box">
              <strong className="metric-calibrating-label">CALIBRATING</strong>
              <span className="metric-calibrating-time">{secondsRemaining}s left</span>
            </div>
          ) : (
            <strong>{measurement.heartRateBpm != null && Number.isFinite(measurement.heartRateBpm) ? Math.round(measurement.heartRateBpm) : '--'}</strong>
          )}
          <small>{isCalibrating ? `${secondsRemaining}s left · baseline establishing` : 'BPM · 30s clinical average'}</small>
        </article>
        <article className={isPatientRecording && isCalibrating ? 'metric-card-calibrating' : isPatientRecording ? 'metric-card-locked' : ''}>
          <Wind className={isPatientRecording ? 'wind-anim' : ''} />
          <span>Breathing</span>
          {isPatientRecording && isCalibrating ? (
            <div className="metric-calibrating-box">
              <strong className="metric-calibrating-label">CALIBRATING</strong>
              <span className="metric-calibrating-time">{secondsRemaining}s left</span>
            </div>
          ) : (
            <strong>{measurement.respiratoryRate != null && Number.isFinite(measurement.respiratoryRate) ? (Math.round(measurement.respiratoryRate * 10) / 10).toFixed(1) : '--'}</strong>
          )}
          <small>{isCalibrating ? `${secondsRemaining}s left · baseline establishing` : 'breaths/min · 30s clinical average'}</small>
        </article>
      </div>

      <section className="measurement-trend">
        <div><strong>Heart-rate trend</strong><span>Current 30-second camera check</span><button type="button" className="text-button export-button" onClick={() => exportMeasurementCsv(appointmentId, trend)} disabled={!trend.length}><Download size={14} /> Export CSV</button></div>
        <HeartRateTrend samples={trend} />
      </section>

      <ResearchDiagnostics diagnostics={measurement.diagnostics} />

      <div className="progress-block">
        <div className="progress-label"><span>{measurement.message}</span><strong>{measurement.progress}%</strong></div>
        <div className="progress-track"><span style={{ width: `${measurement.progress}%` }} /></div>
        {(isRunning || isPatientRecording) && (
          <div className="signal-line">
            <LoaderCircle className="spin" size={16} />
            {isCalibrating
              ? `Establishing baseline (${secondsRemaining}s left) · Signal quality ${Math.round(measurement.signalQuality * 100)}%`
              : `Signal quality ${Math.round(measurement.signalQuality * 100)}%`}
          </div>
        )}
        {isComplete && <div className="signal-line success"><CheckCircle2 size={16} /> {recordMessage || (isPatient ? `Reading ready — saving for ${effectiveClinicianName !== 'Clinician' ? effectiveClinicianName : 'your clinician'}…` : `${effectivePatientName !== 'Patient' ? effectivePatientName : 'Patient'} result received`)}</div>}
        {measurement.status === 'failed' && <div className="signal-line error"><CircleAlert size={16} /> Video consultation remains available</div>}
      </div>

      <PrivateNotes
        appointmentId={appointmentId}
        patientName={effectivePatientName}
        vitals={{
          heartRateBpm: measurement.heartRateBpm,
          respiratoryRate: measurement.respiratoryRate,
          signalQuality: measurement.signalQuality,
          diagnostics: measurement.diagnostics,
        }}
      />

      <p className="clinician-measurement-note">This is the clinician-only results panel. It updates automatically when {effectivePatientName !== 'Patient' ? effectivePatientName : 'the patient'} completes their camera check.</p>

    </aside>
  );
}
