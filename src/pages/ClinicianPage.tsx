import { Activity, ArrowRight, CalendarClock, CircleAlert, Copy, LoaderCircle, RotateCcw, Search, ShieldOff, UsersRound, Video } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { StatusPill } from '../components/StatusPill';
import { InvitePatientForm } from '../components/InvitePatientForm';
import { type ClinicAppointment, type ClinicianProfile, loadClinicianWorkspace } from '../services/clinicianData';
import { claimInitialAdministratorAccess, createReplacementPatientInvitation, revokePatientInvitation } from '../services/clinicAccess';

type WorkspaceView = 'overview' | 'patients' | 'appointments' | 'measurements';
const workspaceView = (value: string | null): WorkspaceView => value === 'patients' || value === 'appointments' || value === 'measurements' ? value : 'overview';

export function ClinicianPage() {
  const [params] = useSearchParams();
  const view = workspaceView(params.get('view'));
  const [profile, setProfile] = useState<ClinicianProfile>();
  const [appointments, setAppointments] = useState<ClinicAppointment[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [replacementLinks, setReplacementLinks] = useState<Record<string, string>>({});
  const [linkError, setLinkError] = useState('');
  const [creatingLink, setCreatingLink] = useState<string>();
  const [revokingLink, setRevokingLink] = useState<string>();
  const [revokedLinks, setRevokedLinks] = useState<Record<string, true>>({});
  const [claimingAccess, setClaimingAccess] = useState(false);
  const [search, setSearch] = useState('');

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
  const patients = useMemo(() => Array.from(new Map(appointments.filter((appointment) => appointment.patient?.email).map((appointment) => [appointment.patient!.email, appointment])).values()), [appointments]);
  const visibleAppointments = appointments.filter((appointment) => {
    const term = search.trim().toLowerCase();
    return !term || [appointment.patient?.display_name, appointment.patient?.email, appointment.reason].filter(Boolean).some((value) => value!.toLowerCase().includes(term));
  });
  const matchesPatient = (appointment: ClinicAppointment) => !search.trim() || [appointment.patient?.display_name, appointment.patient?.email].some((value) => value?.toLowerCase().includes(search.trim().toLowerCase()));

  const createReplacementLink = async (appointmentId: string) => {
    setCreatingLink(appointmentId); setLinkError('');
    try {
      const invitationUrl = await createReplacementPatientInvitation(appointmentId);
      setReplacementLinks((links) => ({ ...links, [appointmentId]: invitationUrl }));
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
    } catch (reason) { setLinkError(reason instanceof Error ? reason.message : 'Unable to revoke patient access.'); }
    finally { setRevokingLink(undefined); }
  };
  const copyLink = async (appointmentId: string) => { await navigator.clipboard.writeText(replacementLinks[appointmentId]); };
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
    const accessState = revokedLinks[appointment.id] ? 'Access revoked' : replacementLinks[appointment.id] ? 'New link ready' : 'Link active';
    return <article className="appointment-row clinician-record-row" key={appointment.id}>
      <div className="patient-avatar">{(appointment.patient?.display_name ?? '?').split(' ').map((part) => part[0]).join('').slice(0, 2)}</div>
      <div className="record-person"><Link className="patient-profile-link" to={`/clinician/patient?email=${encodeURIComponent(patientEmail)}`}>{appointment.patient?.display_name ?? 'Patient'}</Link><span>{appointment.reason || 'Consultation'}</span><small>{patientEmail}</small></div>
      <div className="record-time"><strong>{new Date(appointment.starts_at).toLocaleString()}</strong><span>{new Date(appointment.starts_at) <= new Date() ? 'Available to open' : 'Scheduled appointment'}</span></div>
      <StatusPill tone={revokedLinks[appointment.id] ? 'neutral' : new Date(appointment.starts_at) <= new Date() ? 'green' : 'neutral'}>{accessState}</StatusPill>
      <div className="appointment-actions">
        <Link className="button button-primary button-small" to={`/consultation/${appointment.id}?role=clinician`}><Video size={17} /> Open call</Link>
        <Link className="text-button" to={`/clinician/patient?email=${encodeURIComponent(patientEmail)}`}>Profile</Link>
        <button className="text-button" onClick={() => void createReplacementLink(appointment.id)} disabled={creatingLink === appointment.id}>{creatingLink === appointment.id ? <LoaderCircle className="spin" size={16} /> : <RotateCcw size={16} />}{replacementLinks[appointment.id] ? 'Regenerate again' : 'Regenerate link'}</button>
        <button className="text-button danger-action" onClick={() => void revokeLink(appointment.id)} disabled={revokingLink === appointment.id || Boolean(revokedLinks[appointment.id])}>{revokingLink === appointment.id ? <LoaderCircle className="spin" size={16} /> : <ShieldOff size={16} />}{revokedLinks[appointment.id] ? 'Access revoked' : 'Revoke access'}</button>
      </div>
      {replacementLinks[appointment.id] && <div className="appointment-link"><span>New patient link created. The old link has been revoked.</span><input value={replacementLinks[appointment.id]} readOnly aria-label="Replacement patient invitation link" /><button className="button button-secondary button-small" onClick={() => void copyLink(appointment.id)}><Copy size={16} /> Copy link</button></div>}
    </article>;
  };
  const title = view === 'patients' ? ['Patients', 'Active patients and their longitudinal records'] : view === 'appointments' ? ['Appointments', 'Schedule, call access, and secure links'] : view === 'measurements' ? ['Measurements', 'Readings received from patient sessions'] : ['Today’s consultations', 'Review your patients, appointments and readings in one secure workspace.'];

  return <div className="dashboard-page">
    <section className="page-intro clinician-intro"><div><p className="eyebrow">Clinician workspace / {view}</p><h1>{title[0]}</h1><p>Welcome, {profile?.display_name}. {title[1]}</p></div><div className="workspace-actions"><label className="search-field"><Search size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Search patients and appointments" placeholder="Search name, email, or reason" /></label><Link className="button button-secondary" to="/admin/clinicians">Manage clinicians</Link></div></section>
    <section className="summary-strip workspace-summary"><Link to="/clinician?view=appointments"><div><CalendarClock /></div><span><strong>{todayAppointments.length}</strong>Appointments today</span><ArrowRight size={16} /></Link><Link to="/clinician?view=patients"><div><UsersRound /></div><span><strong>{patients.length}</strong>Active patients</span><ArrowRight size={16} /></Link><Link to="/clinician?view=measurements"><div><Activity /></div><span><strong>{readingsToReview.length}</strong>Readings received</span><ArrowRight size={16} /></Link></section>

    {view === 'overview' && <><section className="panel"><div className="section-heading"><div><p className="eyebrow">Next actions</p><h2>Upcoming appointments</h2><p>Open the clinician call, review the patient record, or manage their secure joining link.</p></div><InvitePatientForm onCreated={() => void load()} /></div><div className="appointment-table">{scheduled.slice(0, 5).map(appointmentRow)}{scheduled.length === 0 && <EmptyAppointments />}</div><Link to="/clinician?view=appointments" className="panel-footer-link">View all appointments <ArrowRight size={16} /></Link></section><section className="clinician-lower-grid"><article className="panel"><div className="section-heading"><div><p className="eyebrow">Follow-up</p><h2>Measurements to review</h2></div><Link className="text-button" to="/clinician?view=measurements">Open readings <ArrowRight size={16} /></Link></div><MeasurementList appointments={readingsToReview.slice(0, 4)} /></article><article className="panel platform-note"><p className="eyebrow">Patient access</p><h2>You control every joining link.</h2><p>Regenerating a link immediately invalidates the prior one. Revoke access to prevent a patient entering a call until you issue a new secure link.</p></article></section></>}
    {view === 'patients' && <section className="panel"><div className="section-heading"><div><p className="eyebrow">Patient directory</p><h2>Active patients</h2><p>Each profile contains their appointment history, saved readings and clinician-only notes.</p></div><InvitePatientForm onCreated={() => void load()} /></div><div className="patient-directory">{patients.filter(matchesPatient).map((appointment) => <article key={appointment.patient?.email} className="patient-directory-card"><div className="patient-avatar">{(appointment.patient?.display_name ?? '?').split(' ').map((part) => part[0]).join('').slice(0, 2)}</div><div><strong>{appointment.patient?.display_name ?? 'Patient'}</strong><span>{appointment.patient?.email}</span><small>Latest appointment: {new Date(appointment.starts_at).toLocaleDateString()}</small></div><Link className="button button-secondary button-small" to={`/clinician/patient?email=${encodeURIComponent(appointment.patient?.email ?? '')}`}>Open profile <ArrowRight size={15} /></Link></article>)}{patients.length === 0 && <EmptyAppointments />}</div></section>}
    {view === 'appointments' && <section className="panel"><div className="section-heading"><div><p className="eyebrow">Schedule and access</p><h2>All appointments</h2><p>Use the access controls to issue, replace or revoke a patient’s ability to join.</p></div><InvitePatientForm onCreated={() => void load()} /></div><div className="appointment-table">{visibleAppointments.map(appointmentRow)}{visibleAppointments.length === 0 && <EmptyAppointments />}</div></section>}
    {view === 'measurements' && <section className="panel"><div className="section-heading"><div><p className="eyebrow">Measurement record</p><h2>Readings to review</h2><p>Open the patient call to review live signal context, saved data and private notes.</p></div></div><MeasurementList appointments={readingsToReview.filter(matchesPatient)} /></section>}
    {linkError && <p className="form-error">{linkError}</p>}
  </div>;
}

function EmptyAppointments() { return <div className="empty-records"><UsersRound /><strong>No appointments to show</strong><span>Create a secure patient link to add a patient and appointment.</span></div>; }
function MeasurementList({ appointments }: { appointments: ClinicAppointment[] }) {
  if (!appointments.length) return <div className="empty-records compact-empty"><Activity /><strong>No readings received yet</strong><span>Completed camera checks will appear here for review.</span></div>;
  return <div className="measurement-review-list">{appointments.map((appointment) => { const reading = appointment.latestMeasurement!; return <div className="review-card" key={appointment.id}><div className="patient-avatar coral">{(appointment.patient?.display_name ?? '?').split(' ').map((part) => part[0]).join('').slice(0, 2)}</div><div><strong>{appointment.patient?.display_name ?? 'Patient'}</strong><span>{Math.round(reading.heart_rate_bpm)} BPM · {Math.round(reading.respiratory_rate_bpm)} breaths/min · signal quality {Math.round(reading.signal_quality)}% · captured {new Date(reading.measured_at).toLocaleString()}</span></div><Link className="text-button" to={`/consultation/${appointment.id}?role=clinician`}>Review <ArrowRight size={16} /></Link></div>; })}</div>;
}
