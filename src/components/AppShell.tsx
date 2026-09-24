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
  const signOut = async () => { await supabase?.auth.signOut(); navigate('/'); };
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
          <button className="icon-button" onClick={() => void signOut()} aria-label="Sign out"><LogOut size={19} /></button>
        </div>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
