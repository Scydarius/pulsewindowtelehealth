import { createClient } from '@supabase/supabase-js';

type VercelRequest = { method?: string; body?: unknown; headers: Record<string, string | string[] | undefined> };
type VercelResponse = { status: (code: number) => { json: (body: unknown) => void } };

function database() {
  const url = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error('The clinical database is not configured.');
  return createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

export default async function adminPatients(request: VercelRequest, response: VercelResponse) {
  try {
    const authorization = request.headers.authorization;
    const token = (Array.isArray(authorization) ? authorization[0] : authorization)?.replace(/^Bearer\s+/i, '');
    if (!token) throw new Error('Sign in is required.');
    const db = database();
    const { data: userData, error: userError } = await db.auth.getUser(token);
    if (userError || !userData.user) throw new Error('Your sign-in session is invalid.');
    const { data: administrator } = await db.from('clinician_profiles').select('is_admin').eq('id', userData.user.id).maybeSingle();
    if (!administrator?.is_admin) throw new Error('Administrator access is required to manage patients.');

    if (request.method === 'GET') {
      const [{ data: patients, error: patientError }, { data: appointments, error: appointmentError }] = await Promise.all([
        db.from('patients').select('id, display_name, email, clinician_id, created_at, clinician:clinician_profiles(display_name)').order('created_at', { ascending: false }),
        db.from('appointments').select('id, patient_id, starts_at'),
      ]);
      if (patientError || appointmentError) throw new Error('Unable to load patient records.');
      const appointmentCounts = new Map<string, number>();
      const latestAppointments = new Map<string, string>();
      for (const appointment of appointments ?? []) {
        appointmentCounts.set(appointment.patient_id, (appointmentCounts.get(appointment.patient_id) ?? 0) + 1);
        if (!latestAppointments.get(appointment.patient_id) || new Date(appointment.starts_at) > new Date(latestAppointments.get(appointment.patient_id)!)) latestAppointments.set(appointment.patient_id, appointment.starts_at);
      }
      return response.status(200).json({ patients: (patients ?? []).map((patient) => ({ ...patient, appointment_count: appointmentCounts.get(patient.id) ?? 0, latest_appointment_at: latestAppointments.get(patient.id) ?? null })) });
    }

    if (request.method !== 'DELETE') return response.status(405).json({ error: 'Method not allowed.' });
    const body = (typeof request.body === 'string' ? JSON.parse(request.body) : request.body ?? {}) as { patientId?: string };
    if (!body.patientId) return response.status(400).json({ error: 'Patient is required.' });
    const { data: appointments, error: appointmentError } = await db.from('appointments').select('id').eq('patient_id', body.patientId);
    if (appointmentError) throw new Error('Unable to prepare the patient record for deletion.');
    const appointmentIds = (appointments ?? []).map((appointment) => appointment.id);
    if (appointmentIds.length) {
      const { error: measurementError } = await db.from('measurements').delete().in('appointment_id', appointmentIds);
      if (measurementError) throw new Error('Unable to remove the patient’s saved readings.');
      const { error: appointmentDeleteError } = await db.from('appointments').delete().in('id', appointmentIds);
      if (appointmentDeleteError) throw new Error('Unable to remove the patient’s appointments.');
    }
    const { error: patientDeleteError } = await db.from('patients').delete().eq('id', body.patientId);
    if (patientDeleteError) throw new Error('Unable to remove the patient record.');
    return response.status(200).json({ message: 'Patient and linked appointment records removed.' });
  } catch (error) {
    return response.status(400).json({ error: error instanceof Error ? error.message : 'Unable to manage patients.' });
  }
}
