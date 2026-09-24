import { CalendarDays, LayoutDashboard, LogOut, Stethoscope, UserRound } from 'lucide-react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { supabase } from '../services/supabase';

export function AppShell() {
  const location = useLocation();
  const isConsultation = location.pathname.startsWith('/consultation');
  const consultationRole = new URLSearchParams(location.search).get('role');
  const isClinician = location.pathname.startsWith('/clinician') || (isConsultation && consultationRole === 'clinician');
  const navigate = useNavigate();
  const [signedInEmail, setSignedInEmail] = useState('');
  const [signingOut, setSigningOut] = useState(false);
  const signOut = async () => {
    setSigningOut(true);
    await supabase?.auth.signOut({ scope: 'local' });
    navigate('/');
  };
  useEffect(() => {
    if (!supabase) return;
    const setEmail = (session: { user: { email?: string } } | null) => setSignedInEmail(session?.user.email ?? '');
    void supabase.auth.getSession().then(({ data: { session } }) => setEmail(session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => setEmail(session));
    return () => subscription.unsubscribe();
  }, []);

  return (
    <div className="app-shell">
      <header className="app-header">
        <NavLink to="/" className="brand" aria-label="PulseWindow home">
          <img src="/pulsewindow-mark.svg" alt="" />
          <span>PulseWindow</span>
        </NavLink>

        {!isConsultation && (
          <nav className="primary-nav" aria-label="Primary navigation">
            <NavLink to="/clinician">
              <LayoutDashboard size={18} /> Overview
            </NavLink>
            <a href="#appointments"><CalendarDays size={18} /> Appointments</a>
            <a href="#measurements"><Stethoscope size={18} /> Measurements</a>
          </nav>
        )}

        <div className="header-user">
          <div className="avatar"><UserRound size={19} /></div>
          <div className="header-user-copy">
            <strong>{isClinician ? 'Clinician workspace' : 'Secure appointment'}</strong>
            <span>{isClinician ? (signedInEmail || 'Restoring sign-in…') : 'Patient access'}</span>
          </div>
          {isClinician && <button className="header-sign-out" onClick={() => void signOut()} disabled={signingOut}><LogOut size={16} /> {signingOut ? 'Signing out…' : 'Sign out'}</button>}
        </div>
      </header>
      <main key={`${location.pathname}${location.search}`} className="app-main app-page-enter">
        <Outlet />
      </main>
    </div>
  );
}
