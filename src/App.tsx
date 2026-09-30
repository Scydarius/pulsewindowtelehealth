import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useSearchParams } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { AdminSessionGate } from './components/AdminSessionGate';
import { ClinicianSessionGate } from './components/ClinicianSessionGate';
import { PatientSessionGate } from './components/PatientSessionGate';
import { LandingPage } from './pages/LandingPage';

const ClinicianPage = lazy(() => import('./pages/ClinicianPage').then((module) => ({ default: module.ClinicianPage })));
const ConsultationPage = lazy(() => import('./pages/ConsultationPage').then((module) => ({ default: module.ConsultationPage })));
const ClinicianSignInPage = lazy(() => import('./pages/ClinicianSignInPage').then((module) => ({ default: module.ClinicianSignInPage })));
const ClinicianResetPasswordPage = lazy(() => import('./pages/ClinicianResetPasswordPage').then((module) => ({ default: module.ClinicianResetPasswordPage })));
const ClinicianActivateAccountPage = lazy(() => import('./pages/ClinicianActivateAccountPage').then((module) => ({ default: module.ClinicianActivateAccountPage })));
const PatientInvitePage = lazy(() => import('./pages/PatientInvitePage').then((module) => ({ default: module.PatientInvitePage })));
const AdminCliniciansPage = lazy(() => import('./pages/AdminCliniciansPage').then((module) => ({ default: module.AdminCliniciansPage })));
const PatientProfilePage = lazy(() => import('./pages/PatientProfilePage').then((module) => ({ default: module.PatientProfilePage })));
const TechnologyPage = lazy(() => import('./pages/TechnologyPage').then((module) => ({ default: module.TechnologyPage })));
const LiveDemoPage = lazy(() => import('./pages/LiveDemoPage').then((module) => ({ default: module.LiveDemoPage })));
const ContactPage = lazy(() => import('./pages/ContactPage').then((module) => ({ default: module.ContactPage })));
const CliniciansPage = lazy(() => import('./pages/CliniciansPage').then((module) => ({ default: module.CliniciansPage })));
const TrustPage = lazy(() => import('./pages/TrustPages').then((module) => ({ default: module.TrustPage })));
const BookingPage = lazy(() => import('./pages/BookingPage').then((module) => ({ default: module.BookingPage })));
const ConsultationReviewPage = lazy(() => import('./pages/ConsultationReviewPage').then((module) => ({ default: module.ConsultationReviewPage })));

const page = (element: React.ReactNode) => (
  <Suspense fallback={<div className="page-loading">Loading Ventricura…</div>}>
    {element}
  </Suspense>
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
