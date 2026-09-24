import { supabase } from './supabase';

export type PatientInvitation = {
  patientName: string;
  patientEmail: string;
  reason: string;
  startsAt: string;
};

export async function getClinicianAccessToken() {
  if (!supabase) throw new Error('The clinical database is not configured.');
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Please sign in as a clinician first.');
  return session.access_token;
}

export async function claimInitialAdministratorAccess() {
  const token = await getClinicianAccessToken();
  const response = await fetch('/api/claim-initial-admin', {
    method: 'POST', headers: { Authorization: `Bearer ${token}` },
  });
  const body = await response.json().catch(() => ({ error: 'The administrator setup service is temporarily unavailable.' })) as { error?: string };
  if (!response.ok) throw new Error(body.error ?? 'Unable to complete administrator setup.');
}

export type SavedMeasurement = { measured_at: string; heart_rate_bpm: number; respiratory_rate_bpm: number; signal_quality: number; algorithm_version: string | null; diagnostics?: Record<string, unknown> | null };

export async function savePatientMeasurement(input: { appointmentId: string; invitationToken: string; heartRateBpm: number; respiratoryRateBpm: number; signalQuality: number; algorithmVersion?: string; diagnostics?: Record<string, unknown> }) {
  const response = await fetch('/api/measurements', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
  const body = await response.json().catch(() => ({ error: 'The measurement record could not be saved.' })) as { error?: string };
  if (!response.ok) throw new Error(body.error ?? 'The measurement record could not be saved.');
}

export async function loadLatestPatientMeasurement(appointmentId: string) {
  const token = await getClinicianAccessToken();
  const response = await fetch(`/api/measurements?appointmentId=${encodeURIComponent(appointmentId)}`, { headers: { Authorization: `Bearer ${token}` } });
  const body = await response.json().catch(() => ({ error: 'The measurement record could not be loaded.' })) as { measurement?: SavedMeasurement | null; error?: string };
  if (!response.ok) throw new Error(body.error ?? 'The measurement record could not be loaded.');
  return body.measurement ?? null;
}

export async function loadPatientMeasurementTrend(appointmentId: string) {
  const token = await getClinicianAccessToken();
  const response = await fetch(`/api/measurements?appointmentId=${encodeURIComponent(appointmentId)}`, { headers: { Authorization: `Bearer ${token}` } });
  const body = await response.json().catch(() => ({ error: 'The measurement record could not be loaded.' })) as { measurements?: SavedMeasurement[]; error?: string };
  if (!response.ok) throw new Error(body.error ?? 'The measurement record could not be loaded.');
  return body.measurements ?? [];
}

export async function createPatientInvitation(invitation: PatientInvitation) {
  const token = await getClinicianAccessToken();
  const response = await fetch('/api/clinician-invitations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(invitation),
  });
  const body = await response.json().catch(() => ({ error: 'The secure invitation service is temporarily unavailable. Please try again.' })) as { invitationUrl?: string; error?: string };
  if (!response.ok || !body.invitationUrl) throw new Error(body.error ?? 'Unable to create the patient link.');
  return body.invitationUrl;
}

export async function createReplacementPatientInvitation(appointmentId: string) {
  const token = await getClinicianAccessToken();
  const response = await fetch('/api/appointment-patient-link', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ appointmentId }),
  });
  const body = await response.json().catch(() => ({ error: 'The secure invitation service is temporarily unavailable.' })) as { invitationUrl?: string; error?: string };
  if (!response.ok || !body.invitationUrl) throw new Error(body.error ?? 'Unable to create a replacement patient link.');
  return body.invitationUrl;
}

export async function fetchPatientInvitation(token: string) {
  const response = await fetch(`/api/patient-invitations?token=${encodeURIComponent(token)}`);
  const body = await response.json().catch(() => ({ error: 'The secure invitation service is temporarily unavailable. Please try again.' })) as {
    appointmentId?: string; clinicianName?: string; reason?: string; startsAt?: string; error?: string;
  };
  if (!response.ok || !body.appointmentId) throw new Error(body.error ?? 'This patient link is no longer available.');
  return body as Required<Omit<typeof body, 'error'>>;
}
