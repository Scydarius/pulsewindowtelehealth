import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { ClinicianSessionGate } from './components/ClinicianSessionGate';
import { LandingPage } from './pages/LandingPage';

const ClinicianPage = lazy(() => import('./pages/ClinicianPage').then((module) => ({ default: module.ClinicianPage })));
const ConsultationPage = lazy(() => import('./pages/ConsultationPage').then((module) => ({ default: module.ConsultationPage })));
const ClinicianSignInPage = lazy(() => import('./pages/ClinicianSignInPage').then((module) => ({ default: module.ClinicianSignInPage })));
const ClinicianResetPasswordPage = lazy(() => import('./pages/ClinicianResetPasswordPage').then((module) => ({ default: module.ClinicianResetPasswordPage })));
const ClinicianActivateAccountPage = lazy(() => import('./pages/ClinicianActivateAccountPage').then((module) => ({ default: module.ClinicianActivateAccountPage })));
const PatientInvitePage = lazy(() => import('./pages/PatientInvitePage').then((module) => ({ default: module.PatientInvitePage })));
const AdminCliniciansPage = lazy(() => import('./pages/AdminCliniciansPage').then((module) => ({ default: module.AdminCliniciansPage })));

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
      <Route path="/clinician/forgot-password" element={page(<ClinicianResetPasswordPage />)} />
      <Route path="/clinician/reset-password" element={page(<ClinicianResetPasswordPage />)} />
      <Route path="/clinician/activate" element={page(<ClinicianActivateAccountPage />)} />
      <Route path="/join" element={page(<PatientInvitePage />)} />
      <Route element={<AppShell />}>
        <Route path="/clinician" element={page(<ClinicianSessionGate><ClinicianPage /></ClinicianSessionGate>)} />
        <Route path="/admin/clinicians" element={page(<ClinicianSessionGate><AdminCliniciansPage /></ClinicianSessionGate>)} />
        <Route path="/consultation/:appointmentId" element={page(<ConsultationPage />)} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
