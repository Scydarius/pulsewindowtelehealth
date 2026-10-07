import { Suspense } from 'react';
import { Navigate, Route, Routes, useSearchParams } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { AdminSessionGate } from './components/AdminSessionGate';
import { ClinicianSessionGate } from './components/ClinicianSessionGate';
import { PatientSessionGate } from './components/PatientSessionGate';
import { RouteErrorBoundary } from './components/ErrorBoundary';
import { lazyWithRetry } from './utils/lazyWithRetry';

import { LandingPage } from './pages/LandingPage';
import { TechnologyPage } from './pages/TechnologyPage';
import { CliniciansPage } from './pages/CliniciansPage';
import { ContactPage } from './pages/ContactPage';
import { TrustPage } from './pages/TrustPages';
import { ClinicianSignInPage } from './pages/ClinicianSignInPage';
import { ClinicianResetPasswordPage } from './pages/ClinicianResetPasswordPage';
import { ClinicianActivateAccountPage } from './pages/ClinicianActivateAccountPage';
import { PatientInvitePage } from './pages/PatientInvitePage';
import { BookingPage } from './pages/BookingPage';
import { ClinicianPage } from './pages/ClinicianPage';
import { PatientProfilePage } from './pages/PatientProfilePage';
import { ClinicianProfilePage } from './pages/ClinicianProfilePage';

// Code-split heavy routes (LiveKit WebRTC, camera processing, review engine)
const ConsultationPage = lazyWithRetry(() => import('./pages/ConsultationPage').then((module) => ({ default: module.ConsultationPage })));
const LiveDemoPage = lazyWithRetry(() => import('./pages/LiveDemoPage').then((module) => ({ default: module.LiveDemoPage })));
const AdminCliniciansPage = lazyWithRetry(() => import('./pages/AdminCliniciansPage').then((module) => ({ default: module.AdminCliniciansPage })));
const ConsultationReviewPage = lazyWithRetry(() => import('./pages/ConsultationReviewPage').then((module) => ({ default: module.ConsultationReviewPage })));

const page = (element: React.ReactNode) => (
  <RouteErrorBoundary>
    <Suspense fallback={<div className="page-loading">Loading Ventricura…</div>}>
      {element}
    </Suspense>
  </RouteErrorBoundary>
);

/** The same URL hosts patient and clinician calls; only the clinician view needs sign-in. */
function ConsultationRoute() {
  const [params] = useSearchParams();
  const consultation = page(<ConsultationPage />);
  return params.get('role') === 'clinician'
    ? <ClinicianSessionGate>{consultation}</ClinicianSessionGate>
    : <PatientSessionGate>{consultation}</PatientSessionGate>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={page(<LandingPage />)} />
      <Route path="/technology" element={page(<TechnologyPage />)} />
      <Route path="/demo" element={page(<LiveDemoPage />)} />
      <Route path="/contact" element={page(<ContactPage />)} />
      <Route path="/clinicians" element={page(<CliniciansPage />)} />
      <Route path="/privacy" element={page(<TrustPage kind="privacy" />)} />
      <Route path="/terms" element={page(<TrustPage kind="terms" />)} />
      <Route path="/security" element={page(<TrustPage kind="security" />)} />
      <Route path="/clinician/sign-in" element={page(<ClinicianSignInPage />)} />
      <Route path="/clinician/forgot-password" element={page(<ClinicianResetPasswordPage />)} />
      <Route path="/clinician/reset-password" element={page(<ClinicianResetPasswordPage />)} />
      <Route path="/clinician/activate" element={page(<ClinicianActivateAccountPage />)} />
      <Route path="/join" element={page(<PatientInvitePage />)} />
      <Route path="/book/:bookingToken" element={page(<BookingPage />)} />
      <Route element={<AppShell />}>
        <Route path="/clinician" element={page(<ClinicianSessionGate><ClinicianPage /></ClinicianSessionGate>)} />
        <Route path="/clinician/patient" element={page(<ClinicianSessionGate><PatientProfilePage /></ClinicianSessionGate>)} />
        <Route path="/clinician/review" element={page(<ClinicianSessionGate><ConsultationReviewPage /></ClinicianSessionGate>)} />
        <Route path="/clinician/profile" element={page(<ClinicianSessionGate><ClinicianProfilePage /></ClinicianSessionGate>)} />
        <Route path="/admin" element={page(<ClinicianSessionGate><AdminSessionGate><AdminCliniciansPage /></AdminSessionGate></ClinicianSessionGate>)} />
        <Route path="/admin/clinicians" element={<Navigate to="/admin" replace />} />
        <Route path="/consultation/:appointmentId" element={<ConsultationRoute />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
