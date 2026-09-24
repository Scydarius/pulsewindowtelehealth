import { LoaderCircle } from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '../services/supabase';

/** Wait for browser session restoration before rendering a clinician route. */
export function ClinicianSessionGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    if (!supabase) { setReady(true); return; }
    void supabase.auth.getSession().then(({ data: { session } }) => {
      setSignedIn(Boolean(session));
      setReady(true);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSignedIn(Boolean(session));
      setReady(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  if (!ready) return <div className="page-loading session-loading"><LoaderCircle className="spin" /> Restoring your secure workspace…</div>;
  if (!signedIn) return <Navigate to="/clinician/sign-in" replace />;
  return <>{children}</>;
}
