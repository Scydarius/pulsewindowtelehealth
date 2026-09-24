import { CalendarDays, CircleAlert, HeartPulse, LoaderCircle, Video } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { fetchPatientInvitation } from '../services/clinicAccess';

type Invitation = { appointmentId: string; clinicianName: string; reason: string; startsAt: string };

export function PatientInvitePage() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const [invitation, setInvitation] = useState<Invitation>();
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) return;
    void fetchPatientInvitation(token).then(setInvitation).catch((reason: Error) => setError(reason.message));
  }, [token]);

  const linkError = error || (!token ? 'This patient link is incomplete. Please ask your clinician to send it again.' : '');

  return <main className="access-page"><section className="access-card patient-invite-card">
    <div className="access-icon"><HeartPulse /></div>
    {linkError ? <><CircleAlert size={28} className="invite-error-icon" /><h1>This link is unavailable</h1><p>{linkError}</p></> : !invitation ? <><LoaderCircle className="spin" /><h1>Opening your consultation</h1><p>Checking your secure appointment link…</p></> : <>
      <p className="eyebrow">PulseWindow appointment</p><h1>Your clinician has invited you</h1>
      <p><strong>{invitation.reason}</strong><br />with {invitation.clinicianName}</p>
      <div className="invite-details"><span><CalendarDays size={17} /> {new Date(invitation.startsAt).toLocaleString()}</span><span><Video size={17} /> Camera and microphone needed</span></div>
      <Link className="button button-primary button-full" to={`/consultation/${invitation.appointmentId}?role=patient&invite=${encodeURIComponent(token ?? '')}`}>Join consultation</Link>
      <p className="clinical-note">Research prototype only. Do not use this service for an emergency.</p>
    </>}
  </section></main>;
}
