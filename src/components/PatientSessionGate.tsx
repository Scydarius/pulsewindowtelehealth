import { CircleAlert, LoaderCircle } from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { fetchPatientInvitation } from '../services/clinicAccess';

/**
 * Patient calls are deliberately protected separately from clinician sign-in.
 * A patient must hold the unexpired link issued for this exact appointment;
 * changing an appointment ID in the address bar is therefore not enough to
 * enter another patient's room.
 */
export function PatientSessionGate({ children }: { children: ReactNode }) {
  const { appointmentId } = useParams();
  const [params] = useSearchParams();
  const invitationToken = params.get('invite');
  const [state, setState] = useState<'checking' | 'allowed' | 'denied'>('checking');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;
    if (!invitationToken || !appointmentId) {
      setMessage('A secure patient appointment link is required to enter this consultation.');
      setState('denied');
      return undefined;
    }
    void fetchPatientInvitation(invitationToken)
      .then((invitation) => {
        if (!active) return;
        if (invitation.appointmentId !== appointmentId) {
          setMessage('This secure link is not for the consultation you requested.');
          setState('denied');
          return;
        }
        setState('allowed');
      })
      .catch((error: Error) => {
        if (!active) return;
        setMessage(error.message || 'This secure patient link is unavailable.');
        setState('denied');
      });
    return () => { active = false; };
  }, [appointmentId, invitationToken]);

  if (state === 'checking') return <div className="page-loading session-loading"><LoaderCircle className="spin" /> Checking your secure appointment link…</div>;
  if (state === 'allowed') return <>{children}</>;
  return <main className="access-page"><section className="access-card patient-invite-card"><CircleAlert size={28} className="invite-error-icon" /><p className="eyebrow">Secure appointment</p><h1>This link is unavailable</h1><p>{message}</p><Link className="button button-primary button-full" to="/contact">Contact Ventricura</Link></section></main>;
}
