import { Activity, ArrowLeft, CalendarClock, ClipboardList, LoaderCircle, Mail, UserRound } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { loadPatientProfile, type PatientProfile } from '../services/clinicAccess';

const number = (value: number | null, digits = 0) => value === null ? '—' : value.toFixed(digits);
const dateTime = (value: string) => new Date(value).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' });

export function PatientProfilePage() {
  const [searchParams] = useSearchParams();
  const email = searchParams.get('email') ?? '';
  const [patient, setPatient] = useState<PatientProfile>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string>();
  const [sort, setSort] = useState<'recent' | 'quality'>('recent');

  useEffect(() => {
    let active = true;
    if (!email) { setError('Choose a patient from the clinician workspace first.'); setLoading(false); return undefined; }
    void loadPatientProfile(email).then((profile) => { if (active) setPatient(profile); }).catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : 'Unable to load the patient profile.'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [email]);

  if (loading) return <div className="workspace-state"><LoaderCircle className="spin" /><strong>Loading patient history…</strong></div>;
  if (error || !patient) return <div className="workspace-state"><strong>Patient profile unavailable</strong><span>{error || 'This patient could not be found.'}</span><Link className="button button-primary" to="/clinician">Back to workspace</Link></div>;

  const completed = patient.appointments.filter((appointment) => appointment.summary).length;
  const allSummaries = patient.appointments.map((appointment) => appointment.summary).filter((summary): summary is NonNullable<typeof summary> => Boolean(summary));
  const summariesWithHeartRate = allSummaries.filter((summary) => summary.average_heart_rate_bpm !== null);
  const averageHeartRate = summariesWithHeartRate.length ? summariesWithHeartRate.reduce((sum, summary) => sum + (summary.average_heart_rate_bpm ?? 0), 0) / summariesWithHeartRate.length : null;
  const appointments = [...patient.appointments].sort((left, right) => sort === 'quality'
    ? (right.summary?.average_signal_quality ?? -1) - (left.summary?.average_signal_quality ?? -1)
    : new Date(right.starts_at).valueOf() - new Date(left.starts_at).valueOf());

  return <div className="patient-profile-page">
    <Link className="back-link" to="/clinician"><ArrowLeft size={18} /> Back to workspace</Link>
    <section className="patient-profile-hero">
      <div className="patient-profile-avatar">{patient.display_name.split(' ').map((part) => part[0]).join('').slice(0, 2)}</div>
      <div><p className="eyebrow">Patient profile</p><h1>{patient.display_name}</h1><p><Mail size={15} /> {patient.email}</p></div>
    </section>
    <section className="summary-strip patient-history-summary">
      <article><div><CalendarClock /></div><span><strong>{patient.appointments.length}</strong>Appointments</span></article>
      <article><div><Activity /></div><span><strong>{completed}</strong>Completed checks</span></article>
      <article><div><ClipboardList /></div><span><strong>{number(averageHeartRate)}{averageHeartRate === null ? '' : ' BPM'}</strong>Mean across checks</span></article>
    </section>
    <section className="panel patient-history-panel">
      <div className="section-heading patient-history-heading"><div><p className="eyebrow">Longitudinal record</p><h2>Appointments and measurements</h2><p>Pulse and breathing use a robust 30-second average, excluding only extreme readings. Signal quality is displayed separately and can be used to sort the record. Research data only; not diagnostic.</p></div><label className="patient-history-sort">Sort appointments<select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}><option value="recent">Most recent</option><option value="quality">Highest signal quality</option></select></label></div>
      <div className="patient-history-list">
        {appointments.map((appointment) => <article className="patient-history-card" key={appointment.id}>
          <div className="patient-history-main"><div><strong>{appointment.reason}</strong><span>{dateTime(appointment.starts_at)}</span></div><Link className="button button-secondary button-small" to={`/consultation/${appointment.id}?role=clinician`}>Open consultation</Link></div>
          {appointment.summary ? <>
            <div className="patient-measurement-summary">
              <div><span>30-sec robust pulse</span><strong>{number(appointment.summary.average_heart_rate_bpm)} <small>BPM</small></strong></div>
              <div><span>30-sec robust breathing</span><strong>{number(appointment.summary.average_respiratory_rate_bpm)} <small>breaths/min</small></strong></div>
              <div><span>Average signal quality</span><strong>{number(appointment.summary.average_signal_quality === null ? null : appointment.summary.average_signal_quality * 100)}<small>%</small></strong></div>
              <div><span>Saved samples</span><strong>{appointment.summary.sample_count}</strong></div>
            </div>
            <button className="text-button" onClick={() => setExpanded(expanded === appointment.id ? undefined : appointment.id)}>{expanded === appointment.id ? 'Hide raw samples' : `View all ${appointment.measurements.length} samples`}</button>
            {expanded === appointment.id && <div className="raw-measurement-table" aria-label="All saved measurement samples"><div className="raw-measurement-heading"><span>Captured</span><span>Pulse</span><span>Breathing</span><span>Quality</span></div>{appointment.measurements.map((measurement) => <div key={measurement.measured_at} className="raw-measurement-row"><span>{dateTime(measurement.measured_at)}</span><span>{number(measurement.heart_rate_bpm)} BPM</span><span>{number(measurement.respiratory_rate_bpm)} /min</span><span>{number(measurement.signal_quality * 100)}%</span></div>)}</div>}
          </> : <p className="patient-history-empty"><UserRound size={17} /> No saved camera-check readings for this appointment.</p>}
        </article>)}
      </div>
    </section>
  </div>;
}
