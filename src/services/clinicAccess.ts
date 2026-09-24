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

export async function fetchPatientInvitation(token: string) {
  const response = await fetch(`/api/patient-invitations?token=${encodeURIComponent(token)}`);
  const body = await response.json().catch(() => ({ error: 'The secure invitation service is temporarily unavailable. Please try again.' })) as {
    appointmentId?: string; clinicianName?: string; reason?: string; startsAt?: string; error?: string;
  };
  if (!response.ok || !body.appointmentId) throw new Error(body.error ?? 'This patient link is no longer available.');
  return body as Required<Omit<typeof body, 'error'>>;
}
