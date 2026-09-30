import { CalendarDays, CircleAlert, HeartPulse, LoaderCircle, Video } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { fetchPatientInvitation } from '../services/clinicAccess';

type Invitation = { appointmentId: string; clinicianName: string; reason: string; startsAt: string };

export function PatientInvitePage() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const [invitation, setInvitation] = useState<Invitation>();
  const [error, setError] = useState('');
  const [consent, setConsent] = useState(false);
  const [consenting, setConsenting] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!token) return;
    void fetchPatientInvitation(token).then(setInvitation).catch((reason: Error) => setError(reason.message));
  }, [token]);

  const linkError = error || (!token ? 'This patient link is incomplete. Please ask your clinician to send it again.' : '');
  const join = async () => {
    if (!invitation || !token || !consent) return;
    setConsenting(true);
    setError('');
    try {
      const { recordPatientAppointmentConsent } = await import('../services/clinicAccess');
      await recordPatientAppointmentConsent(invitation.appointmentId, token);
      navigate(`/consultation/${invitation.appointmentId}?role=patient&invite=${encodeURIComponent(token)}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to record your consent. Please try again.');
    } finally { setConsenting(false); }
  };

  return <main className="access-page"><section className="access-card patient-invite-card">
    <div className="access-icon"><HeartPulse /></div>
    {linkError ? <><CircleAlert size={28} className="invite-error-icon" /><h1>This link is unavailable</h1><p>{linkError}</p></> : !invitation ? <><LoaderCircle className="spin" /><h1>Opening your consultation</h1><p>Checking your secure appointment link…</p></> : <>
      <p className="eyebrow">Ventricura appointment</p><h1>Your clinician has invited you</h1>
      <p><strong>{invitation.reason}</strong><br />with {invitation.clinicianName}</p>
      <div className="invite-details"><span><CalendarDays size={17} /> {new Date(invitation.startsAt).toLocaleString()}</span><span><Video size={17} /> Camera and microphone needed</span></div>
      <label className="patient-consent"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /><span>I consent to Ventricura using the information I provide and my camera feed for this appointment, as described in the <Link to="/privacy" target="_blank">Privacy Policy</Link>.</span></label>
      <button className="button button-primary button-full" type="button" onClick={() => void join()} disabled={!consent || consenting}>{consenting ? 'Preparing appointment…' : 'Join consultation'}</button>
      <p className="clinical-note">Research prototype only. Do not use this service for an emergency.</p>
    </>}
  </section></main>;
}
