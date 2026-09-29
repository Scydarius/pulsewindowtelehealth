import { LoaderCircle } from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { supabase } from '../services/supabase';
import { verifyClinicianAccess } from '../services/clinicAccess';

/** Wait for browser session restoration before rendering a clinician route. */
export function ClinicianSessionGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const location = useLocation();

  useEffect(() => {
    let active = true;
    const assess = async (session: { access_token: string } | null) => {
      if (!session) { if (active) { setSignedIn(false); setReady(true); } return; }
      try {
        await verifyClinicianAccess(session.access_token);
        if (active) { setSignedIn(true); setReady(true); }
      } catch {
        // Never leave a non-approved authenticated account parked inside the UI.
        await supabase?.auth.signOut({ scope: 'local' });
        if (active) { setSignedIn(false); setReady(true); }
      }
    };
    if (!supabase) { setReady(true); return; }
    void supabase.auth.getSession().then(({ data: { session } }) => void assess(session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => void assess(session));
    return () => { active = false; subscription.unsubscribe(); };
  }, []);

  if (!ready) return <div className="page-loading session-loading"><LoaderCircle className="spin" /> Restoring your secure workspace…</div>;
  if (!signedIn) return <Navigate to="/clinician/sign-in" replace state={{ denied: true, from: `${location.pathname}${location.search}` }} />;
  return <>{children}</>;
}
