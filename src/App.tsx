import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { LandingPage } from './pages/LandingPage';

const PatientPage = lazy(() => import('./pages/PatientPage').then((module) => ({ default: module.PatientPage })));
const ClinicianPage = lazy(() => import('./pages/ClinicianPage').then((module) => ({ default: module.ClinicianPage })));
const ConsultationPage = lazy(() => import('./pages/ConsultationPage').then((module) => ({ default: module.ConsultationPage })));
const ClinicianSignInPage = lazy(() => import('./pages/ClinicianSignInPage').then((module) => ({ default: module.ClinicianSignInPage })));
const PatientInvitePage = lazy(() => import('./pages/PatientInvitePage').then((module) => ({ default: module.PatientInvitePage })));

const page = (element: React.ReactNode) => (
  <Suspense fallback={<div className="page-loading">Loading PulseWindow…</div>}>
    {element}
  </Suspense>
);

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/clinician/sign-in" element={page(<ClinicianSignInPage />)} />
      <Route path="/join" element={page(<PatientInvitePage />)} />
      <Route element={<AppShell />}>
        <Route path="/patient" element={page(<PatientPage />)} />
        <Route path="/clinician" element={page(<ClinicianPage />)} />
        <Route path="/consultation/:appointmentId" element={page(<ConsultationPage />)} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
