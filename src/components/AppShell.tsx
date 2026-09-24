import { CalendarDays, LayoutDashboard, LogOut, Stethoscope, UserRound } from 'lucide-react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';

export function AppShell() {
  const location = useLocation();
  const isClinician = location.pathname.startsWith('/clinician');
  const isConsultation = location.pathname.startsWith('/consultation');

  return (
    <div className="app-shell">
      <header className="app-header">
        <NavLink to="/" className="brand" aria-label="PulseWindow home">
          <img src="/pulsewindow-mark.svg" alt="" />
          <span>PulseWindow</span>
        </NavLink>

        {!isConsultation && (
          <nav className="primary-nav" aria-label="Primary navigation">
            <NavLink to={isClinician ? '/clinician' : '/patient'}>
              <LayoutDashboard size={18} /> Overview
            </NavLink>
            <a href="#appointments"><CalendarDays size={18} /> Appointments</a>
            <a href="#measurements"><Stethoscope size={18} /> Measurements</a>
          </nav>
        )}

        <div className="header-user">
          <div className="avatar"><UserRound size={19} /></div>
          <div className="header-user-copy">
            <strong>{isClinician ? 'Dr Maya Patel' : 'Claire Williams'}</strong>
            <span>{isClinician ? 'Clinician portal' : 'Patient portal'}</span>
          </div>
          <NavLink to="/" className="icon-button" aria-label="Sign out"><LogOut size={19} /></NavLink>
        </div>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
