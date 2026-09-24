import { CalendarClock, CircleAlert, LoaderCircle, UsersRound, Video } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useCallback, useEffect, useState } from 'react';
import { StatusPill } from '../components/StatusPill';
import { InvitePatientForm } from '../components/InvitePatientForm';
import { type ClinicAppointment, type ClinicianProfile, loadClinicianWorkspace } from '../services/clinicianData';

export function ClinicianPage() {
  const [profile, setProfile] = useState<ClinicianProfile>();
  const [appointments, setAppointments] = useState<ClinicAppointment[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

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

  if (loading && !profile) return <div className="workspace-state"><LoaderCircle className="spin" /><strong>Loading your clinical workspace…</strong></div>;
  if (error) return <div className="workspace-state"><CircleAlert /><strong>Access required</strong><span>{error}</span><Link className="button button-primary" to="/clinician/sign-in">Sign in</Link></div>;

  return (
    <div className="dashboard-page">
      <section className="page-intro clinician-intro">
        <div><p className="eyebrow">Clinician workspace</p><h1>Welcome, {profile?.display_name}.</h1><p>Patients and consultations shown here are drawn from your secure clinic records.</p></div>
        <Link className="button button-secondary" to="/admin/clinicians">Manage clinicians</Link>
      </section>

      <section className="summary-strip">
        <article><div><CalendarClock /></div><span><strong>{scheduled.length}</strong>Scheduled consultations</span></article>
        <article><div><UsersRound /></div><span><strong>{new Set(appointments.map((appointment) => appointment.patient?.email)).size}</strong>Patients in your care</span></article>
      </section>

      <section className="panel" id="appointments">
        <div className="section-heading"><div><p className="eyebrow">Schedule</p><h2>Your consultations</h2></div><InvitePatientForm onCreated={() => void load()} /></div>
        <div className="appointment-table">
          {appointments.length === 0 ? <div className="empty-records"><UsersRound /><strong>No patients yet</strong><span>Create your first secure patient link to add a patient and appointment.</span></div> : appointments.map((appointment) => (
            <article className="appointment-row" key={appointment.id}>
              <div className="patient-avatar">{(appointment.patient?.display_name ?? '?').split(' ').map((part) => part[0]).join('').slice(0, 2)}</div>
              <div><strong>{appointment.patient?.display_name ?? 'Patient'}</strong><span>{appointment.reason}</span></div>
              <div><strong>{new Date(appointment.starts_at).toLocaleString()}</strong><span>{appointment.patient?.email}</span></div>
              <StatusPill tone={new Date(appointment.starts_at) <= new Date() ? 'green' : 'neutral'}>{new Date(appointment.starts_at) <= new Date() ? 'Ready' : 'Scheduled'}</StatusPill>
              <Link className="button button-primary button-small" to={`/consultation/${appointment.id}?role=clinician`}><Video size={17} /> Join call</Link>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
