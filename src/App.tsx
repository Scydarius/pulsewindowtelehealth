import { Suspense } from 'react';
import { Navigate, Route, Routes, useSearchParams } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { AdminSessionGate } from './components/AdminSessionGate';
import { ClinicianSessionGate } from './components/ClinicianSessionGate';
import { PatientSessionGate } from './components/PatientSessionGate';
import { ErrorBoundary } from './components/ErrorBoundary';
import { lazyWithRetry } from './utils/lazyWithRetry';
import { LandingPage } from './pages/LandingPage';

const ClinicianPage = lazyWithRetry(() => import('./pages/ClinicianPage').then((module) => ({ default: module.ClinicianPage })));
const ConsultationPage = lazyWithRetry(() => import('./pages/ConsultationPage').then((module) => ({ default: module.ConsultationPage })));
const ClinicianSignInPage = lazyWithRetry(() => import('./pages/ClinicianSignInPage').then((module) => ({ default: module.ClinicianSignInPage })));
const ClinicianResetPasswordPage = lazyWithRetry(() => import('./pages/ClinicianResetPasswordPage').then((module) => ({ default: module.ClinicianResetPasswordPage })));
const ClinicianActivateAccountPage = lazyWithRetry(() => import('./pages/ClinicianActivateAccountPage').then((module) => ({ default: module.ClinicianActivateAccountPage })));
const PatientInvitePage = lazyWithRetry(() => import('./pages/PatientInvitePage').then((module) => ({ default: module.PatientInvitePage })));
const AdminCliniciansPage = lazyWithRetry(() => import('./pages/AdminCliniciansPage').then((module) => ({ default: module.AdminCliniciansPage })));
const PatientProfilePage = lazyWithRetry(() => import('./pages/PatientProfilePage').then((module) => ({ default: module.PatientProfilePage })));
const TechnologyPage = lazyWithRetry(() => import('./pages/TechnologyPage').then((module) => ({ default: module.TechnologyPage })));
const LiveDemoPage = lazyWithRetry(() => import('./pages/LiveDemoPage').then((module) => ({ default: module.LiveDemoPage })));
const ContactPage = lazyWithRetry(() => import('./pages/ContactPage').then((module) => ({ default: module.ContactPage })));
const CliniciansPage = lazyWithRetry(() => import('./pages/CliniciansPage').then((module) => ({ default: module.CliniciansPage })));
const TrustPage = lazyWithRetry(() => import('./pages/TrustPages').then((module) => ({ default: module.TrustPage })));
const BookingPage = lazyWithRetry(() => import('./pages/BookingPage').then((module) => ({ default: module.BookingPage })));
const ConsultationReviewPage = lazyWithRetry(() => import('./pages/ConsultationReviewPage').then((module) => ({ default: module.ConsultationReviewPage })));

const page = (element: React.ReactNode) => (
  <ErrorBoundary>
    <Suspense fallback={<div className="page-loading">Loading Ventricura…</div>}>
      {element}
    </Suspense>
  </ErrorBoundary>
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
      <Route path="/" element={<LandingPage />} />
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
        <Route path="/admin" element={page(<ClinicianSessionGate><AdminSessionGate><AdminCliniciansPage /></AdminSessionGate></ClinicianSessionGate>)} />
        <Route path="/admin/clinicians" element={<Navigate to="/admin" replace />} />
        <Route path="/consultation/:appointmentId" element={<ConsultationRoute />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
