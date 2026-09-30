import { Activity, ArrowLeft, CalendarClock, ChevronDown, ChevronUp, ClipboardList, Download, FileText, LoaderCircle, Printer, Save, Video } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { loadPatientProfile, loadPrivateClinicalNote, savePrivateClinicalNote, type SavedMeasurement } from '../services/clinicAccess';

const time = (value: string) => new Date(value).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' });
const value = (input: number | null | undefined, suffix = '', digits = 0) => input === null || input === undefined ? '—' : `${input.toFixed(digits)}${suffix}`;
function Trend({ samples }: { samples: SavedMeasurement[] }) {
  const values = samples.map((sample) => sample.heart_rate_bpm).filter((sample): sample is number => Number.isFinite(sample));
  if (values.length < 2) return <div className="review-trend-empty">At least two saved samples are needed to draw the session trend.</div>;
  const min = Math.min(...values) - 2; const max = Math.max(...values) + 2; const range = Math.max(1, max - min);
  const points = values.map((item, index) => `${(index / (values.length - 1)) * 100},${44 - ((item - min) / range) * 36}`).join(' ');
  return <div className="review-trend" role="img" aria-label="Saved heart-rate samples over the consultation"><span>{Math.round(max)} BPM</span><svg viewBox="0 0 100 48" preserveAspectRatio="none"><polyline points={points} /></svg><span>{Math.round(min)} BPM</span><small>First saved sample</small><small>Latest saved sample</small></div>;
}
function exportCsv(appointmentId: string, samples: SavedMeasurement[]) {
  const fields = ['appointment_id', 'captured_at', 'heart_rate_bpm', 'respiratory_rate_bpm', 'signal_quality', 'algorithm_version'];
  const rows = samples.map((sample) => [appointmentId, sample.measured_at, sample.heart_rate_bpm, sample.respiratory_rate_bpm, sample.signal_quality, sample.algorithm_version ?? ''].map((item) => `"${String(item).replaceAll('"', '""')}"`).join(','));
  const blob = new Blob([[fields.join(','), ...rows].join('\n')], { type: 'text/csv;charset=utf-8' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `ventricura-review-${appointmentId}.csv`; link.click(); URL.revokeObjectURL(url);
}

const escapeHtml = (input: string) => input.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character] ?? character);

function exportConsultationPdf(input: { appointmentId: string; patientName: string; patientEmail: string; reason: string; startsAt: string; notes: string; samples: SavedMeasurement[] }) {
  const popup = window.open('', '_blank', 'noopener,noreferrer');
  if (!popup) return false;
  const latest = input.samples.at(-1);
  const diag = latest?.diagnostics as {
    cardiac?: {
      session_average_bpm?: number;
      clinical_bpm?: number;
      hrv_rmssd_ms?: number;
      stress_score?: number;
      stress_level?: string;
    };
    respiration?: {
      session_average_brpm?: number;
      clinical_brpm?: number;
    };
    engine?: {
      algorithm?: string;
    };
  } | undefined;

  const bpmVal = diag?.cardiac?.session_average_bpm ?? diag?.cardiac?.clinical_bpm ?? latest?.heart_rate_bpm;
  const brpmVal = diag?.respiration?.session_average_brpm ?? diag?.respiration?.clinical_brpm ?? latest?.respiratory_rate_bpm;
  const hrvVal = diag?.cardiac?.hrv_rmssd_ms;
  const stressVal = diag?.cardiac?.stress_score;
  const algo = latest?.algorithm_version ?? diag?.engine?.algorithm ?? 'railway-rppg-2.16';

  const rows = input.samples.map((sample) => {
    const sDiag = sample.diagnostics as { cardiac?: { session_average_bpm?: number; clinical_bpm?: number }; respiration?: { session_average_brpm?: number; clinical_brpm?: number } } | undefined;
    const sBpm = sDiag?.cardiac?.session_average_bpm ?? sDiag?.cardiac?.clinical_bpm ?? sample.heart_rate_bpm;
    const sBrpm = sDiag?.respiration?.session_average_brpm ?? sDiag?.respiration?.clinical_brpm ?? sample.respiratory_rate_bpm;
    return `<tr><td>${escapeHtml(time(sample.measured_at))}</td><td><strong>${value(sBpm, ' BPM')}</strong></td><td>${value(sBrpm, ' /min')}</td><td>${value(sample.signal_quality * 100, '%')}</td><td>${escapeHtml(sample.algorithm_version ?? algo)}</td></tr>`;
  }).join('');

  const safeNotes = escapeHtml(input.notes.trim() || 'No private clinician notes were recorded.').replace(/\n/g, '<br />');

  popup.document.write(`<!doctype html><html lang="en"><head><meta charset="utf-8" /><title>Ventricura Clinical Encounter Report — ${escapeHtml(input.patientName)}</title><style>
    @page { size: A4; margin: 15mm; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #161616; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; font-size: 9.5pt; line-height: 1.5; background: #ffffff; }
    header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 14px; border-bottom: 2.5px solid #181818; }
    .brand-title { font-size: 15pt; font-weight: 900; letter-spacing: .08em; color: #111111; }
    .report-badge { color: #555555; font-size: 7pt; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; margin-top: 2px; }
    .header-meta { text-align: right; color: #666666; font-size: 7.5pt; }
    .patient-box { margin-top: 18px; padding: 14px 16px; background: #f8f8f8; border: 1px solid #dcdcdc; display: grid; grid-template-columns: 1.2fr 1fr; gap: 12px; }
    .patient-box h1 { margin: 2px 0 4px; font-size: 18pt; letter-spacing: -.03em; color: #111111; }
    .patient-box p { margin: 0; color: #555555; font-size: 8.5pt; }
    .patient-meta-item strong { display: block; font-size: 8pt; color: #666666; text-transform: uppercase; letter-spacing: .06em; margin-bottom: 2px; }
    .patient-meta-item span { font-size: 9pt; color: #181818; font-weight: 600; }
    .vitals-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 18px 0; }
    .vital-card { padding: 12px 14px; border: 1px solid #cfcfcf; background: #fafafa; }
    .vital-card .label { color: #666666; font-size: 6.8pt; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
    .vital-card strong { display: block; margin: 4px 0 2px; font-size: 14.5pt; font-weight: 800; color: #111111; letter-spacing: -.03em; }
    .vital-card small { color: #777777; font-size: 6.8pt; }
    .section-title { margin: 20px 0 8px; font-size: 10.5pt; font-weight: 800; letter-spacing: -.02em; text-transform: uppercase; color: #222222; border-bottom: 1px solid #e0e0e0; padding-bottom: 4px; }
    .notes-box { min-height: 80px; padding: 14px; border: 1px solid #d4d4d4; background: #fdfdfd; font-family: inherit; font-size: 9pt; line-height: 1.55; color: #1e1e1e; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 8pt; }
    th { color: #5a5a5a; font-size: 6.8pt; font-weight: 700; letter-spacing: .06em; text-align: left; text-transform: uppercase; padding: 7px 8px; border-bottom: 1.5px solid #181818; }
    td { padding: 7px 8px; border-bottom: 1px solid #e2e2e2; }
    .disclaimer-block { margin-top: 22px; padding: 10px 12px; background: #f5f5f5; border-left: 3px solid #666666; color: #666666; font-size: 7pt; line-height: 1.45; }
    .signature-row { display: grid; grid-template-columns: 1.5fr 1fr; gap: 30px; margin-top: 26px; padding-top: 14px; border-top: 1px solid #cfcfcf; }
    .signature-line { border-bottom: 1px solid #111111; height: 26px; margin-top: 8px; }
    .signature-row span { font-size: 7.5pt; color: #555555; text-transform: uppercase; letter-spacing: .06em; }
    footer { margin-top: 20px; font-size: 7pt; color: #888888; display: flex; justify-content: space-between; }
    @media print { .no-print { display: none; } body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
  </style></head><body>
    <header>
      <div>
        <div class="brand-title">VENTRICURA</div>
        <div class="report-badge">Clinical Telehealth Encounter Report</div>
      </div>
      <div class="header-meta">
        <div><strong>Encounter ID:</strong> ${escapeHtml(input.appointmentId)}</div>
        <div><strong>Generated:</strong> ${escapeHtml(time(new Date().toISOString()))}</div>
      </div>
    </header>

    <main>
      <section class="patient-box">
        <div>
          <div class="report-badge">Patient Record</div>
          <h1>${escapeHtml(input.patientName)}</h1>
          <p>${escapeHtml(input.patientEmail)}</p>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
          <div class="patient-meta-item">
            <strong>Encounter Time</strong>
            <span>${escapeHtml(time(input.startsAt))}</span>
          </div>
          <div class="patient-meta-item">
            <strong>Clinical Reason</strong>
            <span>${escapeHtml(input.reason || 'General Consultation')}</span>
          </div>
        </div>
      </section>

      <div class="section-title">Objective Vitals Summary (contactless rPPG)</div>
      <section class="vitals-grid">
        <div class="vital-card">
          <div class="label">Pulse (Heart Rate)</div>
          <strong>${value(bpmVal, ' BPM')}</strong>
          <small>30s quality-weighted avg</small>
        </div>
        <div class="vital-card">
          <div class="label">Respiration Rate</div>
          <strong>${value(brpmVal, ' /min')}</strong>
          <small>Continuous optical tracking</small>
        </div>
        <div class="vital-card">
          <div class="label">Autonomic Biomarkers</div>
          <strong>${hrvVal != null ? `${Math.round(hrvVal)} ms` : '—'}</strong>
          <small>HRV (RMSSD)${stressVal != null ? ` · Stress ${Math.round(stressVal)}/100` : ''}</small>
        </div>
        <div class="vital-card">
          <div class="label">Signal Confidence</div>
          <strong>${latest ? value(latest.signal_quality * 100, '%') : '—'}</strong>
          <small>${input.samples.length} valid samples · ${escapeHtml(algo)}</small>
        </div>
      </section>

      <div class="section-title">Attending Clinician Consultation Notes</div>
      <section class="notes-box">${safeNotes}</section>

      <div class="section-title">Telemetry & Measurement Audit Log</div>
      <section>
        ${input.samples.length ? `<table>
          <thead>
            <tr><th>Timestamp</th><th>Pulse (BPM)</th><th>Respiration (/min)</th><th>Signal Quality</th><th>Engine Version</th></tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>` : '<p style="color:#777; font-size:8.5pt;">No discrete measurements were logged during this call.</p>'}
      </section>

      <div class="disclaimer-block">
        <strong>Notice on Contactless Telemetry:</strong> This record was generated by Ventricura Telehealth using facial reflectance photoplethysmography (rPPG). Optical vital signs are intended to provide supplementary clinical physiological data and must be interpreted by a qualified medical practitioner alongside clinical history and examination. Not certified as a sole diagnostic instrument.
      </div>

      <section class="signature-row">
        <div>
          <span>Attending Clinician Signature</span>
          <div class="signature-line"></div>
        </div>
        <div>
          <span>Date & Certification</span>
          <div class="signature-line"></div>
        </div>
      </section>
    </main>

    <footer>
      <span>Ventricura Telehealth · Encrypted Health Records</span>
      <span>Page 1 of 1</span>
    </footer>

    <script>window.onload = () => { setTimeout(() => window.print(), 350); };</script>
  </body></html>`);
  popup.document.close();
  return true;
}

export function ConsultationReviewPage() {
  const [params] = useSearchParams(); const appointmentId = params.get('appointment') ?? ''; const patientId = params.get('patient') ?? '';
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading'); const [error, setError] = useState(''); const [patient, setPatient] = useState<Awaited<ReturnType<typeof loadPatientProfile>>>(); const [notes, setNotes] = useState(''); const [noteStatus, setNoteStatus] = useState<'saved' | 'saving' | 'error'>('saved'); const [showSamples, setShowSamples] = useState(false);
  useEffect(() => { if (!appointmentId || !patientId) { setError('This consultation review link is incomplete.'); setState('error'); return; } let active = true; void Promise.all([loadPatientProfile(patientId), loadPrivateClinicalNote(appointmentId)]).then(([profile, note]) => { if (!active) return; setPatient(profile); setNotes(note.content); setState('ready'); }).catch((reason) => { if (!active) return; setError(reason instanceof Error ? reason.message : 'Could not load this consultation review.'); setState('error'); }); return () => { active = false; }; }, [appointmentId, patientId]);
  const appointment = useMemo(() => patient?.appointments.find((item) => item.id === appointmentId), [appointmentId, patient]);
  const samples = appointment?.measurements ?? []; const latest = samples.at(-1);
  const save = async () => { setNoteStatus('saving'); try { await savePrivateClinicalNote(appointmentId, notes); setNoteStatus('saved'); } catch { setNoteStatus('error'); } };
  const exportPdf = async () => { if (noteStatus !== 'saved') await save(); if (!exportConsultationPdf({ appointmentId, patientName: patient!.display_name, patientEmail: patient!.email, reason: appointment!.reason, startsAt: appointment!.starts_at, notes, samples })) setError('Your browser blocked the PDF window. Allow pop-ups for this site and try again.'); };
  if (state === 'loading') return <div className="workspace-state"><LoaderCircle className="spin" /><strong>Loading consultation record…</strong></div>;
  if (state === 'error' || !patient || !appointment) return <div className="workspace-state"><strong>Consultation review unavailable</strong><span>{error || 'This consultation could not be found.'}</span><Link className="button button-primary" to="/clinician">Back to workspace</Link></div>;
  return <div className="consultation-review-page"><header className="review-topbar"><Link className="back-link" to={`/clinician/patient?id=${encodeURIComponent(patientId)}`}><ArrowLeft size={18} /> Patient profile</Link><div><span>CONSULTATION REVIEW</span><strong>Saved session record</strong></div><div className="review-actions"><button className="button button-secondary button-small" onClick={() => void exportPdf()}><Printer size={16} /> Export PDF</button><Link className="button button-secondary button-small" to={`/consultation/${appointmentId}?role=clinician`}><Video size={16} /> Join live call</Link></div></header><section className="review-hero"><div><p className="eyebrow">{appointment.reason}</p><h1>{patient.display_name}</h1><p>{patient.email} · scheduled {time(appointment.starts_at)}</p></div><div className="review-hero-meta"><CalendarClock size={19} /><span>Session date</span><strong>{new Date(appointment.starts_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}</strong></div></section><section className="review-metrics"><article><Activity /><span>Latest pulse</span><strong>{value(latest?.heart_rate_bpm, ' BPM')}</strong><small>Saved API reading</small></article><article><Activity /><span>Latest breathing</span><strong>{value(latest?.respiratory_rate_bpm, ' /min')}</strong><small>Saved API reading</small></article><article><ClipboardList /><span>Signal quality</span><strong>{latest ? value(latest.signal_quality * 100, '%') : '—'}</strong><small>Latest saved sample</small></article><article><FileText /><span>Samples saved</span><strong>{samples.length}</strong><small>Session record</small></article></section><section className="review-grid"><article className="review-panel review-trend-panel"><div className="review-panel-heading"><div><p className="eyebrow">Session trend</p><h2>Pulse samples</h2></div><button className="text-button" onClick={() => exportCsv(appointmentId, samples)} disabled={!samples.length}><Download size={15} /> Export CSV</button></div><Trend samples={samples} /><p>Captured values returned by the rPPG API during this session.</p></article><article className="review-panel review-notes"><div className="review-panel-heading"><div><p className="eyebrow">Private record</p><h2>Clinician notes</h2></div><button className="button button-primary button-small" onClick={() => void save()} disabled={noteStatus === 'saving'}>{noteStatus === 'saving' ? <LoaderCircle className="spin" size={15} /> : <Save size={15} />}{noteStatus === 'saving' ? 'Saving…' : 'Save notes'}</button></div><textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Observations, discussion, follow-up…" maxLength={10000} /><small>{noteStatus === 'error' ? 'Notes could not be saved. Try again.' : `${notes.length.toLocaleString()}/10,000 characters · visible only to the clinician.`}</small></article></section><section className="review-panel raw-session-panel"><div className="review-panel-heading"><div><p className="eyebrow">Raw session data</p><h2>{samples.length} saved measurements</h2></div><button className="text-button" onClick={() => setShowSamples((visible) => !visible)}>{showSamples ? <><ChevronUp size={16} /> Hide table</> : <><ChevronDown size={16} /> View table</>}</button></div>{showSamples && <div className="review-samples"><div><span>Captured</span><span>Pulse</span><span>Breathing</span><span>Signal quality</span></div>{samples.map((sample) => <div key={sample.measured_at}><span>{time(sample.measured_at)}</span><span>{value(sample.heart_rate_bpm, ' BPM')}</span><span>{value(sample.respiratory_rate_bpm, ' /min')}</span><span>{value(sample.signal_quality * 100, '%')}</span></div>)}</div>}</section></div>;
}
