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

export type ApprovedClinician = { id: string; displayName: string; isAdmin: boolean };

/** Confirm that an authenticated account is an administrator-approved clinician. */
export async function verifyClinicianAccess(accessToken?: string): Promise<ApprovedClinician> {
  const token = accessToken ?? await getClinicianAccessToken();
  const response = await fetch('/api/clinician-access', { headers: { Authorization: `Bearer ${token}` } });
  const body = await response.json().catch(() => ({ error: 'Clinician access could not be verified.' })) as { clinician?: ApprovedClinician; error?: string };
  if (!response.ok || !body.clinician) throw new Error(body.error ?? 'This account is not an authorised clinician.');
  return body.clinician;
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
export type PatientProfile = { email: string; display_name: string; appointments: Array<{ id: string; reason: string; starts_at: string; created_at: string; measurements: SavedMeasurement[] }> };

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

export async function loadPatientProfile(patientId: string) {
  const token = await getClinicianAccessToken();
  const response = await fetch(`/api/patient-profile?patientId=${encodeURIComponent(patientId)}`, { headers: { Authorization: `Bearer ${token}` } });
  const body = await response.json().catch(() => ({ error: 'The patient profile could not be loaded.' })) as { patient?: PatientProfile; error?: string };
  if (!response.ok || !body.patient) throw new Error(body.error ?? 'The patient profile could not be loaded.');
  return body.patient;
}

export type PrivateClinicalNote = { content: string; updated_at: string | null };

export async function loadPrivateClinicalNote(appointmentId: string) {
  const token = await getClinicianAccessToken();
  const response = await fetch(`/api/clinical-notes?appointmentId=${encodeURIComponent(appointmentId)}`, { headers: { Authorization: `Bearer ${token}` } });
  const body = await response.json().catch(() => ({ error: 'Private notes could not be loaded.' })) as { note?: PrivateClinicalNote; error?: string };
  if (!response.ok || !body.note) throw new Error(body.error ?? 'Private notes could not be loaded.');
  return body.note;
}

export async function savePrivateClinicalNote(appointmentId: string, content: string) {
  const token = await getClinicianAccessToken();
  const response = await fetch('/api/clinical-notes', { method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ appointmentId, content }) });
  const body = await response.json().catch(() => ({ error: 'Private notes could not be saved.' })) as { note?: PrivateClinicalNote; error?: string };
  if (!response.ok || !body.note) throw new Error(body.error ?? 'Private notes could not be saved.');
  return body.note;
}

export async function createPatientInvitation(invitation: PatientInvitation) {
  const token = await getClinicianAccessToken();
  const response = await fetch('/api/clinician-invitations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(invitation),
  });
  const body = await response.json().catch(() => ({ error: 'The secure invitation service is temporarily unavailable. Please try again.' })) as { invitationUrl?: string; emailSent?: boolean; emailWarning?: string; error?: string };
  if (!response.ok || !body.invitationUrl) throw new Error(body.error ?? 'Unable to create the patient link.');
  return { invitationUrl: body.invitationUrl, emailSent: body.emailSent === true, emailWarning: body.emailWarning };
}

export type BookingAvailabilityDay = { day: number; enabled: boolean; start: string; end: string };
export type ClinicianBookingSettings = { booking_token: string; bookingUrl: string; timezone: string; duration_minutes: number; weekly_availability: BookingAvailabilityDay[]; booking_enabled: boolean; booking_reason: string };
export type PublicBookingProfile = { clinicianName: string; timezone: string; durationMinutes: number; bookingReason: string };

async function bookingRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, options);
  const body = await response.json().catch(() => ({ error: 'The booking service is temporarily unavailable.' })) as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? 'The booking service is temporarily unavailable.');
  return body;
}

export async function loadClinicianBookingSettings() {
  const token = await getClinicianAccessToken();
  return bookingRequest<ClinicianBookingSettings>('/api/clinician-invitations?action=availability', { headers: { Authorization: `Bearer ${token}` } });
}
export async function saveClinicianBookingSettings(input: Pick<ClinicianBookingSettings, 'timezone' | 'duration_minutes' | 'weekly_availability' | 'booking_enabled' | 'booking_reason'>) {
  const token = await getClinicianAccessToken();
  return bookingRequest<{ bookingToken: string; bookingUrl: string }>('/api/clinician-invitations', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'save-availability', timezone: input.timezone, durationMinutes: input.duration_minutes, weeklyAvailability: input.weekly_availability, bookingEnabled: input.booking_enabled, bookingReason: input.booking_reason }) });
}
export async function loadPublicBookingProfile(bookingToken: string) { return bookingRequest<PublicBookingProfile>(`/api/clinician-invitations?action=public-profile&bookingToken=${encodeURIComponent(bookingToken)}`); }
export async function loadPublicBookingSlots(bookingToken: string, date: string) { return bookingRequest<{ slots: string[]; timezone: string }>(`/api/clinician-invitations?action=public-slots&bookingToken=${encodeURIComponent(bookingToken)}&date=${encodeURIComponent(date)}`); }
export async function bookPublicAppointment(input: { bookingToken: string; patientName: string; patientEmail: string; reason: string; startsAt: string }) {
  return bookingRequest<{ emailSent: boolean; emailWarning?: string; startsAt: string }>('/api/clinician-invitations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'public-book', ...input }) });
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

/** Revoke the current patient joining link without deleting the appointment or clinical record. */
export async function revokePatientInvitation(appointmentId: string) {
  const token = await getClinicianAccessToken();
  const response = await fetch('/api/appointment-patient-link', {
    method: 'DELETE', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ appointmentId }),
  });
  const body = await response.json().catch(() => ({ error: 'The secure invitation service is temporarily unavailable.' })) as { error?: string };
  if (!response.ok) throw new Error(body.error ?? 'Unable to revoke patient access.');
}

/** Remove a clinician's appointment and its linked call/measurement data, while retaining the patient record. */
export async function deleteAppointment(appointmentId: string) {
  const token = await getClinicianAccessToken();
  const response = await fetch('/api/appointment-patient-link', {
    method: 'DELETE', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ appointmentId, deleteAppointment: true }),
  });
  const body = await response.json().catch(() => ({ error: 'The appointment service is temporarily unavailable.' })) as { error?: string };
  if (!response.ok) throw new Error(body.error ?? 'Unable to remove the appointment.');
}

export async function fetchPatientInvitation(token: string) {
  const response = await fetch(`/api/patient-invitations?token=${encodeURIComponent(token)}`);
  const body = await response.json().catch(() => ({ error: 'The secure invitation service is temporarily unavailable. Please try again.' })) as {
    appointmentId?: string; clinicianName?: string; reason?: string; startsAt?: string; error?: string;
  };
  if (!response.ok || !body.appointmentId) throw new Error(body.error ?? 'This patient link is no longer available.');
  return body as Required<Omit<typeof body, 'error'>>;
}

export type GoogleCalendarStatus = {
  configured: boolean;
  connected: boolean;
  email: string | null;
  syncEnabled: boolean;
};

export async function loadGoogleCalendarStatus(): Promise<GoogleCalendarStatus> {
  const token = await getClinicianAccessToken();
  const response = await fetch('/api/google-calendar?action=status', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = (await response.json().catch(() => ({}))) as GoogleCalendarStatus & { error?: string };
  if (!response.ok) throw new Error(body.error ?? 'Could not check Google Calendar status.');
  return body;
}

export async function getGoogleCalendarAuthUrl(): Promise<string> {
  const token = await getClinicianAccessToken();
  const response = await fetch('/api/google-calendar?action=auth-url', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = (await response.json().catch(() => ({}))) as { authUrl?: string; error?: string };
  if (!response.ok || !body.authUrl) throw new Error(body.error ?? 'Could not initiate Google Calendar connection.');
  return body.authUrl;
}

export async function disconnectGoogleCalendar(): Promise<void> {
  const token = await getClinicianAccessToken();
  const response = await fetch('/api/google-calendar', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'disconnect' }),
  });
  const body = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) throw new Error(body.error ?? 'Could not disconnect Google Calendar.');
}

export async function toggleGoogleCalendarSync(enabled: boolean): Promise<boolean> {
  const token = await getClinicianAccessToken();
  const response = await fetch('/api/google-calendar', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'toggle-sync', enabled }),
  });
  const body = (await response.json().catch(() => ({}))) as { syncEnabled?: boolean; error?: string };
  if (!response.ok) throw new Error(body.error ?? 'Could not update calendar sync setting.');
  return body.syncEnabled ?? enabled;
}

