import { Activity, ArrowRight, CalendarClock, CalendarDays, CheckCircle2, CircleAlert, Copy, LoaderCircle, MessageSquareText, RotateCcw, Search, ShieldOff, Trash2, UsersRound, Video } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { StatusPill } from '../components/StatusPill';
import { InvitePatientForm, type ExistingPatientOption } from '../components/InvitePatientForm';
import { ClinicianAvailabilityPanel } from '../components/ClinicianAvailabilityPanel';
import { CopyButton } from '../components/CopyButton';
import { type ClinicAppointment, type ClinicianProfile, loadClinicianWorkspace } from '../services/clinicianData';
import { claimInitialAdministratorAccess, createReplacementPatientInvitation, deleteAppointment, revokePatientInvitation } from '../services/clinicAccess';

type WorkspaceView = 'overview' | 'patients' | 'appointments' | 'measurements' | 'availability' | 'calendar';
const workspaceView = (value: string | null): WorkspaceView => value === 'patients' || value === 'appointments' || value === 'measurements' || value === 'availability' || value === 'calendar' ? value : 'overview';
const reasonSummary = (value: string) => value.split('\n\nPatient notes:')[0].trim();
const intakeNote = (value: string) => value.split('\n\nPatient notes:')[1]?.trim() ?? '';
const appointmentState = (appointment: ClinicAppointment, now = new Date()) => {
  if (appointment.latestMeasurement) return 'Ready for review';
  const startsAt = new Date(appointment.starts_at);
  if (startsAt.valueOf() < now.valueOf()) return 'Awaiting patient';
  if (startsAt.toDateString() === now.toDateString()) return 'Today';
  return 'Scheduled';
};
const shortDate = (value: Date) => new Intl.DateTimeFormat('en-AU', { weekday: 'short', day: 'numeric' }).format(value);

export function ClinicianPage() {
  const [params] = useSearchParams();
  const view = workspaceView(params.get('view'));
  const [profile, setProfile] = useState<ClinicianProfile>();
  const [appointments, setAppointments] = useState<ClinicAppointment[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [replacementLinks, setReplacementLinks] = useState<Record<string, string>>({});
  const [replacementEmailStatus, setReplacementEmailStatus] = useState<Record<string, string>>({});
  const [linkError, setLinkError] = useState('');
  const [creatingLink, setCreatingLink] = useState<string>();
  const [revokingLink, setRevokingLink] = useState<string>();
  const [deletingAppointment, setDeletingAppointment] = useState<string>();
  const [revokedLinks, setRevokedLinks] = useState<Record<string, true>>({});
  const [claimingAccess, setClaimingAccess] = useState(false);
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { const workspace = await loadClinicianWorkspace(); setProfile(workspace.profile); setAppointments(workspace.appointments); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to open the clinician workspace.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);

  const now = new Date();
  const scheduled = appointments.filter((appointment) => new Date(appointment.starts_at) >= now);
  const todayAppointments = appointments.filter((appointment) => new Date(appointment.starts_at).toDateString() === now.toDateString());
  const readingsToReview = appointments.filter((appointment) => appointment.latestMeasurement);
  const reviewQueue = [...readingsToReview].sort((left, right) => new Date(right.latestMeasurement!.measured_at).valueOf() - new Date(left.latestMeasurement!.measured_at).valueOf());
  // Email is the patient identity used by invitations, so all visits for the
  // same email stay together even if a legacy record was duplicated.
  const patientGroups = useMemo(() => Array.from(appointments.filter((appointment) => appointment.patient?.email).reduce((groups, appointment) => {
    const email = appointment.patient!.email.trim().toLowerCase(); const current = groups.get(email) ?? []; current.push(appointment); groups.set(email, current); return groups;
  }, new Map<string, ClinicAppointment[]>()).values()).map((records) => ({ records: [...records].sort((a, b) => new Date(b.starts_at).valueOf() - new Date(a.starts_at).valueOf()), patient: records[0].patient! })), [appointments]);
  const patientOptions = useMemo<ExistingPatientOption[]>(() => patientGroups.map((group) => ({ id: group.patient.id, displayName: group.patient.display_name, email: group.patient.email, appointmentCount: group.records.length })), [patientGroups]);
  const visibleAppointments = appointments.filter((appointment) => {
    const term = search.trim().toLowerCase();
    return !term || [appointment.patient?.display_name, appointment.patient?.email, appointment.reason].filter(Boolean).some((value) => value!.toLowerCase().includes(term));
  });
  const matchesPatient = (appointment: ClinicAppointment) => !search.trim() || [appointment.patient?.display_name, appointment.patient?.email].some((value) => value?.toLowerCase().includes(search.trim().toLowerCase()));

  const createReplacementLink = async (appointmentId: string) => {
    setCreatingLink(appointmentId); setLinkError('');
    try {
      const result = await createReplacementPatientInvitation(appointmentId);
      setReplacementLinks((links) => ({ ...links, [appointmentId]: result.invitationUrl }));
      setReplacementEmailStatus((status) => ({ ...status, [appointmentId]: result.emailSent ? 'A new secure link has been emailed to the patient.' : result.emailWarning ?? 'A new secure link was created, but email delivery could not be confirmed.' }));
      setNotice(result.emailSent ? 'Replacement patient link created and emailed.' : result.emailWarning ?? 'Replacement patient link created.');
      setRevokedLinks((links) => { const next = { ...links }; delete next[appointmentId]; return next; });
    } catch (reason) { setLinkError(reason instanceof Error ? reason.message : 'Unable to generate a new patient link.'); }
    finally { setCreatingLink(undefined); }
  };
  const revokeLink = async (appointmentId: string) => {
    if (!window.confirm('Revoke the patient’s current access link? They will no longer be able to join this call until you generate a new link.')) return;
    setRevokingLink(appointmentId); setLinkError('');
    try {
      await revokePatientInvitation(appointmentId);
      setRevokedLinks((links) => ({ ...links, [appointmentId]: true }));
      setReplacementLinks((links) => { const next = { ...links }; delete next[appointmentId]; return next; });
      setNotice('Patient link revoked. Generate a new link when they need access again.');
    } catch (reason) { setLinkError(reason instanceof Error ? reason.message : 'Unable to revoke patient access.'); }
    finally { setRevokingLink(undefined); }
  };
  const removeAppointment = async (appointmentId: string) => {
    if (!window.confirm('Delete this appointment? Its call link, private notes, and saved measurement data will be removed. The patient record will be kept.')) return;
    setDeletingAppointment(appointmentId); setLinkError('');
    try { await deleteAppointment(appointmentId); await load(); }
    catch (reason) { setLinkError(reason instanceof Error ? reason.message : 'Unable to remove the appointment.'); }
    finally { setDeletingAppointment(undefined); }
  };
  const claimAccess = async () => {
    setClaimingAccess(true); setError('');
    try { await claimInitialAdministratorAccess(); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to complete administrator setup.'); }
    finally { setClaimingAccess(false); }
  };

  if (loading && !profile) return <div className="workspace-state"><LoaderCircle className="spin" /><strong>Loading your clinical workspace…</strong></div>;
  if (error) return <div className="workspace-state"><CircleAlert /><strong>Access required</strong><span>{error}</span>{error === 'This account is not an authorised clinician.' ? <button className="button button-primary" onClick={() => void claimAccess()} disabled={claimingAccess}>{claimingAccess ? <LoaderCircle className="spin" size={18} /> : null}{claimingAccess ? 'Completing setup…' : 'Complete administrator setup'}</button> : <Link className="button button-primary" to="/clinician/sign-in">Sign in</Link>}</div>;

  const appointmentRow = (appointment: ClinicAppointment) => {
    const patientEmail = appointment.patient?.email ?? '';
    const patientId = appointment.patient?.id ?? '';
    const note = intakeNote(appointment.reason);
    const accessState = revokedLinks[appointment.id] ? 'Access revoked' : replacementLinks[appointment.id] ? 'New link ready' : 'Link active';
    return <article className="appointment-row clinician-record-row" key={appointment.id}>
      <div className="patient-avatar">{(appointment.patient?.display_name ?? '?').split(' ').map((part) => part[0]).join('').slice(0, 2)}</div>
      <div className="record-person"><Link className="patient-profile-link" to={`/clinician/patient?id=${encodeURIComponent(patientId)}`}>{appointment.patient?.display_name ?? 'Patient'}</Link><span>{reasonSummary(appointment.reason) || 'Consultation'}</span><small>{patientEmail}</small></div>
      <div className="record-time"><strong>{new Date(appointment.starts_at).toLocaleString()}</strong><span>{new Date(appointment.starts_at) <= new Date() ? 'Available to open' : 'Scheduled appointment'}</span></div>
      <StatusPill tone={revokedLinks[appointment.id] ? 'neutral' : new Date(appointment.starts_at) <= new Date() ? 'active' : 'neutral'}>{accessState}</StatusPill>
      <div className="appointment-actions">
        <Link className="button button-primary button-small" to={`/consultation/${appointment.id}?role=clinician${appointment.patient?.display_name ? `&patientName=${encodeURIComponent(appointment.patient.display_name)}` : ''}${profile?.display_name ? `&clinicianName=${encodeURIComponent(profile.display_name)}` : ''}`}><Video size={17} /> Join call</Link>
        <Link className="text-button" to={`/clinician/patient?id=${encodeURIComponent(patientId)}`}>Profile</Link>
        <button className="text-button" onClick={() => void createReplacementLink(appointment.id)} disabled={creatingLink === appointment.id}>{creatingLink === appointment.id ? <LoaderCircle className="spin" size={16} /> : <RotateCcw size={16} />}{replacementLinks[appointment.id] ? 'Regenerate again' : 'Regenerate link'}</button>
        <button className="text-button danger-action" onClick={() => void revokeLink(appointment.id)} disabled={revokingLink === appointment.id || Boolean(revokedLinks[appointment.id])}>{revokingLink === appointment.id ? <LoaderCircle className="spin" size={16} /> : <ShieldOff size={16} />}{revokedLinks[appointment.id] ? 'Access revoked' : 'Revoke access'}</button>
        <button className="text-button danger-action" onClick={() => void removeAppointment(appointment.id)} disabled={deletingAppointment === appointment.id}>{deletingAppointment === appointment.id ? <LoaderCircle className="spin" size={16} /> : <Trash2 size={16} />}Delete appointment</button>
      </div>
      {note && <aside className="appointment-intake-note"><div><MessageSquareText size={16} /><span>Patient intake note</span></div><p>{note}</p></aside>}
      {replacementLinks[appointment.id] && <div className="appointment-link"><span>New patient link created. The old link has been revoked. {replacementEmailStatus[appointment.id]}</span><input value={replacementLinks[appointment.id]} readOnly aria-label="Replacement patient invitation link" /><CopyButton text={replacementLinks[appointment.id]} label="Copy link" copiedLabel="Link copied!" className="button button-secondary button-small" /></div>}
    </article>;
  };
  const title = view === 'patients' ? ['Patients', 'Active patients and their longitudinal records'] : view === 'appointments' ? ['Appointments', 'Schedule, call access, and secure links'] : view === 'measurements' ? ['Review queue', 'Readings received from patient sessions'] : view === 'availability' ? ['Booking availability', 'Publish a secure link so patients can choose from your available times.'] : view === 'calendar' ? ['Calendar', 'Your next seven days at a glance.'] : ['Today', 'Your appointments, follow-up work, and patient activity in one place.'];

  return <div className="dashboard-page">
    <section className="page-intro clinician-intro"><div><p className="eyebrow">Clinician workspace / {view}</p><h1>{title[0]}</h1><p>Welcome, {profile?.display_name}. {title[1]}</p></div><div className="workspace-actions"><label className="search-field"><Search size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Search patients and appointments" placeholder="Search name, email, or reason" /></label></div></section>
    <section className="summary-strip workspace-summary"><Link to="/clinician?view=appointments"><div><CalendarClock /></div><span><strong>{todayAppointments.length}</strong>Appointments today</span><ArrowRight size={16} /></Link><Link to="/clinician?view=patients"><div><UsersRound /></div><span><strong>{patientGroups.length}</strong>Active patients</span><ArrowRight size={16} /></Link><Link to="/clinician?view=measurements"><div><Activity /></div><span><strong>{reviewQueue.length}</strong>Needs review</span><ArrowRight size={16} /></Link><Link to="/clinician?view=calendar"><div><CalendarDays /></div><span><strong>Calendar</strong>Week at a glance</span><ArrowRight size={16} /></Link></section>

    {view === 'overview' && <><section className="command-centre"><div className="command-centre-main"><div className="section-heading"><div><p className="eyebrow">Today / schedule</p><h2>Your next appointments</h2><p>Join a call, check the patient record, or manage access without leaving this view.</p></div><Link className="text-button" to="/clinician?view=calendar">Open calendar <ArrowRight size={16} /></Link></div><div className="command-list">{scheduled.slice(0, 3).map((appointment) => <article key={appointment.id} className="command-appointment"><div className="command-time"><strong>{new Intl.DateTimeFormat('en-AU', { hour: 'numeric', minute: '2-digit' }).format(new Date(appointment.starts_at))}</strong><span>{shortDate(new Date(appointment.starts_at))}</span></div><div><strong>{appointment.patient?.display_name ?? 'Patient'}</strong><span>{reasonSummary(appointment.reason) || 'Consultation'}</span></div><span className={`appointment-state state-${appointmentState(appointment).toLowerCase().replaceAll(' ', '-')}`}>{appointmentState(appointment)}</span><Link className="button button-primary button-small" to={`/consultation/${appointment.id}?role=clinician${appointment.patient?.display_name ? `&patientName=${encodeURIComponent(appointment.patient.display_name)}` : ''}${profile?.display_name ? `&clinicianName=${encodeURIComponent(profile.display_name)}` : ''}`}><Video size={15} /> Join</Link></article>)}{scheduled.length === 0 && <EmptyAppointments />}</div></div><aside className="command-centre-action"><p className="eyebrow">Quick action</p><h2>Create an appointment</h2><p>Add a new patient or schedule a follow-up for an existing patient.</p><InvitePatientForm patients={patientOptions} onCreated={() => void load()} /></aside></section><section className="panel review-queue-panel"><div className="section-heading"><div><p className="eyebrow">Review queue</p><h2>Patient readings ready</h2><p>Open the session record, review measurements, and document follow-up.</p></div><Link className="text-button" to="/clinician?view=measurements">View all <ArrowRight size={16} /></Link></div><MeasurementList appointments={reviewQueue.slice(0, 4)} /></section></>}
    {view === 'patients' && <section className="panel"><div className="section-heading"><div><p className="eyebrow">Patient directory</p><h2>Active patients</h2><p>Every appointment for the same email is grouped under one patient card.</p></div><InvitePatientForm patients={patientOptions} onCreated={() => void load()} /></div><div className="patient-directory">{patientGroups.filter((group) => !search.trim() || [group.patient.display_name, group.patient.email].some((value) => value.toLowerCase().includes(search.trim().toLowerCase()))).map((group) => <article key={group.patient.email} className="patient-directory-card patient-directory-card-grouped"><div className="patient-avatar">{group.patient.display_name.split(' ').map((part) => part[0]).join('').slice(0, 2)}</div><div><strong>{group.patient.display_name}</strong><span>{group.patient.email}</span><small>{group.records.length} appointment{group.records.length === 1 ? '' : 's'} · latest {new Date(group.records[0].starts_at).toLocaleDateString()}</small></div><Link className="button button-secondary button-small" to={`/clinician/patient?id=${encodeURIComponent(group.patient.id)}`}>Open profile <ArrowRight size={15} /></Link></article>)}{patientGroups.length === 0 && <EmptyAppointments />}</div></section>}
    {view === 'appointments' && <section className="panel"><div className="section-heading"><div><p className="eyebrow">Schedule and access</p><h2>All appointments</h2><p>Join any appointment directly, then manage its secure patient link from the same record.</p></div><InvitePatientForm patients={patientOptions} onCreated={() => void load()} /></div><div className="appointment-table">{visibleAppointments.map(appointmentRow)}{visibleAppointments.length === 0 && <EmptyAppointments />}</div></section>}
    {view === 'measurements' && <section className="panel"><div className="section-heading"><div><p className="eyebrow">Measurement record</p><h2>Readings to review</h2><p>Open the patient call to review live signal context, saved data and private notes.</p></div></div><MeasurementList appointments={readingsToReview.filter(matchesPatient)} /></section>}
    {view === 'calendar' && <CalendarWeek appointments={appointments} />}
    {view === 'availability' && <ClinicianAvailabilityPanel />}
    {notice && <div className="workspace-toast"><CheckCircle2 size={17} /> {notice}<button onClick={() => setNotice('')} aria-label="Dismiss notification">×</button></div>}{linkError && <p className="form-error">{linkError}</p>}
  </div>;
}

function EmptyAppointments() { return <div className="empty-records"><UsersRound /><strong>No appointments to show</strong><span>Create a secure patient link to add a patient and appointment.</span></div>; }
function MeasurementList({ appointments }: { appointments: ClinicAppointment[] }) {
  if (!appointments.length) return <div className="empty-records compact-empty"><Activity /><strong>No readings received yet</strong><span>Completed camera checks will appear here for review.</span></div>;
  return <div className="measurement-review-list">{appointments.map((appointment) => { const reading = appointment.latestMeasurement!; return <div className="review-card" key={appointment.id}><div className="patient-avatar alert">{(appointment.patient?.display_name ?? '?').split(' ').map((part) => part[0]).join('').slice(0, 2)}</div><div><strong>{appointment.patient?.display_name ?? 'Patient'}</strong><span>{Math.round(reading.heart_rate_bpm)} BPM · {Math.round(reading.respiratory_rate_bpm)} breaths/min · signal quality {Math.round(reading.signal_quality)}% · captured {new Date(reading.measured_at).toLocaleString()}</span></div><span className="appointment-state state-ready-for-review">Ready for review</span><Link className="text-button" to={`/clinician/review?appointment=${encodeURIComponent(appointment.id)}&patient=${encodeURIComponent(appointment.patient?.id ?? '')}`}>Review record <ArrowRight size={16} /></Link></div>; })}</div>;
}

function CalendarWeek({ appointments }: { appointments: ClinicAppointment[] }) {
  const days = Array.from({ length: 7 }, (_, offset) => { const day = new Date(); day.setHours(0, 0, 0, 0); day.setDate(day.getDate() + offset); return day; });
  return <section className="panel calendar-week-panel"><div className="section-heading"><div><p className="eyebrow">Next seven days</p><h2>Your schedule</h2><p>Select an appointment to open its patient record or join the consultation.</p></div><Link className="button button-secondary button-small" to="/clinician?view=availability">Edit availability</Link></div><div className="calendar-week-grid">{days.map((day) => { const entries = appointments.filter((appointment) => new Date(appointment.starts_at).toDateString() === day.toDateString()); return <section key={day.toISOString()} className="calendar-day"><header><span>{new Intl.DateTimeFormat('en-AU', { weekday: 'short' }).format(day)}</span><strong>{day.getDate()}</strong></header>{entries.length ? entries.map((appointment) => <Link key={appointment.id} to={`/clinician/patient?id=${encodeURIComponent(appointment.patient?.id ?? '')}`} className="calendar-entry"><time>{new Intl.DateTimeFormat('en-AU', { hour: 'numeric', minute: '2-digit' }).format(new Date(appointment.starts_at))}</time><strong>{appointment.patient?.display_name ?? 'Patient'}</strong><span>{reasonSummary(appointment.reason) || 'Consultation'}</span></Link>) : <span className="calendar-empty">No appointments</span>}</section>; })}</div></section>;
}
