import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { LandingPage } from './pages/LandingPage';

const PatientPage = lazy(() => import('./pages/PatientPage').then((module) => ({ default: module.PatientPage })));
const ClinicianPage = lazy(() => import('./pages/ClinicianPage').then((module) => ({ default: module.ClinicianPage })));
const ConsultationPage = lazy(() => import('./pages/ConsultationPage').then((module) => ({ default: module.ConsultationPage })));

const page = (element: React.ReactNode) => (
  <Suspense fallback={<div className="page-loading">Loading PulseWindow…</div>}>
    {element}
  </Suspense>
);

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route element={<AppShell />}>
        <Route path="/patient" element={page(<PatientPage />)} />
        <Route path="/clinician" element={page(<ClinicianPage />)} />
        <Route path="/consultation/:appointmentId" element={page(<ConsultationPage />)} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
