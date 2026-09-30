import { Activity, ArrowLeft, CalendarClock, ClipboardList, LoaderCircle, Mail, MessageSquareText, UserRound, Video } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { loadPatientProfile, type PatientProfile } from '../services/clinicAccess';

const number = (value: number | null, digits = 0) => value === null ? '—' : value.toFixed(digits);
const dateTime = (value: string) => new Date(value).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' });
const appointmentDetail = (value: string) => ({ reason: value.split('\n\nPatient notes:')[0].trim(), note: value.split('\n\nPatient notes:')[1]?.trim() ?? '' });

export function PatientProfilePage() {
  const [searchParams] = useSearchParams();
  const patientId = searchParams.get('id') ?? '';
  const [patient, setPatient] = useState<PatientProfile>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string>();

  useEffect(() => {
    let active = true;
    if (!patientId) { setError('Choose a patient from the clinician workspace first.'); setLoading(false); return undefined; }
    void loadPatientProfile(patientId).then((profile) => { if (active) setPatient(profile); }).catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : 'Unable to load the patient profile.'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [patientId]);

  if (loading) return <div className="workspace-state"><LoaderCircle className="spin" /><strong>Loading patient history…</strong></div>;
  if (error || !patient) return <div className="workspace-state"><strong>Patient profile unavailable</strong><span>{error || 'This patient could not be found.'}</span><Link className="button button-primary" to="/clinician">Back to workspace</Link></div>;

  const completed = patient.appointments.filter((appointment) => appointment.measurements.length > 0).length;
  const sampleCount = patient.appointments.reduce((total, appointment) => total + appointment.measurements.length, 0);
  const appointments = [...patient.appointments].sort((left, right) => new Date(right.starts_at).valueOf() - new Date(left.starts_at).valueOf());

  return <div className="patient-profile-page">
    <Link className="back-link" to="/clinician"><ArrowLeft size={18} /> Back to workspace</Link>
    <section className="patient-profile-hero">
      <div className="patient-profile-avatar">{patient.display_name.split(' ').map((part) => part[0]).join('').slice(0, 2)}</div>
      <div><p className="eyebrow">Patient profile</p><h1>{patient.display_name}</h1><p><Mail size={15} /> {patient.email}</p></div>
    </section>
    <section className="summary-strip patient-history-summary">
      <article><div><CalendarClock /></div><span><strong>{patient.appointments.length}</strong>Appointments</span></article>
      <article><div><Activity /></div><span><strong>{completed}</strong>Completed checks</span></article>
      <article><div><ClipboardList /></div><span><strong>{sampleCount}</strong>Saved API samples</span></article>
    </section>
    <section className="panel patient-history-panel">
      <div className="section-heading patient-history-heading"><div><p className="eyebrow">Longitudinal record</p><h2>Appointments and measurements</h2><p>Each saved sample is shown exactly as returned by the rPPG API. No portal-side averaging or quality weighting is applied. Research data only; not diagnostic.</p></div></div>
      <div className="patient-history-list">
        {appointments.map((appointment) => <article className="patient-history-card" key={appointment.id}>
          {(() => { const details = appointmentDetail(appointment.reason); return <><div className="patient-history-main"><div><strong>{details.reason || 'Consultation'}</strong><span>{dateTime(appointment.starts_at)}</span></div><div className="patient-history-actions"><Link className="button button-primary button-small" to={`/consultation/${appointment.id}?role=clinician`}><Video size={15} /> Join call</Link><Link className="button button-secondary button-small" to={`/clinician/review?appointment=${encodeURIComponent(appointment.id)}&patient=${encodeURIComponent(patientId)}`}>Review record</Link></div></div>{details.note && <aside className="patient-intake-note"><div><MessageSquareText size={16} /><span>Patient intake note</span></div><p>{details.note}</p></aside>}</>; })()}
          {appointment.measurements.length ? <>
            {(() => { const latest = appointment.measurements.at(-1)!; return <div className="patient-measurement-summary">
              <div><span>Latest API pulse</span><strong>{number(latest.heart_rate_bpm)} <small>BPM</small></strong></div>
              <div><span>Latest API breathing</span><strong>{number(latest.respiratory_rate_bpm)} <small>breaths/min</small></strong></div>
              <div><span>Latest API signal quality</span><strong>{number(latest.signal_quality * 100)}<small>%</small></strong></div>
              <div><span>Saved API samples</span><strong>{appointment.measurements.length}</strong></div>
            </div>; })()}
            <button className="text-button" onClick={() => setExpanded(expanded === appointment.id ? undefined : appointment.id)}>{expanded === appointment.id ? 'Hide raw samples' : `View all ${appointment.measurements.length} samples`}</button>
            {expanded === appointment.id && <div className="raw-measurement-table" aria-label="All saved measurement samples"><div className="raw-measurement-heading"><span>Captured</span><span>Pulse</span><span>Breathing</span><span>Quality</span></div>{appointment.measurements.map((measurement) => <div key={measurement.measured_at} className="raw-measurement-row"><span>{dateTime(measurement.measured_at)}</span><span>{number(measurement.heart_rate_bpm)} BPM</span><span>{number(measurement.respiratory_rate_bpm)} /min</span><span>{number(measurement.signal_quality * 100)}%</span></div>)}</div>}
          </> : <p className="patient-history-empty"><UserRound size={17} /> No saved camera-check readings for this appointment.</p>}
        </article>)}
      </div>
    </section>
  </div>;
}
