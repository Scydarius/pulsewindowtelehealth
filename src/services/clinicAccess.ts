import { supabase } from './supabase';

export type PatientInvitation = {
  patientName: string;
  patientEmail: string;
  reason: string;
  patientNote?: string;
  startsAt: string;
};

export async function getClinicianAccessToken() {
  if (!supabase) throw new Error('The clinical database is not configured.');
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Please sign in as a clinician first.');
  return session.access_token;
}

export type ApprovedClinician = {
  id: string;
  displayName: string;
  professionalTitle?: string | null;
  isAdmin: boolean;
  isPlatformAdmin?: boolean;
  clinicId?: string | null;
  clinicName?: string | null;
  clinicSlug?: string | null;
  photoUrl?: string | null;
};

export type DirectoryPatient = {
  id: string;
  displayName: string;
  email: string;
  clinicianId?: string | null;
  clinicianName?: string | null;
  clinicianTitle?: string | null;
  clinicId?: string | null;
  clinicName?: string | null;
  clinicSlug?: string | null;
  appointmentCount: number;
  latestAppointment: string;
};

export async function loadClinicPatients(scope: 'mine' | 'clinic' | 'all' = 'clinic'): Promise<DirectoryPatient[]> {
  const token = await getClinicianAccessToken();
  const response = await fetch(`/api/patient-profile?action=directory&scope=${encodeURIComponent(scope)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = (await response.json().catch(() => ({}))) as { patients?: DirectoryPatient[]; error?: string };
  if (!response.ok || !body.patients) throw new Error(body.error ?? 'Unable to load patients.');
  return body.patients;
}

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
  const response = await fetch('/api/admin-clinicians?action=claim-initial-admin', {
    method: 'POST', headers: { Authorization: `Bearer ${token}` },
  });
  const body = await response.json().catch(() => ({ error: 'The administrator setup service is temporarily unavailable.' })) as { error?: string };
  if (!response.ok) throw new Error(body.error ?? 'Unable to complete administrator setup.');
}

export type SavedMeasurement = { measured_at: string; heart_rate_bpm: number; respiratory_rate_bpm: number; signal_quality: number; algorithm_version: string | null; diagnostics?: Record<string, unknown> | null };

export type PatientMedication = {
  id: string;
  patient_id: string;
  clinic_id?: string | null;
  prescribed_by_id?: string | null;
  prescribed_by_name: string;
  medication_name: string;
  generic_name?: string | null;
  brand_name?: string | null;
  artg_id?: string | null;
  dose: string;
  frequency: string;
  directions?: string | null;
  prescribed_date: string;
  repeats: number;
  is_pbs: boolean;
  status: 'active' | 'ceased' | 'completed';
  ceased_at?: string | null;
  ceased_reason?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
};

export type PatientProfile = {
  id?: string;
  email: string;
  display_name: string;
  clinic_id?: string | null;
  clinic_name?: string | null;
  clinic_slug?: string | null;
  assigned_clinician_name?: string | null;
  appointments: Array<{
    id: string;
    reason: string;
    starts_at: string;
    created_at: string;
    clinician_id?: string;
    clinician_name?: string | null;
    clinician_title?: string | null;
    clinic_name?: string | null;
    clinic_slug?: string | null;
    measurements: SavedMeasurement[];
  }>;
  medications?: PatientMedication[];
  tablePending?: boolean;
};

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
  
  // Merge any locally preserved fallback medications
  const localMeds = getLocalMedications(patientId);
  const serverMeds = body.patient.medications ?? [];
  const combined = [...serverMeds];
  for (const local of localMeds) {
    if (!combined.some((m) => m.id === local.id)) {
      combined.push(local);
    }
  }
  body.patient.medications = combined;
  return body.patient;
}

function getLocalMedications(patientId: string): PatientMedication[] {
  try {
    const raw = localStorage.getItem(`ventricura_local_meds_${patientId}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocalMedications(patientId: string, meds: PatientMedication[]) {
  try {
    localStorage.setItem(`ventricura_local_meds_${patientId}`, JSON.stringify(meds));
  } catch {}
}

export async function loadPatientMedications(patientId: string): Promise<{ medications: PatientMedication[]; tablePending?: boolean }> {
  const token = await getClinicianAccessToken();
  let serverMeds: PatientMedication[] = [];
  let tablePending = false;
  try {
    const response = await fetch(`/api/patient-profile?action=medications&patientId=${encodeURIComponent(patientId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (response.ok) {
      const body = (await response.json()) as { medications?: PatientMedication[]; tablePending?: boolean };
      serverMeds = body.medications ?? [];
      tablePending = Boolean(body.tablePending);
    }
  } catch {
    tablePending = true;
  }

  const localMeds = getLocalMedications(patientId);
  const combined = [...serverMeds];
  for (const local of localMeds) {
    if (!combined.some((m) => m.id === local.id)) {
      combined.push(local);
    }
  }
  return { medications: combined, tablePending };
}

export async function prescribePatientMedication(input: {
  patientId: string;
  medicationName: string;
  genericName?: string;
  brandName?: string;
  artgId?: string;
  dose: string;
  frequency: string;
  directions?: string;
  prescribedDate?: string;
  repeats?: number;
  isPbs?: boolean;
  notes?: string;
}): Promise<{ medication: PatientMedication; tablePending?: boolean }> {
  const token = await getClinicianAccessToken();
  try {
    const response = await fetch('/api/patient-profile?action=medications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(input),
    });
    const body = (await response.json().catch(() => ({}))) as {
      medication?: PatientMedication;
      message?: string;
      error?: string;
      tablePending?: boolean;
    };

    if (body.medication) {
      if (body.tablePending) {
        const current = getLocalMedications(input.patientId);
        saveLocalMedications(input.patientId, [body.medication, ...current.filter((m) => m.id !== body.medication!.id)]);
      }
      return { medication: body.medication, tablePending: body.tablePending };
    }

    if (body.error?.includes('schema cache') || body.error?.includes('patient_medications')) {
      const fallbackMed: PatientMedication = {
        id: 'local_' + Date.now(),
        patient_id: input.patientId,
        prescribed_by_name: 'You',
        medication_name: input.medicationName,
        generic_name: input.genericName || null,
        brand_name: input.brandName || null,
        artg_id: input.artgId || null,
        dose: input.dose,
        frequency: input.frequency,
        directions: input.directions || null,
        prescribed_date: input.prescribedDate || new Date().toISOString().slice(0, 10),
        repeats: input.repeats ?? 0,
        is_pbs: input.isPbs !== false,
        status: 'active',
        notes: input.notes || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const current = getLocalMedications(input.patientId);
      saveLocalMedications(input.patientId, [fallbackMed, ...current.filter((m) => m.id !== fallbackMed.id)]);
      return { medication: fallbackMed, tablePending: true };
    }

    throw new Error(body.error ?? 'Unable to save medication.');
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (msg.includes('schema cache') || msg.includes('patient_medications')) {
      const fallbackMed: PatientMedication = {
        id: 'local_' + Date.now(),
        patient_id: input.patientId,
        prescribed_by_name: 'You',
        medication_name: input.medicationName,
        generic_name: input.genericName || null,
        brand_name: input.brandName || null,
        artg_id: input.artgId || null,
        dose: input.dose,
        frequency: input.frequency,
        directions: input.directions || null,
        prescribed_date: input.prescribedDate || new Date().toISOString().slice(0, 10),
        repeats: input.repeats ?? 0,
        is_pbs: input.isPbs !== false,
        status: 'active',
        notes: input.notes || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const current = getLocalMedications(input.patientId);
      saveLocalMedications(input.patientId, [fallbackMed, ...current.filter((m) => m.id !== fallbackMed.id)]);
      return { medication: fallbackMed, tablePending: true };
    }
    throw err;
  }
}

export async function updatePatientMedication(input: {
  patientId?: string;
  medicationId: string;
  action: 'cease' | 'renew' | 'update';
  ceasedReason?: string;
  dose?: string;
  frequency?: string;
  directions?: string;
  repeats?: number;
  isPbs?: boolean;
  notes?: string;
}): Promise<PatientMedication> {
  // If local ID, update local storage directly
  if (input.medicationId.startsWith('local_') && input.patientId) {
    const current = getLocalMedications(input.patientId);
    const updated = current.map((m) => {
      if (m.id !== input.medicationId) return m;
      return {
        ...m,
        status: input.action === 'cease' ? ('ceased' as const) : ('active' as const),
        ceased_at: input.action === 'cease' ? new Date().toISOString() : null,
        ceased_reason: input.ceasedReason || null,
        updated_at: new Date().toISOString(),
      };
    });
    saveLocalMedications(input.patientId, updated);
    return updated.find((m) => m.id === input.medicationId)!;
  }

  const token = await getClinicianAccessToken();
  const response = await fetch('/api/patient-profile?action=medications', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(input),
  });
  const body = (await response.json().catch(() => ({}))) as {
    medication?: PatientMedication;
    message?: string;
    error?: string;
  };
  if (!response.ok || !body.medication) throw new Error(body.error ?? 'Unable to update medication.');
  return body.medication;
}

export async function deletePatientMedication(medicationId: string, patientId?: string): Promise<void> {
  if (medicationId.startsWith('local_') && patientId) {
    const current = getLocalMedications(patientId);
    saveLocalMedications(patientId, current.filter((m) => m.id !== medicationId));
    return;
  }

  const token = await getClinicianAccessToken();
  const response = await fetch('/api/patient-profile?action=medications', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ medicationId }),
  });
  const body = (await response.json().catch(() => ({}))) as {
    error?: string;
  };
  if (!response.ok) throw new Error(body.error ?? 'Unable to remove medication.');
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
  const body = await response.json().catch(() => ({ error: 'The secure invitation service is temporarily unavailable. Please try again.' })) as { invitationUrl?: string; appointmentId?: string; emailSent?: boolean; emailWarning?: string; error?: string };
  if (!response.ok || !body.invitationUrl) throw new Error(body.error ?? 'Unable to create the patient link.');
  return { invitationUrl: body.invitationUrl, appointmentId: body.appointmentId ?? '', emailSent: body.emailSent === true, emailWarning: body.emailWarning };
}

export type BookingAvailabilityDay = { day: number; enabled: boolean; start: string; end: string };
export type ClinicianBookingSettings = { booking_token: string; bookingUrl: string; timezone: string; duration_minutes: number; weekly_availability: BookingAvailabilityDay[]; booking_enabled: boolean; booking_reason: string };
export type PublicBookingProfile = { clinicianName: string; professionalTitle: string; aboutMe: string; photoUrl: string; clinicName: string; clinicBannerUrl?: string | null; clinicBannerText?: string | null; timezone: string; durationMinutes: number; bookingReason: string };

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
export async function bookPublicAppointment(input: { bookingToken: string; patientName: string; patientEmail: string; reason: string; patientNote?: string; startsAt: string }) {
  return bookingRequest<{ emailSent: boolean; emailWarning?: string; startsAt: string }>('/api/clinician-invitations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'public-book', ...input }) });
}

export async function createReplacementPatientInvitation(appointmentId: string, options: { sendEmail?: boolean } = {}) {
  const token = await getClinicianAccessToken();
  const response = await fetch('/api/appointment-patient-link', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ appointmentId, sendEmail: options.sendEmail !== false }),
  });
  const body = await response.json().catch(() => ({ error: 'The secure invitation service is temporarily unavailable.' })) as { invitationUrl?: string; emailSent?: boolean; emailWarning?: string; error?: string };
  if (!response.ok || !body.invitationUrl) throw new Error(body.error ?? 'Unable to create a replacement patient link.');
  return { invitationUrl: body.invitationUrl, emailSent: body.emailSent === true, emailWarning: body.emailWarning };
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

/** Remove a patient and all their linked appointment records and measurements. */
export async function deletePatient(patientId: string, email?: string): Promise<void> {
  const token = await getClinicianAccessToken();
  const response = await fetch('/api/appointment-patient-link', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ deletePatient: true, patientId, email }),
  });
  const body = (await response.json().catch(() => ({ error: 'The patient service is temporarily unavailable.' }))) as { error?: string };
  if (!response.ok) throw new Error(body.error ?? 'Unable to remove the patient.');
}

export async function fetchPatientInvitation(token: string) {
  const response = await fetch(`/api/patient-invitations?token=${encodeURIComponent(token)}`);
  const body = await response.json().catch(() => ({ error: 'The secure invitation service is temporarily unavailable. Please try again.' })) as {
    appointmentId?: string; clinicianName?: string; patientName?: string; reason?: string; startsAt?: string; error?: string;
  };
  if (!response.ok || !body.appointmentId) throw new Error(body.error ?? 'This patient link is no longer available.');
  return body as Required<Omit<typeof body, 'error'>>;
}

/** Records the patient's affirmative consent immediately before a protected call. */
export async function recordPatientAppointmentConsent(appointmentId: string, invitationToken: string) {
  const response = await fetch('/api/clinician-invitations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'patient-consent', appointmentId, invitationToken }),
  });
  const body = await response.json().catch(() => ({ error: 'The consent service is temporarily unavailable.' })) as { error?: string };
  if (!response.ok) throw new Error(body.error ?? 'Unable to record consent for this appointment.');
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

export type GoogleSyncDiagnostic = {
  success: boolean;
  step?: string;
  message?: string;
  email?: string;
  calendarList?: { status: number; count?: number; error?: unknown };
  freeBusy?: { status: number; details?: unknown };
  createEvent?: { status: number; details?: unknown };
  error?: string;
};

export async function testGoogleCalendarSync(): Promise<GoogleSyncDiagnostic> {
  const token = await getClinicianAccessToken();
  const response = await fetch('/api/google-calendar?action=test-sync', {
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.json();
}

export async function getAppointmentReviewStatus(appointmentId: string): Promise<{ needsReview: boolean; reviewedAt: string | null }> {
  try {
    const raw = localStorage.getItem(`ventricura_review_override_${appointmentId}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (typeof parsed?.needsReview === 'boolean') {
        return { needsReview: parsed.needsReview, reviewedAt: parsed.reviewedAt ?? null };
      }
    }
  } catch {}

  try {
    const token = await getClinicianAccessToken();
    const response = await fetch(`/api/appointment-review?appointmentId=${encodeURIComponent(appointmentId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (response.ok) {
      const body = await response.json();
      return { needsReview: Boolean(body.needsReview), reviewedAt: body.reviewedAt ?? null };
    }
  } catch {}

  return { needsReview: false, reviewedAt: null };
}

export async function updateAppointmentReviewStatus(appointmentId: string, needsReview: boolean): Promise<void> {
  const reviewedAt = needsReview ? null : new Date().toISOString();

  // 1. Immediately store in localStorage so UI is instantaneous across tabs
  try {
    localStorage.setItem(
      `ventricura_review_override_${appointmentId}`,
      JSON.stringify({ needsReview, reviewedAt, updatedAt: Date.now() })
    );
  } catch {}

  // Broadcast event in window
  try {
    window.dispatchEvent(new CustomEvent('ventricura:review-updated', { detail: { appointmentId, needsReview, reviewedAt } }));
  } catch {}

  // 2. Persist to API
  try {
    const token = await getClinicianAccessToken();
    await fetch('/api/appointment-review', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ appointmentId, needsReview }),
    });
  } catch (err) {
    console.warn('[updateAppointmentReviewStatus] API update failed, cached locally:', err);
  }

  // 3. Also attempt direct Supabase update if user session has direct access
  if (supabase) {
    try {
      await supabase
        .from('appointments')
        .update({ needs_review: needsReview, reviewed_at: reviewedAt })
        .eq('id', appointmentId);
    } catch {}
  }
}

