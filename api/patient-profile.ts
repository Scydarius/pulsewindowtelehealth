import { createClient } from '@supabase/supabase-js';

const database = () => {
  const url = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error('The clinical database is not configured.');
  return createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
};
export default {
  async fetch(request: Request) {
    if (request.method !== 'GET') return Response.json({ error: 'Method not allowed' }, { status: 405 });
    try {
      const email = new URL(request.url).searchParams.get('email')?.trim().toLowerCase();
      const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
      if (!email || !token) throw new Error('A clinician sign-in and patient email are required.');
      const db = database();
      const { data: userData, error: userError } = await db.auth.getUser(token);
      if (userError || !userData.user) throw new Error('Your sign-in session is invalid.');
      const { data: clinician } = await db.from('clinician_profiles').select('id').eq('id', userData.user.id).maybeSingle();
      if (!clinician) throw new Error('This account is not an authorised clinician.');
      const { data: patients, error: patientError } = await db.from('patients').select('id, display_name, email, created_at').eq('clinician_id', clinician.id).eq('email', email).order('created_at', { ascending: true });
      if (patientError || !patients?.length) throw new Error('This patient profile could not be found.');
      const patientIds = patients.map((patient) => patient.id);
      const { data: appointments, error: appointmentError } = await db.from('appointments').select('id, patient_id, reason, starts_at, created_at').eq('clinician_id', clinician.id).in('patient_id', patientIds).order('starts_at', { ascending: false });
      if (appointmentError) throw new Error('Unable to load appointment history.');
      const appointmentIds = (appointments ?? []).map((appointment) => appointment.id);
      const { data: measurements, error: measurementError } = appointmentIds.length
        ? await db.from('measurements').select('appointment_id, measured_at, heart_rate_bpm, respiratory_rate_bpm, signal_quality, algorithm_version, diagnostics').in('appointment_id', appointmentIds).order('measured_at', { ascending: true })
        : { data: [], error: null };
      if (measurementError) throw new Error('Unable to load measurement history.');
      const samplesByAppointment = new Map<string, typeof measurements>();
      for (const measurement of measurements ?? []) {
        const samples = samplesByAppointment.get(measurement.appointment_id) ?? [];
        samples.push(measurement);
        samplesByAppointment.set(measurement.appointment_id, samples);
      }
      const history = (appointments ?? []).map((appointment) => {
        const samples = samplesByAppointment.get(appointment.id) ?? [];
        return { id: appointment.id, reason: appointment.reason, starts_at: appointment.starts_at, created_at: appointment.created_at, measurements: samples };
      });
      return Response.json({ patient: { email, display_name: patients.at(-1)?.display_name ?? 'Patient', appointments: history } }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
      return Response.json({ error: error instanceof Error ? error.message : 'Unable to load the patient profile.' }, { status: 400 });
    }
  },
};
