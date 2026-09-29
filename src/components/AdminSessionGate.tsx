import { LoaderCircle, ShieldCheck } from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { claimInitialAdministratorAccess, verifyClinicianAccess } from '../services/clinicAccess';
import { supabase } from '../services/supabase';

/** Requires both a clinician account and the administrator flag before admin tools render. */
export function AdminSessionGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<'checking' | 'administrator' | 'setup' | 'denied'>('checking');
  const [message, setMessage] = useState('');
  const [working, setWorking] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      const { data: { session } } = await supabase?.auth.getSession() ?? { data: { session: null } };
      if (!session) { if (active) { setMessage('Sign in is required to manage the clinic.'); setState('denied'); } return; }
      try {
        const clinician = await verifyClinicianAccess(session.access_token);
        if (active) setState(clinician.isAdmin ? 'administrator' : 'setup');
      } catch (error) {
        if (active) { setMessage(error instanceof Error ? error.message : 'Administrator access could not be verified.'); setState('denied'); }
      }
    })();
    return () => { active = false; };
  }, []);

  const setup = async () => {
    setWorking(true); setMessage('');
    try {
      await claimInitialAdministratorAccess();
      const clinician = await verifyClinicianAccess();
      if (!clinician.isAdmin) throw new Error('Administrator access was not applied.');
      setState('administrator');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Administrator setup could not be completed.');
      setState('denied');
    } finally { setWorking(false); }
  };

  if (state === 'checking') return <div className="workspace-state"><LoaderCircle className="spin" /><strong>Checking administrator access…</strong></div>;
  if (state === 'administrator') return <>{children}</>;
  if (state === 'setup') return <div className="workspace-state"><ShieldCheck /><strong>Administrator setup</strong><span>This account is an approved clinician but does not yet have administrator access.</span><button className="button button-primary" onClick={() => void setup()} disabled={working}>{working ? <LoaderCircle className="spin" size={17} /> : <ShieldCheck size={17} />}{working ? 'Applying access…' : 'Complete administrator setup'}</button>{message && <span>{message}</span>}</div>;
  return <div className="workspace-state"><ShieldCheck /><strong>Administrator access required</strong><span>{message || 'Ask an existing administrator to grant access.'}</span></div>;
}
