import { supabase } from './supabase';

export type ClinicianProfile = { id: string; display_name: string };
export type ClinicAppointment = {
  id: string;
  room_name: string;
  reason: string;
  starts_at: string;
  patient: { display_name: string; email: string } | null;
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

  return { profile: profile as ClinicianProfile, appointments: (appointments ?? []) as unknown as ClinicAppointment[] };
}
