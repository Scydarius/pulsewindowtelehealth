import { supabase } from './supabase';

export type ClinicianProfile = {
  id: string;
  display_name: string;
  clinic_id?: string | null;
  clinic_name?: string | null;
  clinic_slug?: string | null;
};
export type ClinicAppointment = {
  id: string;
  room_name: string;
  reason: string;
  starts_at: string;
  needs_review?: boolean | null;
  reviewed_at?: string | null;
  patient: { id: string; display_name: string; email: string } | null;
  latestMeasurement: { measured_at: string; heart_rate_bpm: number; respiratory_rate_bpm: number; signal_quality: number } | null;
};

export function isAppointmentNeedingReview(appointment: {
  id: string;
  needs_review?: boolean | null;
  reviewed_at?: string | null;
  latestMeasurement?: unknown;
}): boolean {
  try {
    const raw = localStorage.getItem(`ventricura_review_override_${appointment.id}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (typeof parsed?.needsReview === 'boolean') {
        return parsed.needsReview;
      }
    }
  } catch {}

  if (appointment.needs_review === true) return true;
  if (appointment.reviewed_at) return false;
  if (appointment.needs_review === false && appointment.reviewed_at !== undefined) return false;
  if (appointment.latestMeasurement) return true;
  return false;
}

export async function loadClinicianWorkspace() {
  if (!supabase) throw new Error('The clinical database is not configured.');
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Please sign in to open the clinician workspace.');

  let profileData: ClinicianProfile | null = null;
  const { data: profileWithClinic, error: clinicError } = await supabase
    .from('clinician_profiles')
    .select('id, display_name, clinic_id, clinic:clinics(id, name, slug)')
    .eq('id', user.id)
    .maybeSingle();

  if (!clinicError && profileWithClinic) {
    const clinic = profileWithClinic.clinic as { id?: string; name?: string; slug?: string } | null;
    profileData = {
      id: profileWithClinic.id,
      display_name: profileWithClinic.display_name,
      clinic_id: profileWithClinic.clinic_id ?? clinic?.id ?? null,
      clinic_name: clinic?.name ?? null,
      clinic_slug: clinic?.slug ?? null,
    };
  } else {
    const { data: profileBasic, error: basicError } = await supabase
      .from('clinician_profiles')
      .select('id, display_name')
      .eq('id', user.id)
      .maybeSingle();
    if (basicError || !profileBasic) throw new Error('This account is not an authorised clinician.');
    profileData = {
      id: profileBasic.id,
      display_name: profileBasic.display_name,
    };
  }

  const profile = profileData;

  const appointmentsResult = await supabase
    .from('appointments')
    .select('id, room_name, reason, starts_at, needs_review, reviewed_at, patient:patients(id, display_name, email)')
    .eq('clinician_id', user.id)
    .order('starts_at', { ascending: true });

  let rawAppointments = appointmentsResult.data as unknown[] | null;

  if (appointmentsResult.error) {
    const fallbackResult = await supabase
      .from('appointments')
      .select('id, room_name, reason, starts_at, patient:patients(id, display_name, email)')
      .eq('clinician_id', user.id)
      .order('starts_at', { ascending: true });
    if (fallbackResult.error) throw new Error('Unable to load appointments.');
    rawAppointments = fallbackResult.data as unknown[] | null;
  }

  const appointmentRows = (rawAppointments ?? []) as unknown as Omit<ClinicAppointment, 'latestMeasurement'>[];
  const appointmentIds = appointmentRows.map((appointment) => appointment.id);
  const latestMeasurements = new Map<string, ClinicAppointment['latestMeasurement']>();
  if (appointmentIds.length) {
    const { data: measurements } = await supabase
      .from('measurements')
      .select('appointment_id, measured_at, heart_rate_bpm, respiratory_rate_bpm, signal_quality')
      .in('appointment_id', appointmentIds)
      .order('measured_at', { ascending: false });
    for (const measurement of measurements ?? []) {
      if (!latestMeasurements.has(measurement.appointment_id)) latestMeasurements.set(measurement.appointment_id, measurement);
    }
  }

  return { profile: profile as ClinicianProfile, appointments: appointmentRows.map((appointment) => ({ ...appointment, latestMeasurement: latestMeasurements.get(appointment.id) ?? null })) };
}

export type ConsultationDetails = {
  clinicianName: string;
  patientName: string;
  patientId?: string;
  patientEmail?: string;
  reason: string;
  startsAt: string;
  needsReview?: boolean;
  reviewedAt?: string | null;
};

export async function loadConsultationDetails(appointmentId: string): Promise<ConsultationDetails | null> {
  if (!supabase) return null;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('clinician_profiles')
    .select('id, display_name')
    .eq('id', user.id)
    .maybeSingle();

  const apptResult = await supabase
    .from('appointments')
    .select('id, reason, starts_at, needs_review, reviewed_at, patient:patients(id, display_name, email)')
    .eq('id', appointmentId)
    .maybeSingle();

  let appointment = apptResult.data as {
    id: string;
    reason?: string;
    starts_at?: string;
    needs_review?: boolean;
    reviewed_at?: string | null;
    patient?: unknown;
  } | null;

  if (apptResult.error) {
    const fallback = await supabase
      .from('appointments')
      .select('id, reason, starts_at, patient:patients(id, display_name, email)')
      .eq('id', appointmentId)
      .maybeSingle();
    appointment = fallback.data as typeof appointment;
  }

  if (!appointment) return null;
  const patient = appointment.patient as unknown as { id: string; display_name: string; email: string } | null;

  return {
    clinicianName: profile?.display_name ?? 'Clinician',
    patientName: patient?.display_name ?? 'Patient',
    patientId: patient?.id,
    patientEmail: patient?.email,
    reason: appointment.reason ?? '',
    startsAt: appointment.starts_at ?? '',
    needsReview: Boolean(appointment.needs_review),
    reviewedAt: appointment.reviewed_at ?? null,
  };
}
