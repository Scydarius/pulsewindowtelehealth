import { CalendarDays, LayoutDashboard, LogOut, ShieldCheck, Stethoscope, UserRound } from 'lucide-react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { supabase } from '../services/supabase';
import { verifyClinicianAccess } from '../services/clinicAccess';
import { RouteErrorBoundary } from './ErrorBoundary';

export function AppShell() {
  const location = useLocation();
  const isConsultation = location.pathname.startsWith('/consultation');
  const consultationRole = new URLSearchParams(location.search).get('role');
  const isAdminPage = location.pathname.startsWith('/admin');
  const isClinicianPage = location.pathname.startsWith('/clinician');
  const isClinician = location.pathname.startsWith('/clinician') || isAdminPage || (isConsultation && consultationRole === 'clinician');
  const clinicianView = new URLSearchParams(location.search).get('view') ?? 'overview';
  const workspaceNavClass = (view: string) => isClinicianPage && clinicianView === view ? 'active' : undefined;
  const navigate = useNavigate();
  const [signedInEmail, setSignedInEmail] = useState('');
  const [signingOut, setSigningOut] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
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
  useEffect(() => { let active = true; if (!isClinician) return; void verifyClinicianAccess().then((clinician) => { if (active) setIsAdmin(clinician.isAdmin); }).catch(() => { if (active) setIsAdmin(false); }); return () => { active = false; }; }, [isClinician]);

  return (
    <div className="app-shell">
      <header className="app-header">
        <NavLink
          to={isClinician ? '/clinician' : '/'}
          className={`brand ${isClinician ? 'brand-clinician' : ''}`}
          aria-label={isClinician ? 'Ventricura clinician dashboard' : 'Ventricura home'}
        >
          <img className="brand-wordmark" src="/ventricura-logo-centred.png" alt="Ventricura" />
          {isClinician && <span className="brand-subtext">for clinicians</span>}
        </NavLink>

        {!isConsultation && (
          <nav className="primary-nav" aria-label="Primary navigation">
            <Link to="/clinician" className={workspaceNavClass('overview')}>
              <LayoutDashboard size={18} /> Overview
            </Link>
            <Link to="/clinician?view=patients" className={workspaceNavClass('patients')}><UserRound size={18} /> Patients</Link>
            <Link to="/clinician?view=appointments" className={workspaceNavClass('appointments')}><CalendarDays size={18} /> Appointments</Link>
            <Link to="/clinician?view=calendar" className={workspaceNavClass('calendar')}><CalendarDays size={18} /> Calendar</Link>
            <Link to="/clinician?view=availability" className={workspaceNavClass('availability')}><CalendarDays size={18} /> Availability</Link>
            <Link to="/clinician?view=measurements" className={workspaceNavClass('measurements')}><Stethoscope size={18} /> Measurements</Link>
            <Link to="/clinician/profile" className={location.pathname === '/clinician/profile' ? 'active' : undefined}><UserRound size={18} /> My profile</Link>
            {isAdmin && <Link to="/admin" className={isAdminPage ? 'active' : undefined}><ShieldCheck size={18} /> Admin</Link>}
          </nav>
        )}

        <div className="header-user">
          <div className="avatar"><UserRound size={19} /></div>
          <div className="header-user-copy">
            <strong>{isAdminPage ? 'Administrator portal' : isClinician ? 'Clinician workspace' : 'Secure appointment'}</strong>
            <span>{isClinician ? (signedInEmail || 'Restoring sign-in…') : 'Patient access'}</span>
          </div>
          {isClinician && <button className="header-sign-out" onClick={() => void signOut()} disabled={signingOut}><LogOut size={16} /> {signingOut ? 'Signing out…' : 'Sign out'}</button>}
        </div>
      </header>

      {!isConsultation && isClinician && (
        <nav className="clinician-mobile-nav" aria-label="Mobile workspace navigation">
          <Link to="/clinician" className={workspaceNavClass('overview')}>Overview</Link>
          <Link to="/clinician?view=patients" className={workspaceNavClass('patients')}>Patients</Link>
          <Link to="/clinician?view=appointments" className={workspaceNavClass('appointments')}>Appointments</Link>
          <Link to="/clinician?view=calendar" className={workspaceNavClass('calendar')}>Calendar</Link>
          <Link to="/clinician?view=availability" className={workspaceNavClass('availability')}>Availability</Link>
          <Link to="/clinician?view=measurements" className={workspaceNavClass('measurements')}>Measurements</Link>
          <Link to="/clinician/profile" className={location.pathname === '/clinician/profile' ? 'active' : undefined}>Profile</Link>
          {isAdmin && <Link to="/admin" className={isAdminPage ? 'active' : undefined}>Admin</Link>}
        </nav>
      )}

      <main key={location.pathname} className="app-main">
        <RouteErrorBoundary>
          <Outlet />
        </RouteErrorBoundary>
      </main>
    </div>
  );
}
