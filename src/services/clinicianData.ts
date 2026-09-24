import { supabase } from './supabase';

export type ClinicianProfile = { id: string; display_name: string };
export type ClinicAppointment = {
  id: string;
  room_name: string;
  reason: string;
  starts_at: string;
  patient: { display_name: string; email: string } | null;
  latestMeasurement: { measured_at: string; heart_rate_bpm: number; respiratory_rate_bpm: number; signal_quality: number } | null;
};

export async function loadClinicianWorkspace() {
  if (!supabase) throw new Error('The clinical database is not configured.');
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Please sign in to open the clinician workspace.');

  const { data: profile, error: profileError } = await supabase
    .from('clinician_profiles')
    .select('id, display_name')
    .eq('id', user.id)
    .maybeSingle();
  if (profileError || !profile) throw new Error('This account is not an authorised clinician.');

  const { data: appointments, error: appointmentError } = await supabase
    .from('appointments')
    .select('id, room_name, reason, starts_at, patient:patients(display_name, email)')
    .eq('clinician_id', user.id)
    .order('starts_at', { ascending: true });
  if (appointmentError) throw new Error('Unable to load appointments.');

  const appointmentRows = (appointments ?? []) as unknown as Omit<ClinicAppointment, 'latestMeasurement'>[];
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
