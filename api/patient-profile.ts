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
      const patientId = new URL(request.url).searchParams.get('patientId')?.trim();
      const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
      if (!patientId || !token) throw new Error('A clinician sign-in and patient record are required.');
      const db = database();
      const { data: userData, error: userError } = await db.auth.getUser(token);
      if (userError || !userData.user) throw new Error('Your sign-in session is invalid.');
      const { data: clinician } = await db
        .from('clinician_profiles')
        .select('id, clinic_id, is_admin, is_platform_admin')
        .eq('id', userData.user.id)
        .maybeSingle();
      if (!clinician) throw new Error('This account is not an authorised clinician.');

      const { data: patient, error: patientError } = await db
        .from('patients')
        .select('id, display_name, email, created_at, clinician_id, clinician:clinician_profiles(clinic_id)')
        .eq('id', patientId)
        .maybeSingle();
      if (patientError || !patient) throw new Error('This patient profile could not be found.');

      const patientClinicId = (patient.clinician as unknown as { clinic_id?: string | null } | null)?.clinic_id ?? null;
      const isAuthorised =
        clinician.is_platform_admin ||
        patient.clinician_id === clinician.id ||
        (Boolean(clinician.clinic_id) && clinician.clinic_id === patientClinicId);

      if (!isAuthorised) throw new Error('You do not have permission to view this patient profile.');

      const { data: appointments, error: appointmentError } = await db
        .from('appointments')
        .select('id, patient_id, reason, starts_at, created_at')
        .eq('patient_id', patient.id)
        .order('starts_at', { ascending: false });
      if (appointmentError) throw new Error('Unable to load appointment history.');

      const appointmentIds = (appointments ?? []).map((appointment) => appointment.id);
      const { data: measurements, error: measurementError } = appointmentIds.length
        ? await db.from('measurements').select('appointment_id, measured_at, heart_rate_bpm, respiratory_rate_bpm, signal_quality, algorithm_version, diagnostics').in('appointment_id', appointmentIds).order('measured_at', { ascending: true })
        : { data: [], error: null };
      if (measurementError) throw new Error('Unable to load measurement history.');

      let medications: unknown[] = [];
      try {
        const { data: medsData } = await db
          .from('patient_medications')
          .select('*')
          .eq('patient_id', patient.id)
          .order('status', { ascending: true })
          .order('prescribed_date', { ascending: false });
        if (medsData) medications = medsData;
      } catch {
        // graceful if table pending
      }

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
      return Response.json({
        patient: {
          id: patient.id,
          email: patient.email,
          display_name: patient.display_name,
          appointments: history,
          medications,
        }
      }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
      return Response.json({ error: error instanceof Error ? error.message : 'Unable to load the patient profile.' }, { status: 400 });
    }
  },
};
