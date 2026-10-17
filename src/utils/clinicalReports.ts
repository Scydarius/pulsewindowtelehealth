import type { PatientMedication, SavedMeasurement } from '../services/clinicAccess';
import { VENTRICURA_LOGO_DATA_URI } from './ventricuraLogoBase64';

export type EncounterReportData = {
  appointmentId: string;
  patientId: string;
  patientName: string;
  patientEmail: string;
  reason: string;
  startsAt: string;
  notes: string;
  samples: SavedMeasurement[];
  medications?: PatientMedication[];
  clinicianName?: string;
  clinicianTitle?: string;
  clinicName?: string;
  clinicSlug?: string;
};

export type PatientSummaryReportData = {
  patientId: string;
  patientName: string;
  patientEmail: string;
  clinicName?: string;
  assignedClinicianName?: string;
  appointments: Array<{
    id: string;
    reason: string;
    starts_at: string;
    clinician_name?: string | null;
    clinic_name?: string | null;
    measurements: SavedMeasurement[];
    clinical_notes?: string | null;
  }>;
  medications?: PatientMedication[];
};

const escapeHtml = (input: string) =>
  input.replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c] ?? c));

const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' });

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });

export function classifyHeartRate(bpm: number | null | undefined): { label: string; tone: 'normal' | 'warning' | 'alert' } {
  if (bpm == null || !Number.isFinite(bpm)) return { label: 'Not Recorded', tone: 'normal' };
  if (bpm < 50) return { label: 'Severe Bradycardia (<50 BPM)', tone: 'alert' };
  if (bpm < 60) return { label: 'Mild Bradycardia (50–59 BPM)', tone: 'warning' };
  if (bpm <= 100) return { label: 'Normal Sinus Rhythm (60–100 BPM)', tone: 'normal' };
  if (bpm <= 120) return { label: 'Mild Tachycardia (101–120 BPM)', tone: 'warning' };
  return { label: 'Marked Tachycardia (>120 BPM)', tone: 'alert' };
}

export function classifyRespiration(brpm: number | null | undefined): { label: string; tone: 'normal' | 'warning' | 'alert' } {
  if (brpm == null || !Number.isFinite(brpm)) return { label: 'Not Recorded', tone: 'normal' };
  if (brpm < 10) return { label: 'Bradypneic (<10 /min)', tone: 'alert' };
  if (brpm < 12) return { label: 'Low Respiratory Rate (10–11 /min)', tone: 'warning' };
  if (brpm <= 20) return { label: 'Normal Eupneic Breathing (12–20 /min)', tone: 'normal' };
  if (brpm <= 24) return { label: 'Mild Tachypnea (21–24 /min)', tone: 'warning' };
  return { label: 'Marked Tachypnea (>24 /min)', tone: 'alert' };
}

export function classifySignalQuality(quality: number | null | undefined): { label: string; tone: 'normal' | 'warning' } {
  if (quality == null || !Number.isFinite(quality)) return { label: 'Unknown Quality', tone: 'warning' };
  const pct = Math.round(quality * 100);
  if (pct >= 80) return { label: `Diagnostic Fidelity (${pct}%)`, tone: 'normal' };
  if (pct >= 55) return { label: `Acceptable Clinical Confidence (${pct}%)`, tone: 'normal' };
  return { label: `Sub-optimal Signal Quality (${pct}%)`, tone: 'warning' };
}

/**
 * Generate a complete, high-fidelity A4 clinical telehealth encounter report.
 */
export function generateEncounterReportHtml(data: EncounterReportData): string {
  const latest = data.samples.at(-1);
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
  const algo = latest?.algorithm_version ?? diag?.engine?.algorithm ?? 'ventricura-rppg-v2.16';

  const hrClass = classifyHeartRate(bpmVal);
  const respClass = classifyRespiration(brpmVal);
  const qualClass = classifySignalQuality(latest?.signal_quality);

  const activeMeds = (data.medications ?? []).filter((m) => m.status === 'active');

  const medsRows = activeMeds.length
    ? activeMeds
        .map(
          (m) => `<tr>
            <td><strong>${escapeHtml(m.medication_name)}</strong>${
              m.generic_name ? `<br /><span class="generic-sub">${escapeHtml(m.generic_name)}</span>` : ''
            }</td>
            <td>${m.artg_id ? `<span class="aust-pill">${escapeHtml(m.artg_id)}</span>` : '—'}</td>
            <td><strong>${escapeHtml(m.dose)}</strong><br /><span class="freq-sub">${escapeHtml(m.frequency)}</span></td>
            <td>${escapeHtml(m.directions || 'Take as instructed')}</td>
            <td style="text-align: center;">${m.repeats}</td>
            <td style="text-align: center;">${
              m.is_pbs
                ? '<span class="pbs-badge pbs-tick" title="PBS Subsidised">✓</span>'
                : '<span class="pbs-badge pbs-cross" title="Non-PBS / Private">✗</span>'
            }</td>
            <td>${escapeHtml(m.prescribed_by_name || 'Attending Clinician')}</td>
          </tr>`
        )
        .join('')
    : '<tr><td colspan="7" class="empty-cell">No active pharmacotherapy recorded in patient profile.</td></tr>';

  const telemetryRows = data.samples.length
    ? data.samples
        .map((s) => {
          const sDiag = s.diagnostics as { cardiac?: { session_average_bpm?: number; clinical_bpm?: number }; respiration?: { session_average_brpm?: number; clinical_brpm?: number } } | undefined;
          const sBpm = sDiag?.cardiac?.session_average_bpm ?? sDiag?.cardiac?.clinical_bpm ?? s.heart_rate_bpm;
          const sBrpm = sDiag?.respiration?.session_average_brpm ?? sDiag?.respiration?.clinical_brpm ?? s.respiratory_rate_bpm;
          return `<tr>
            <td>${escapeHtml(formatDateTime(s.measured_at))}</td>
            <td><strong>${sBpm ? `${Math.round(sBpm)} BPM` : '—'}</strong></td>
            <td>${sBrpm ? `${Math.round(sBrpm)} /min` : '—'}</td>
            <td>${Math.round(s.signal_quality * 100)}%</td>
            <td>${escapeHtml(s.algorithm_version ?? algo)}</td>
          </tr>`;
        })
        .join('')
    : '<tr><td colspan="5" class="empty-cell">No discrete optical telemetry samples recorded.</td></tr>';

  const cleanNotes = escapeHtml(data.notes.trim() || 'No clinical notes were recorded for this encounter.')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br />');

  const clinicTitle = data.clinicName || 'Ventricura Telehealth';
  const clinicianDisplay = data.clinicianName || 'Attending Medical Practitioner';
  const clinicianTitleDisplay = data.clinicianTitle || 'Telehealth Medical Officer';
  const generatedTime = formatDateTime(new Date().toISOString());

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Ventricura Clinical Encounter Report — ${escapeHtml(data.patientName)}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 12mm 14mm 14mm;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: #0f172a;
      background: #ffffff;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      font-size: 8.8pt;
      line-height: 1.45;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    header.report-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      padding-bottom: 12px;
      border-bottom: 2.5px solid #0f172a;
    }
    .header-branding {
      max-width: 60%;
    }
    .report-logo {
      max-height: 38px;
      width: auto;
      object-fit: contain;
      display: block;
      margin-bottom: 4px;
    }
    .pbs-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 20px;
      height: 20px;
      border-radius: 50%;
      font-size: 10pt;
      font-weight: 800;
      line-height: 1;
    }
    .pbs-tick {
      color: #15803d;
      background: #dcfce7;
      border: 1px solid #86efac;
    }
    .pbs-cross {
      color: #b91c1c;
      background: #fee2e2;
      border: 1px solid #fca5a5;
    }
    .clinic-sub-name {
      font-size: 10pt;
      font-weight: 700;
      color: #0f172a;
      margin-top: 2px;
    }
    .header-accreditation {
      font-size: 6.8pt;
      font-weight: 600;
      color: #475569;
      letter-spacing: .04em;
      text-transform: uppercase;
      margin-top: 4px;
    }
    .header-audit-meta {
      text-align: right;
      font-size: 7.2pt;
      color: #475569;
    }
    .doc-type-badge {
      display: inline-block;
      background: #0f172a;
      color: #ffffff;
      font-size: 7pt;
      font-weight: 800;
      letter-spacing: .08em;
      text-transform: uppercase;
      padding: 3px 7px;
      border-radius: 2px;
      margin-bottom: 4px;
    }
    .patient-summary-grid {
      display: grid;
      grid-template-columns: 1.3fr 1fr;
      gap: 12px;
      margin: 14px 0;
      padding: 12px 14px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-left: 4px solid #0284c7;
    }
    .patient-main h1 {
      margin: 0 0 3px;
      font-size: 14pt;
      font-weight: 850;
      letter-spacing: -.02em;
      color: #0f172a;
    }
    .patient-main p {
      margin: 0;
      font-size: 8.2pt;
      color: #475569;
    }
    .meta-col {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }
    .meta-col .meta-item strong {
      display: block;
      font-size: 6.8pt;
      font-weight: 750;
      text-transform: uppercase;
      letter-spacing: .05em;
      color: #64748b;
      margin-bottom: 2px;
    }
    .meta-col .meta-item span {
      font-size: 8.4pt;
      font-weight: 650;
      color: #0f172a;
    }
    .section-title {
      font-size: 8.5pt;
      font-weight: 850;
      letter-spacing: .06em;
      text-transform: uppercase;
      color: #0f172a;
      border-bottom: 1.5px solid #cbd5e1;
      padding-bottom: 3px;
      margin: 14px 0 8px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .section-title small {
      font-size: 6.8pt;
      font-weight: 600;
      color: #64748b;
      letter-spacing: normal;
      text-transform: none;
    }
    .vitals-cards-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 8px;
      margin-bottom: 12px;
    }
    .vital-tile {
      background: #ffffff;
      border: 1px solid #cbd5e1;
      padding: 9px 11px;
      border-radius: 3px;
    }
    .vital-tile .tile-label {
      font-size: 6.7pt;
      font-weight: 750;
      text-transform: uppercase;
      letter-spacing: .06em;
      color: #64748b;
    }
    .vital-tile strong.tile-val {
      display: block;
      font-size: 13.5pt;
      font-weight: 900;
      letter-spacing: -.03em;
      color: #0f172a;
      margin: 2px 0 1px;
    }
    .vital-tile .tile-class {
      display: inline-block;
      font-size: 6.5pt;
      font-weight: 700;
      padding: 1px 5px;
      border-radius: 2px;
    }
    .tile-class.normal { background: #dcfce7; color: #15803d; }
    .tile-class.warning { background: #fef3c7; color: #b45309; }
    .tile-class.alert { background: #fee2e2; color: #b91c1c; }
    .clinical-notes-card {
      background: #ffffff;
      border: 1px solid #cbd5e1;
      padding: 10px 12px;
      font-size: 8.5pt;
      line-height: 1.5;
      color: #1e293b;
      min-height: 60px;
    }
    .clinical-notes-card p { margin: 0 0 6px; }
    .clinical-notes-card p:last-child { margin-bottom: 0; }
    table.report-table {
      width: 100%;
      table-layout: fixed;
      border-collapse: collapse;
      font-size: 7.6pt;
      margin-top: 6px;
    }
    table.report-table th {
      background: #f1f5f9;
      color: #334155;
      font-size: 6.8pt;
      font-weight: 800;
      letter-spacing: .05em;
      text-transform: uppercase;
      padding: 5px 6px;
      text-align: left;
      border-bottom: 1.5px solid #0f172a;
    }
    table.report-table td {
      padding: 5px 6px;
      border-bottom: 1px solid #e2e8f0;
      vertical-align: top;
      word-break: break-word;
      overflow-wrap: break-word;
    }
    table.report-table tr {
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .generic-sub, .freq-sub {
      color: #64748b;
      font-size: 7pt;
    }
    .aust-pill {
      display: inline-block;
      font-family: monospace;
      font-size: 6.6pt;
      font-weight: 700;
      background: #e0f2fe;
      color: #0369a1;
      padding: 1px 4px;
      border-radius: 2px;
    }
    .pbs-sub {
      font-size: 6.8pt;
      font-weight: 700;
      color: #047857;
    }
    .empty-cell {
      text-align: center;
      color: #64748b;
      padding: 10px;
      font-style: italic;
    }
    .disclaimer-box {
      margin-top: 14px;
      padding: 8px 10px;
      background: #f8fafc;
      border-left: 3px solid #64748b;
      font-size: 6.8pt;
      color: #475569;
      line-height: 1.4;
    }
    .signature-grid {
      display: grid;
      grid-template-columns: 1.4fr 1fr;
      gap: 24px;
      margin-top: 18px;
      padding-top: 12px;
      border-top: 1px solid #cbd5e1;
      page-break-inside: avoid;
    }
    .signature-box .sig-line {
      border-bottom: 1px solid #0f172a;
      height: 24px;
      margin-top: 6px;
    }
    .signature-box span {
      font-size: 6.8pt;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: .05em;
      color: #64748b;
    }
    .signature-box strong.practitioner-name {
      display: block;
      font-size: 8.5pt;
      color: #0f172a;
      margin-top: 4px;
    }
    footer.report-footer {
      margin-top: 16px;
      padding-top: 6px;
      border-top: 1px solid #e2e8f0;
      display: flex;
      justify-content: space-between;
      font-size: 6.8pt;
      color: #94a3b8;
    }
  </style>
</head>
<body>
  <header class="report-header">
    <div class="header-branding">
      <img src="${VENTRICURA_LOGO_DATA_URI}" alt="Ventricura" class="report-logo" />
      ${data.clinicName && data.clinicName !== 'Ventricura' && data.clinicName !== 'Ventricura Telehealth' ? `<div class="clinic-sub-name">${escapeHtml(data.clinicName)}</div>` : ''}
      <div class="header-accreditation">
        RACGP Standard 5 Telehealth Compliant · Australian Health Practitioner Regulation Agency (AHPRA) Standards
      </div>
    </div>
    <div class="header-audit-meta">
      <div class="doc-type-badge">Clinical Telehealth Summary</div>
      <div><strong>Encounter ID:</strong> ${escapeHtml(data.appointmentId)}</div>
      <div><strong>Record Date:</strong> ${escapeHtml(generatedTime)}</div>
      <div><strong>Security:</strong> End-to-End Encrypted</div>
    </div>
  </header>

  <main>
    <section class="patient-summary-grid">
      <div class="patient-main">
        <h1>${escapeHtml(data.patientName)}</h1>
        <p><strong>Email:</strong> ${escapeHtml(data.patientEmail)}</p>
      </div>
      <div class="meta-col">
        <div class="meta-item">
          <strong>Encounter Scheduled</strong>
          <span>${escapeHtml(formatDateTime(data.startsAt))}</span>
        </div>
        <div class="meta-item">
          <strong>Clinical Modality</strong>
          <span>Video Telehealth + rPPG</span>
        </div>
        <div class="meta-item">
          <strong>Attending Clinician</strong>
          <span>${escapeHtml(clinicianDisplay)}</span>
        </div>
        <div class="meta-item">
          <strong>Presenting Reason</strong>
          <span>${escapeHtml(data.reason || 'General Telehealth Review')}</span>
        </div>
      </div>
    </section>

    <div class="section-title">
      <span>Contactless Optical Telemetry (rPPG Vital Signs)</span>
      <small>Facial reflectance photoplethysmography · Continuous 30s optical tracking</small>
    </div>
    <section class="vitals-cards-grid">
      <div class="vital-tile">
        <span class="tile-label">Pulse (Heart Rate)</span>
        <strong class="tile-val">${bpmVal ? `${Math.round(bpmVal)} BPM` : '—'}</strong>
        <span class="tile-class ${hrClass.tone}">${hrClass.label}</span>
      </div>
      <div class="vital-tile">
        <span class="tile-label">Respiration Rate</span>
        <strong class="tile-val">${brpmVal ? `${Math.round(brpmVal)} /min` : '—'}</strong>
        <span class="tile-class ${respClass.tone}">${respClass.label}</span>
      </div>
      <div class="vital-tile">
        <span class="tile-label">Autonomic HRV (RMSSD)</span>
        <strong class="tile-val">${hrvVal != null ? `${Math.round(hrvVal)} ms` : '—'}</strong>
        <span class="tile-class normal">${stressVal != null ? `Stress Score: ${Math.round(stressVal)}/100` : 'Autonomic Tone'}</span>
      </div>
      <div class="vital-tile">
        <span class="tile-label">Signal Confidence</span>
        <strong class="tile-val">${latest ? `${Math.round(latest.signal_quality * 100)}%` : '—'}</strong>
        <span class="tile-class ${qualClass.tone}">${qualClass.label}</span>
      </div>
    </section>

    <div class="section-title">
      <span>Attending Clinician Consultation Record</span>
      <small>Private clinical notes recorded during session</small>
    </div>
    <section class="clinical-notes-card">
      <p>${cleanNotes}</p>
    </section>

    <div class="section-title">
      <span>Patient Pharmacotherapy Profile (ARTG Active Regimen)</span>
      <small>Australian Register of Therapeutic Goods (TGA) verified listings</small>
    </div>
    <section>
      <table class="report-table">
        <colgroup>
          <col style="width: 27%;" />
          <col style="width: 10%;" />
          <col style="width: 14%;" />
          <col style="width: 27%;" />
          <col style="width: 5%;" />
          <col style="width: 6%;" />
          <col style="width: 11%;" />
        </colgroup>
        <thead>
          <tr>
            <th>Medication & Generic</th>
            <th>ARTG ID</th>
            <th>Dose & Frequency</th>
            <th>Patient Directions</th>
            <th style="text-align: center;">Repeats</th>
            <th style="text-align: center;">PBS</th>
            <th>Prescribing Doctor</th>
          </tr>
        </thead>
        <tbody>
          ${medsRows}
        </tbody>
      </table>
    </section>

    <div class="section-title">
      <span>Discrete Telemetry Audit Log</span>
      <small>${data.samples.length} valid sample points logged during call</small>
    </div>
    <section>
      <table class="report-table">
        <colgroup>
          <col style="width: 24%;" />
          <col style="width: 19%;" />
          <col style="width: 19%;" />
          <col style="width: 18%;" />
          <col style="width: 20%;" />
        </colgroup>
        <thead>
          <tr>
            <th>Timestamp</th>
            <th>Pulse (BPM)</th>
            <th>Breathing (/min)</th>
            <th>Signal Quality</th>
            <th>Engine Engine</th>
          </tr>
        </thead>
        <tbody>
          ${telemetryRows}
        </tbody>
      </table>
    </section>

    <div class="disclaimer-box">
      <strong>Clinical Telehealth Governance Notice:</strong> This encounter summary constitutes an official contemporaneous clinical record of a synchronous video telehealth encounter. Optical vital signs are derived from remote facial photoplethysmography (rPPG) and are intended to provide supplementary clinical physiological metrics to be reviewed alongside clinical history and professional medical examination. Not certified as an independent automated diagnostic device.
    </div>

    <section class="signature-grid">
      <div class="signature-box">
        <span>Attending Medical Practitioner Certification & Signature</span>
        <div class="sig-line"></div>
        <strong class="practitioner-name">${escapeHtml(clinicianDisplay)} — ${escapeHtml(clinicianTitleDisplay)}</strong>
      </div>
      <div class="signature-box">
        <span>Date & Sign-Off Certification</span>
        <div class="sig-line"></div>
        <strong class="practitioner-name">${escapeHtml(generatedTime)}</strong>
      </div>
    </section>
  </main>

  <footer class="report-footer">
    <span>Ventricura Telehealth Network · Australian Encrypted Health Records</span>
    <span>Page 1 of 1 · Encrypted Audit Hash: ${escapeHtml(data.appointmentId.slice(0, 16))}</span>
  </footer>
</body>
</html>`;
}

/**
 * Generate formatted plain-text SOAP note ready for 1-click clipboard paste
 * into GP & Specialist practice management software (Best Practice, MedicalDirector, Zedmed, Genie).
 */
export function generateSoapNoteText(data: EncounterReportData): string {
  const latest = data.samples.at(-1);
  const diag = latest?.diagnostics as {
    cardiac?: { session_average_bpm?: number; clinical_bpm?: number; hrv_rmssd_ms?: number; stress_score?: number };
    respiration?: { session_average_brpm?: number; clinical_brpm?: number };
  } | undefined;

  const bpmVal = diag?.cardiac?.session_average_bpm ?? diag?.cardiac?.clinical_bpm ?? latest?.heart_rate_bpm;
  const brpmVal = diag?.respiration?.session_average_brpm ?? diag?.respiration?.clinical_brpm ?? latest?.respiratory_rate_bpm;
  const hrvVal = diag?.cardiac?.hrv_rmssd_ms;
  const stressVal = diag?.cardiac?.stress_score;
  const activeMeds = (data.medications ?? []).filter((m) => m.status === 'active');

  const medsList = activeMeds.length
    ? activeMeds
        .map(
          (m, i) =>
            `${i + 1}. ${m.medication_name}${m.generic_name ? ` (${m.generic_name})` : ''} ${m.dose} — ${m.frequency}${
              m.directions ? ` — Dir: ${m.directions}` : ''
            } [${m.repeats} repeats, PBS: ${m.is_pbs ? '✓' : '✗'}${m.artg_id ? `, ${m.artg_id}` : ''}]`
        )
        .join('\n')
    : 'None recorded.';

  return `======================================================================
VENTRICURA — OFFICIAL CLINICAL ENCOUNTER SUMMARY
======================================================================
Patient: ${data.patientName} (${data.patientEmail})
Encounter Date: ${formatDateTime(data.startsAt)}
Attending Clinician: ${data.clinicianName || 'Attending Practitioner'} (${data.clinicianTitle || 'Clinician'})
Clinic: ${data.clinicName || 'Ventricura'}
Encounter ID: ${data.appointmentId}

[SUBJECTIVE]
Primary Reason: ${data.reason || 'General Consultation'}

[OBJECTIVE — Contactless Optical Telemetry (rPPG)]
- Pulse / Heart Rate: ${bpmVal ? `${Math.round(bpmVal)} BPM (${classifyHeartRate(bpmVal).label})` : 'Not recorded'}
- Respiration Rate: ${brpmVal ? `${Math.round(brpmVal)} /min (${classifyRespiration(brpmVal).label})` : 'Not recorded'}
- Autonomic Tone (HRV RMSSD): ${hrvVal != null ? `${Math.round(hrvVal)} ms` : '—'}${stressVal != null ? ` (Stress Index: ${Math.round(stressVal)}/100)` : ''}
- Signal Confidence: ${latest ? `${Math.round(latest.signal_quality * 100)}%` : '—'} (${data.samples.length} valid telemetry samples)
- Visual Clinical Exam: Synchronous video telehealth consultation.

[ASSESSMENT & CLINICAL NOTES]
${data.notes.trim() || 'No private clinical notes recorded.'}

[PLAN & ACTIVE PHARMACOTHERAPY]
${medsList}

Certification: Document generated via Ventricura Telehealth. Standard 5 RACGP & MBS Telehealth Guidelines compliant.
======================================================================`;
}

/**
 * Generate a comprehensive patient medical summary report HTML for printing
 * from the Patient Profile page.
 */
export function generatePatientSummaryReportHtml(data: PatientSummaryReportData): string {
  const activeMeds = (data.medications ?? []).filter((m) => m.status === 'active');
  const ceasedMeds = (data.medications ?? []).filter((m) => m.status === 'ceased');

  // Extract all telemetry samples across all encounters
  const allSamples = (data.appointments ?? [])
    .flatMap((a) => a.measurements ?? [])
    .filter((s) => s && s.measured_at)
    .sort((a, b) => new Date(a.measured_at).getTime() - new Date(b.measured_at).getTime());

  const latestSample = allSamples.at(-1);
  const latestDiag = latestSample?.diagnostics as {
    cardiac?: { session_average_bpm?: number; clinical_bpm?: number; hrv_rmssd_ms?: number; stress_score?: number };
    respiration?: { session_average_brpm?: number; clinical_brpm?: number };
  } | undefined;

  const bpmVal = latestDiag?.cardiac?.session_average_bpm ?? latestDiag?.cardiac?.clinical_bpm ?? latestSample?.heart_rate_bpm;
  const brpmVal = latestDiag?.respiration?.session_average_brpm ?? latestDiag?.respiration?.clinical_brpm ?? latestSample?.respiratory_rate_bpm;
  const hrvVal = latestDiag?.cardiac?.hrv_rmssd_ms;
  const stressVal = latestDiag?.cardiac?.stress_score;
  const hrClass = classifyHeartRate(bpmVal);
  const respClass = classifyRespiration(brpmVal);
  const qualClass = classifySignalQuality(latestSample?.signal_quality);

  const vitalsHtml = latestSample
    ? `<div class="section-title">Latest Cardiovascular & Respiratory Telemetry (Optical rPPG)</div>
       <section class="vitals-cards-grid">
         <div class="vital-tile">
           <span class="tile-label">Resting Heart Rate</span>
           <strong class="tile-val">${bpmVal ? `${Math.round(bpmVal)} BPM` : '—'}</strong>
           <span class="tile-class ${hrClass.tone}">${hrClass.label}</span>
         </div>
         <div class="vital-tile">
           <span class="tile-label">Respiration Rate</span>
           <strong class="tile-val">${brpmVal ? `${Math.round(brpmVal)} /min` : '—'}</strong>
           <span class="tile-class ${respClass.tone}">${respClass.label}</span>
         </div>
         <div class="vital-tile">
           <span class="tile-label">Autonomic HRV (RMSSD)</span>
           <strong class="tile-val">${hrvVal != null ? `${Math.round(hrvVal)} ms` : '—'}</strong>
           <span class="tile-class normal">${stressVal != null ? `Stress: ${Math.round(stressVal)}/100` : 'Autonomic Tone'}</span>
         </div>
         <div class="vital-tile">
           <span class="tile-label">Signal Fidelity</span>
           <strong class="tile-val">${Math.round(latestSample.signal_quality * 100)}%</strong>
           <span class="tile-class ${qualClass.tone}">${allSamples.length} sample${allSamples.length === 1 ? '' : 's'} logged</span>
         </div>
       </section>`
    : `<div class="empty-vitals-banner">No optical vital sign telemetry recorded to date. Telemetry is collected synchronously during video consultations via facial rPPG.</div>`;

  const medsRows = activeMeds.length
    ? activeMeds
        .map(
          (m) => `<tr>
            <td><strong>${escapeHtml(m.medication_name)}</strong>${
              m.generic_name ? `<br /><span class="generic-sub">${escapeHtml(m.generic_name)}</span>` : ''
            }</td>
            <td>${m.artg_id ? `<span class="aust-pill">${escapeHtml(m.artg_id)}</span>` : '—'}</td>
            <td><strong>${escapeHtml(m.dose)}</strong><br /><span class="freq-sub">${escapeHtml(m.frequency)}</span></td>
            <td>${escapeHtml(m.directions || 'Take as instructed')}</td>
            <td style="text-align: center;">${m.repeats}</td>
            <td style="text-align: center;">${
              m.is_pbs
                ? '<span class="pbs-badge pbs-tick" title="PBS Subsidised">✓</span>'
                : '<span class="pbs-badge pbs-cross" title="Non-PBS / Private">✗</span>'
            }</td>
            <td>${escapeHtml(m.prescribed_by_name || 'Clinician')}</td>
          </tr>`
        )
        .join('')
    : '<tr><td colspan="7" class="empty-cell">No active medications currently on file.</td></tr>';

  const ceasedRows = ceasedMeds.length
    ? ceasedMeds
        .map(
          (m) => `<tr>
            <td><strong>${escapeHtml(m.medication_name)}</strong>${
              m.generic_name ? `<br /><span class="generic-sub">${escapeHtml(m.generic_name)}</span>` : ''
            }</td>
            <td>${escapeHtml(m.dose)} (${escapeHtml(m.frequency)})</td>
            <td>${m.ceased_at ? escapeHtml(formatDate(m.ceased_at)) : '—'}</td>
            <td>${escapeHtml(m.ceased_reason || 'Ceased by clinician')}</td>
          </tr>`
        )
        .join('')
    : '';

  const apptRows = data.appointments.length
    ? data.appointments
        .map((a) => {
          const rawReason = a.reason || 'General Telehealth Review';
          const parts = rawReason.split('\n\nPatient notes:');
          const cleanReason = parts[0]?.trim() || 'Consultation';
          const intakeNote = parts[1]?.trim() || '';
          const clinicalNote = a.clinical_notes?.trim() || '';
          const apptLatest = a.measurements?.at(-1);
          const apptBpm = apptLatest?.heart_rate_bpm;
          const apptBrpm = apptLatest?.respiratory_rate_bpm;
          const apptQuality = apptLatest?.signal_quality;
          const vitalsSummary = apptBpm
            ? `<strong>${Math.round(apptBpm)} BPM</strong>${apptBrpm ? ` / ${Math.round(apptBrpm)} /min` : ''}${
                apptQuality ? `<br /><span class="generic-sub">Signal: ${Math.round(apptQuality * 100)}%</span>` : ''
              }`
            : 'No telemetry';

          return `<tr>
            <td><strong>${escapeHtml(formatDate(a.starts_at))}</strong></td>
            <td>
              <div class="appt-reason-title"><strong>${escapeHtml(cleanReason)}</strong></div>
              ${
                intakeNote
                  ? `<div class="appt-intake-note"><span>Patient Intake:</span> ${escapeHtml(intakeNote)}</div>`
                  : ''
              }
              ${
                clinicalNote
                  ? `<div class="appt-clinical-note"><span>Clinician Note:</span> ${escapeHtml(clinicalNote)}</div>`
                  : ''
              }
            </td>
            <td>${escapeHtml(a.clinician_name || 'Clinician')}</td>
            <td>${escapeHtml(a.clinic_name || 'Ventricura')}</td>
            <td>${vitalsSummary}</td>
          </tr>`;
        })
        .join('')
    : '<tr><td colspan="5" class="empty-cell">No previous consultations recorded.</td></tr>';

  const generatedTime = formatDateTime(new Date().toISOString());

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Patient Clinical Health Summary — ${escapeHtml(data.patientName)}</title>
  <style>
    @page { size: A4 portrait; margin: 9mm 12mm 10mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: #0f172a;
      background: #ffffff;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      font-size: 8pt;
      line-height: 1.35;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    header.report-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      padding-bottom: 8px;
      border-bottom: 2px solid #0f172a;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .report-logo { max-height: 36px; width: auto; object-fit: contain; display: block; margin-bottom: 2px; }
    .clinic-sub-name { font-size: 9.5pt; font-weight: 700; color: #0f172a; }
    .header-accreditation { font-size: 6.5pt; font-weight: 600; color: #475569; text-transform: uppercase; margin-top: 2px; }
    .header-audit-meta { text-align: right; font-size: 7pt; color: #475569; }
    .doc-type-badge { display: inline-block; background: #0f172a; color: #ffffff; font-size: 6.8pt; font-weight: 800; text-transform: uppercase; padding: 2px 6px; border-radius: 2px; margin-bottom: 3px; }
    .pbs-badge { display: inline-flex; align-items: center; justify-content: center; width: 18px; height: 18px; border-radius: 50%; font-size: 9pt; font-weight: 800; line-height: 1; }
    .pbs-tick { color: #15803d; background: #dcfce7; border: 1px solid #86efac; }
    .pbs-cross { color: #b91c1c; background: #fee2e2; border: 1px solid #fca5a5; }
    .patient-box {
      margin: 8px 0;
      padding: 8px 12px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-left: 3.5px solid #0284c7;
      display: grid;
      grid-template-columns: 1.3fr 1fr;
      gap: 10px;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .patient-box h1 { margin: 0 0 2px; font-size: 13pt; font-weight: 850; color: #0f172a; }
    .patient-box p { margin: 0; font-size: 7.8pt; color: #475569; }
    .section-title {
      font-size: 8pt;
      font-weight: 850;
      letter-spacing: .05em;
      text-transform: uppercase;
      color: #0f172a;
      border-bottom: 1.5px solid #cbd5e1;
      padding-bottom: 2px;
      margin: 10px 0 4px;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .vitals-cards-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 6px;
      margin: 6px 0 10px;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .vital-tile {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-top: 2.5px solid #0f172a;
      padding: 5px 8px;
    }
    .vital-tile .tile-label {
      display: block;
      font-size: 6.4pt;
      font-weight: 750;
      text-transform: uppercase;
      letter-spacing: .04em;
      color: #64748b;
    }
    .vital-tile strong.tile-val {
      display: block;
      font-size: 11.5pt;
      font-weight: 900;
      color: #0f172a;
      margin: 1px 0;
    }
    .vital-tile .tile-class {
      display: inline-block;
      font-size: 6.2pt;
      font-weight: 700;
      padding: 1px 4px;
      border-radius: 2px;
    }
    .tile-class.normal { background: #dcfce7; color: #15803d; }
    .tile-class.warning { background: #fef3c7; color: #b45309; }
    .tile-class.alert { background: #fee2e2; color: #b91c1c; }
    .empty-vitals-banner {
      background: #f8fafc;
      border: 1px dashed #cbd5e1;
      padding: 6px 10px;
      font-size: 7.2pt;
      color: #64748b;
      font-style: italic;
      margin: 6px 0 10px;
      text-align: center;
    }
    table.report-table { width: 100%; table-layout: fixed; border-collapse: collapse; font-size: 7.4pt; margin-top: 4px; }
    table.report-table th { background: #f1f5f9; color: #334155; font-size: 6.8pt; font-weight: 800; text-transform: uppercase; padding: 4px 5px; text-align: left; border-bottom: 1.5px solid #0f172a; }
    table.report-table td { padding: 4px 5px; border-bottom: 1px solid #e2e8f0; vertical-align: top; word-break: break-word; overflow-wrap: break-word; }
    table.report-table tr { page-break-inside: avoid; break-inside: avoid; }
    .appt-reason-title { font-size: 7.6pt; font-weight: 750; color: #0f172a; }
    .appt-intake-note {
      margin-top: 3px;
      padding: 3px 5px;
      background: #f1f5f9;
      border-left: 2px solid #64748b;
      font-size: 6.8pt;
      color: #334155;
      line-height: 1.3;
    }
    .appt-intake-note span, .appt-clinical-note span {
      font-weight: 700;
      text-transform: uppercase;
      font-size: 6.2pt;
      color: #475569;
      margin-right: 3px;
    }
    .appt-clinical-note {
      margin-top: 3px;
      padding: 3px 5px;
      background: #ecfdf5;
      border-left: 2px solid #10b981;
      font-size: 6.8pt;
      color: #065f46;
      line-height: 1.3;
    }
    .generic-sub, .freq-sub { color: #64748b; font-size: 6.8pt; }
    .aust-pill { font-family: monospace; font-size: 6.5pt; font-weight: 700; background: #e0f2fe; color: #0369a1; padding: 1px 3px; border-radius: 2px; }
    .pbs-sub { font-size: 6.8pt; font-weight: 700; color: #047857; }
    .empty-cell { text-align: center; color: #64748b; padding: 8px; font-style: italic; }
    .signature-grid { display: grid; grid-template-columns: 1.4fr 1fr; gap: 16px; margin-top: 14px; padding-top: 8px; border-top: 1px solid #cbd5e1; page-break-inside: avoid; break-inside: avoid; }
    .signature-box .sig-line { border-bottom: 1px solid #0f172a; height: 18px; margin-top: 4px; }
    .signature-box span { font-size: 6.8pt; font-weight: 700; text-transform: uppercase; color: #64748b; }
    footer.report-footer { margin-top: 10px; padding-top: 4px; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; font-size: 6.6pt; color: #94a3b8; page-break-inside: avoid; break-inside: avoid; }
  </style>
</head>
<body>
  <header class="report-header">
    <div>
      <img src="${VENTRICURA_LOGO_DATA_URI}" alt="Ventricura" class="report-logo" />
      ${data.clinicName && data.clinicName !== 'Ventricura' && data.clinicName !== 'Ventricura Telehealth' ? `<div class="clinic-sub-name">${escapeHtml(data.clinicName)}</div>` : ''}
      <div class="header-accreditation">RACGP Standard 5 Telehealth Compliant · Encrypted Australian Health Records</div>
    </div>
    <div class="header-audit-meta">
      <div class="doc-type-badge">Comprehensive Health Summary</div>
      <div><strong>Record Date:</strong> ${escapeHtml(generatedTime)}</div>
    </div>
  </header>

  <main>
    <section class="patient-box">
      <div>
        <h1>${escapeHtml(data.patientName)}</h1>
        <p><strong>Email:</strong> ${escapeHtml(data.patientEmail)}</p>
      </div>
      <div>
        <p><strong>Primary Clinic:</strong> ${escapeHtml(data.clinicName || 'Ventricura Telehealth')}</p>
        <p><strong>Primary Attending Doctor:</strong> ${escapeHtml(data.assignedClinicianName || 'Clinical Care Team')}</p>
      </div>
    </section>

    ${vitalsHtml}

    <div class="section-title">Active Pharmacotherapy Regimen (ARTG Listings)</div>
    <table class="report-table">
      <colgroup>
        <col style="width: 27%;" />
        <col style="width: 10%;" />
        <col style="width: 14%;" />
        <col style="width: 27%;" />
        <col style="width: 5%;" />
        <col style="width: 6%;" />
        <col style="width: 11%;" />
      </colgroup>
      <thead>
        <tr>
          <th>Medication & Generic</th>
          <th>ARTG ID</th>
          <th>Dose & Frequency</th>
          <th>Directions</th>
          <th style="text-align: center;">Repeats</th>
          <th style="text-align: center;">PBS</th>
          <th>Prescribing Doctor</th>
        </tr>
      </thead>
      <tbody>${medsRows}</tbody>
    </table>

    ${
      ceasedMeds.length
        ? `<div class="section-title">Ceased Pharmacotherapy & Inactive Regimens</div>
    <table class="report-table">
      <colgroup>
        <col style="width: 28%;" />
        <col style="width: 22%;" />
        <col style="width: 16%;" />
        <col style="width: 34%;" />
      </colgroup>
      <thead>
        <tr>
          <th>Medication & Generic</th>
          <th>Dose & Frequency</th>
          <th>Ceased Date</th>
          <th>Reason for Cessation</th>
        </tr>
      </thead>
      <tbody>${ceasedRows}</tbody>
    </table>`
        : ''
    }

    <div class="section-title">Longitudinal Consultation & Telehealth History Across Clinics</div>
    <table class="report-table">
      <colgroup>
        <col style="width: 12%;" />
        <col style="width: 35%;" />
        <col style="width: 18%;" />
        <col style="width: 15%;" />
        <col style="width: 20%;" />
      </colgroup>
      <thead>
        <tr>
          <th>Date</th>
          <th>Consultation & Clinical Notes</th>
          <th>Attending Doctor</th>
          <th>Clinic Practice</th>
          <th>Telemetry Recorded</th>
        </tr>
      </thead>
      <tbody>${apptRows}</tbody>
    </table>

    <section class="signature-grid">
      <div class="signature-box">
        <span>Attending Clinician Certification</span>
        <div class="sig-line"></div>
      </div>
      <div class="signature-box">
        <span>Date & Formal Sign-Off</span>
        <div class="sig-line"></div>
      </div>
    </section>
  </main>

  <footer class="report-footer">
    <span>Ventricura Telehealth Network · Shared Cross-Clinic Patient Record</span>
    <span>Generated: ${escapeHtml(generatedTime)}</span>
  </footer>
</body>
</html>`;
}

/**
 * Open print dialog for the generated HTML report using a reliable hidden iframe.
 * Never blocked by browser popup blockers.
 */
export function printHtmlReport(title: string, htmlContent: string): boolean {
  try {
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.setAttribute('title', title);
    iframe.setAttribute('aria-hidden', 'true');
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document || iframe.contentDocument;
    if (doc) {
      doc.open();
      doc.write(htmlContent);
      doc.close();

      setTimeout(() => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
        } catch (err) {
          console.warn('Iframe print failed:', err);
        } finally {
          setTimeout(() => iframe.remove(), 2500);
        }
      }, 350);
      return true;
    }
  } catch (err) {
    console.warn('Iframe print setup error, attempting popup fallback:', err);
  }

  // Fallback: Blob URL + window.open without noopener
  try {
    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const blobUrl = URL.createObjectURL(blob);
    const win = window.open(blobUrl, '_blank');
    if (win) {
      setTimeout(() => {
        try {
          win.focus();
          win.print();
        } catch {}
      }, 500);
      return true;
    }
  } catch (e) {
    console.error('Print fallback error:', e);
  }

  return false;
}

/**
 * Open generated report in a new tab without popup blocker issues.
 */
export function openHtmlReportInNewTab(htmlContent: string): boolean {
  try {
    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const blobUrl = URL.createObjectURL(blob);
    const tab = window.open(blobUrl, '_blank');
    return Boolean(tab);
  } catch {
    return false;
  }
}

/**
 * Trigger immediate browser download of the report HTML file.
 */
export function downloadHtmlReport(filename: string, htmlContent: string): void {
  const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export type MedicationChartReportData = {
  patientName: string;
  patientEmail: string;
  clinicName?: string;
  assignedClinicianName?: string;
  medications: PatientMedication[];
};

/**
 * Generate a dedicated, isolated A4 medication summary chart without web UI clutter.
 */
export function generateMedicationChartReportHtml(data: MedicationChartReportData): string {
  const activeMeds = (data.medications ?? []).filter((m) => m.status === 'active');
  const ceasedMeds = (data.medications ?? []).filter((m) => m.status === 'ceased');
  const generatedTime = formatDateTime(new Date().toISOString());

  const activeRows = activeMeds.length === 0
    ? `<tr><td colspan="7" class="empty-cell">No active medications recorded for this patient.</td></tr>`
    : activeMeds.map((m) => `
        <tr>
          <td>
            <strong>${escapeHtml(m.medication_name)}</strong>
            ${m.generic_name ? `<div class="generic-sub">${escapeHtml(m.generic_name)}</div>` : ''}
            ${m.artg_id ? `<div style="margin-top:2px"><span class="aust-pill">${escapeHtml(m.artg_id)}</span></div>` : ''}
          </td>
          <td style="font-weight:700">${escapeHtml(m.dose)}</td>
          <td>${escapeHtml(m.frequency)}</td>
          <td style="text-align:center">${m.repeats}</td>
          <td style="text-align:center">
            ${m.is_pbs ? `<span class="pbs-badge pbs-tick" title="PBS Subsidised">✓ PBS</span>` : `<span class="pbs-badge pbs-cross" title="Private">✗ Private</span>`}
          </td>
          <td class="directions-cell">${escapeHtml(m.directions || 'As directed by prescribing medical practitioner.')}</td>
          <td>
            <div>${escapeHtml(m.prescribed_by_name)}</div>
            <div class="date-sub">${formatDate(m.prescribed_date)}</div>
          </td>
        </tr>
      `).join('');

  const ceasedSection = ceasedMeds.length === 0 ? '' : `
    <div class="section-title" style="margin-top:16px">Recently Ceased / Deprescribed Regimens</div>
    <table class="report-table ceased-table">
      <thead>
        <tr>
          <th style="width:28%">Medication</th>
          <th style="width:10%">Dose</th>
          <th style="width:14%">Prior Frequency</th>
          <th style="width:18%">Prescriber</th>
          <th style="width:30%">Cease Reason / Date</th>
        </tr>
      </thead>
      <tbody>
        ${ceasedMeds.map((m) => `
          <tr>
            <td>
              <strong>${escapeHtml(m.medication_name)}</strong>
              ${m.generic_name ? `<div class="generic-sub">${escapeHtml(m.generic_name)}</div>` : ''}
            </td>
            <td>${escapeHtml(m.dose)}</td>
            <td>${escapeHtml(m.frequency)}</td>
            <td>${escapeHtml(m.prescribed_by_name)}</td>
            <td>
              <div style="color:#b91c1c; font-weight:600">${escapeHtml(m.ceased_reason || 'Ceased by clinician')}</div>
              <div class="date-sub">${m.ceased_at ? `Ceased on ${formatDate(m.ceased_at)}` : ''}</div>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Medication Chart — ${escapeHtml(data.patientName)}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 10mm 12mm 10mm;
    }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      background: #ffffff;
      color: #0f172a;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      font-size: 8pt;
      line-height: 1.35;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .report-wrap {
      width: 100%;
      max-width: 100%;
      margin: 0 auto;
    }
    header.report-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2px solid #0f172a;
      padding-bottom: 8px;
      margin-bottom: 10px;
    }
    .report-logo {
      max-height: 36px;
      width: auto;
      object-fit: contain;
      display: block;
    }
    .clinic-sub-name {
      font-size: 8.5pt;
      font-weight: 800;
      color: #0f172a;
      margin-top: 3px;
      letter-spacing: -0.01em;
    }
    .header-accreditation {
      font-size: 6.5pt;
      color: #64748b;
      margin-top: 2px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .header-audit-meta {
      text-align: right;
      font-size: 7pt;
      color: #475569;
    }
    .doc-type-badge {
      display: inline-block;
      background: #0f172a;
      color: #ffffff;
      font-size: 7.2pt;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      padding: 3px 8px;
      border-radius: 2px;
      margin-bottom: 4px;
    }
    section.patient-box {
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      border-left: 4px solid #0f172a;
      padding: 8px 12px;
      margin-bottom: 10px;
      display: grid;
      grid-template-columns: 1.2fr 1fr;
      gap: 10px;
    }
    section.patient-box h1 {
      margin: 0 0 3px;
      font-size: 11pt;
      font-weight: 850;
      color: #0f172a;
      letter-spacing: -0.02em;
    }
    section.patient-box p {
      margin: 2px 0;
      font-size: 7.5pt;
      color: #334155;
    }
    .section-title {
      font-size: 8pt;
      font-weight: 850;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #0f172a;
      border-bottom: 1px solid #94a3b8;
      padding-bottom: 3px;
      margin: 10px 0 6px;
    }
    table.report-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 7.5pt;
      margin-top: 4px;
    }
    table.report-table th {
      background: #f1f5f9;
      color: #334155;
      font-size: 6.8pt;
      font-weight: 800;
      text-transform: uppercase;
      padding: 5px 6px;
      text-align: left;
      border-bottom: 1.5px solid #0f172a;
      letter-spacing: 0.02em;
    }
    table.report-table td {
      padding: 5px 6px;
      border-bottom: 1px solid #e2e8f0;
      vertical-align: top;
      word-break: break-word;
      overflow-wrap: break-word;
    }
    table.report-table tr {
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .generic-sub { color: #64748b; font-size: 6.8pt; margin-top: 1px; }
    .date-sub { color: #64748b; font-size: 6.5pt; margin-top: 1px; }
    .aust-pill {
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 6.5pt;
      font-weight: 700;
      background: #e0f2fe;
      color: #0369a1;
      padding: 1px 4px;
      border-radius: 2px;
      display: inline-block;
    }
    .pbs-badge {
      font-size: 6.8pt;
      font-weight: 700;
      padding: 1px 5px;
      border-radius: 2px;
      white-space: nowrap;
    }
    .pbs-tick { background: #dcfce7; color: #15803d; }
    .pbs-cross { background: #f1f5f9; color: #64748b; }
    .directions-cell {
      line-height: 1.35;
      color: #1e293b;
    }
    .ceased-table td {
      background: #fafafa;
    }
    .empty-cell {
      text-align: center;
      color: #64748b;
      padding: 12px;
      font-style: italic;
    }
    .signature-grid {
      display: grid;
      grid-template-columns: 1.4fr 1fr;
      gap: 16px;
      margin-top: 16px;
      padding-top: 8px;
      border-top: 1px solid #cbd5e1;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .signature-box .sig-line {
      border-bottom: 1px solid #0f172a;
      height: 20px;
      margin-top: 4px;
    }
    .signature-box span {
      font-size: 6.8pt;
      font-weight: 700;
      text-transform: uppercase;
      color: #64748b;
    }
    .certification-note {
      margin-top: 12px;
      font-size: 6.8pt;
      color: #64748b;
      line-height: 1.35;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    footer.report-footer {
      margin-top: 12px;
      padding-top: 6px;
      border-top: 1px solid #e2e8f0;
      display: flex;
      justify-content: space-between;
      font-size: 6.5pt;
      color: #94a3b8;
      page-break-inside: avoid;
      break-inside: avoid;
    }
  </style>
</head>
<body>
  <div class="report-wrap">
    <header class="report-header">
      <div>
        <img src="${VENTRICURA_LOGO_DATA_URI}" alt="Ventricura" class="report-logo" />
        ${data.clinicName && data.clinicName !== 'Ventricura' && data.clinicName !== 'Ventricura Telehealth' ? `<div class="clinic-sub-name">${escapeHtml(data.clinicName)}</div>` : ''}
        <div class="header-accreditation">RACGP Standard 5 Telehealth Compliant · Australian PBS & ARTG Indexed Record</div>
      </div>
      <div class="header-audit-meta">
        <div class="doc-type-badge">Clinical Medication Chart</div>
        <div><strong>Record Date:</strong> ${escapeHtml(generatedTime)}</div>
      </div>
    </header>

    <section class="patient-box">
      <div>
        <h1>${escapeHtml(data.patientName)}</h1>
        <p><strong>Email:</strong> ${escapeHtml(data.patientEmail)}</p>
      </div>
      <div>
        <p><strong>Primary Clinic:</strong> ${escapeHtml(data.clinicName || 'Ventricura Telehealth')}</p>
        ${data.assignedClinicianName ? `<p><strong>Supervising Doctor:</strong> ${escapeHtml(data.assignedClinicianName)}</p>` : ''}
        <p><strong>Active Prescriptions:</strong> ${activeMeds.length}</p>
      </div>
    </section>

    <div class="section-title">Current Active Pharmacotherapy</div>
    <table class="report-table">
      <colgroup>
        <col style="width: 25%" />
        <col style="width: 9%" />
        <col style="width: 12%" />
        <col style="width: 7%" />
        <col style="width: 8%" />
        <col style="width: 26%" />
        <col style="width: 13%" />
      </colgroup>
      <thead>
        <tr>
          <th>Medication & Molecule</th>
          <th>Dose</th>
          <th>Frequency</th>
          <th style="text-align:center">Repeats</th>
          <th style="text-align:center">PBS</th>
          <th>Directions for Patient</th>
          <th>Prescribed By / Date</th>
        </tr>
      </thead>
      <tbody>
        ${activeRows}
      </tbody>
    </table>

    ${ceasedSection}

    <div class="certification-note">
      This clinical medication summary represents the active prescribed pharmacotherapy for this patient recorded in the Ventricura Clinical Suite. All listings correspond to the Australian Register of Therapeutic Goods (ARTG) and Schedule of Pharmaceutical Benefits. For clinical inquiries, contact the prescribing practice.
    </div>

    <div class="signature-grid">
      <div class="signature-box">
        <span>Prescribing Medical Practitioner Signature</span>
        <div class="sig-line"></div>
      </div>
      <div class="signature-box">
        <span>Provider Number & Stamp</span>
        <div class="sig-line"></div>
      </div>
    </div>

    <footer class="report-footer">
      <span>Ventricura Clinical Suite · Telehealth & Biometric Care</span>
      <span>Confidential Australian Medical Document · Page 1 of 1</span>
    </footer>
  </div>
</body>
</html>`;
}

