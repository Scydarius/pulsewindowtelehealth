import { Activity, ArrowRight, CalendarClock, CircleAlert, Copy, Link2, LoaderCircle, Search, UsersRound, Video } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useCallback, useEffect, useState } from 'react';
import { StatusPill } from '../components/StatusPill';
import { InvitePatientForm } from '../components/InvitePatientForm';
import { type ClinicAppointment, type ClinicianProfile, loadClinicianWorkspace } from '../services/clinicianData';
import { claimInitialAdministratorAccess, createReplacementPatientInvitation } from '../services/clinicAccess';

export function ClinicianPage() {
  const [profile, setProfile] = useState<ClinicianProfile>();
  const [appointments, setAppointments] = useState<ClinicAppointment[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [replacementLinks, setReplacementLinks] = useState<Record<string, string>>({});
  const [linkError, setLinkError] = useState('');
  const [creatingLink, setCreatingLink] = useState<string>();
  const [claimingAccess, setClaimingAccess] = useState(false);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const workspace = await loadClinicianWorkspace();
      setProfile(workspace.profile); setAppointments(workspace.appointments);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to open the clinician workspace.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(initialLoad);
  }, [load]);
  const scheduled = appointments.filter((appointment) => new Date(appointment.starts_at) >= new Date());
  const today = new Date();
  const todayAppointments = appointments.filter((appointment) => new Date(appointment.starts_at).toDateString() === today.toDateString());
  const readingsToReview = appointments.filter((appointment) => appointment.latestMeasurement);
  const visibleAppointments = appointments.filter((appointment) => {
    const term = search.trim().toLowerCase();
    return !term || [appointment.patient?.display_name, appointment.patient?.email, appointment.reason].filter(Boolean).some((value) => value!.toLowerCase().includes(term));
  });
  const createReplacementLink = async (appointmentId: string) => {
    setCreatingLink(appointmentId); setLinkError('');
    try {
      const invitationUrl = await createReplacementPatientInvitation(appointmentId);
      setReplacementLinks((links) => ({ ...links, [appointmentId]: invitationUrl }));
    }
    catch (reason) { setLinkError(reason instanceof Error ? reason.message : 'Unable to create a replacement patient link.'); }
    finally { setCreatingLink(undefined); }
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

  return (
    <div className="dashboard-page">
      <section className="page-intro clinician-intro">
        <div><p className="eyebrow">Clinician workspace</p><h1>Today’s consultations</h1><p>Welcome, {profile?.display_name}. Review your patients, appointments and readings in one secure workspace.</p></div>
        <div className="workspace-actions"><label className="search-field"><Search size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Search patients and appointments" placeholder="Search patients" /></label><Link className="button button-secondary" to="/admin/clinicians">Manage clinicians</Link></div>
      </section>

      <section className="summary-strip">
        <article><div><CalendarClock /></div><span><strong>{todayAppointments.length}</strong>Appointments today</span></article>
        <article><div><UsersRound /></div><span><strong>{new Set(appointments.map((appointment) => appointment.patient?.email)).size}</strong>Patients in your care</span></article>
        <article><div><Activity /></div><span><strong>{readingsToReview.length}</strong>Readings received</span></article>
      </section>

      <section className="panel" id="appointments">
        <div className="section-heading"><div><p className="eyebrow">Schedule</p><h2>Upcoming appointments</h2></div><InvitePatientForm onCreated={() => void load()} /></div>
        <div className="appointment-table">
          {visibleAppointments.length === 0 ? <div className="empty-records"><UsersRound /><strong>{appointments.length ? 'No matching appointments' : 'No patients yet'}</strong><span>{appointments.length ? 'Try a different search term.' : 'Create your first secure patient link to add a patient and appointment.'}</span></div> : visibleAppointments.map((appointment) => (
            <article className="appointment-row" key={appointment.id}>
              <div className="patient-avatar">{(appointment.patient?.display_name ?? '?').split(' ').map((part) => part[0]).join('').slice(0, 2)}</div>
              <div><strong>{appointment.patient?.display_name ?? 'Patient'}</strong><span>{appointment.reason}</span></div>
              <div><strong>{new Date(appointment.starts_at).toLocaleString()}</strong><span>{appointment.patient?.email}</span></div>
              <StatusPill tone={new Date(appointment.starts_at) <= new Date() ? 'green' : 'neutral'}>{new Date(appointment.starts_at) <= new Date() ? 'Ready' : 'Scheduled'}</StatusPill>
              <div className="appointment-actions"><Link className="button button-primary button-small" to={`/consultation/${appointment.id}?role=clinician`}><Video size={17} /> Join call</Link><button className="text-button" onClick={() => void createReplacementLink(appointment.id)} disabled={creatingLink === appointment.id}>{creatingLink === appointment.id ? <LoaderCircle className="spin" size={16} /> : <Link2 size={16} />}{replacementLinks[appointment.id] ? 'Replace link' : 'Patient link'}</button></div>
              {replacementLinks[appointment.id] && <div className="appointment-link"><span>New patient link — the previous link is no longer valid.</span><input value={replacementLinks[appointment.id]} readOnly aria-label="Replacement patient invitation link" /><button className="button button-secondary button-small" onClick={() => void copyLink(appointment.id)}><Copy size={16} /> Copy</button></div>}
            </article>
          ))}
        </div>
        {linkError && <p className="form-error">{linkError}</p>}
      </section>

      <section className="clinician-lower-grid">
        <article className="panel" id="measurements">
          <div className="section-heading"><div><p className="eyebrow">Follow-up</p><h2>Measurements to review</h2></div></div>
          {readingsToReview.length === 0 ? <div className="empty-records compact-empty"><Activity /><strong>No readings received yet</strong><span>Completed 30-second camera checks will appear here for review.</span></div> : readingsToReview.slice(0, 4).map((appointment) => {
            const reading = appointment.latestMeasurement!;
            return <div className="review-card" key={appointment.id}><div className="patient-avatar coral">{(appointment.patient?.display_name ?? '?').split(' ').map((part) => part[0]).join('').slice(0, 2)}</div><div><strong>{appointment.patient?.display_name ?? 'Patient'}</strong><span>{Math.round(reading.heart_rate_bpm)} BPM · {Math.round(reading.respiratory_rate_bpm)} breaths/min · captured {new Date(reading.measured_at).toLocaleString()}</span></div><Link className="text-button" to={`/consultation/${appointment.id}?role=clinician`}>Review <ArrowRight size={16} /></Link></div>;
          })}
        </article>
        <article className="panel platform-note"><p className="eyebrow">PulseWindow</p><h2>Measurement context, not a diagnosis.</h2><p>Use signal quality and longitudinal trends to support your assessment. Experimental readings should be verified using approved clinical devices.</p></article>
      </section>
    </div>
  );
}
