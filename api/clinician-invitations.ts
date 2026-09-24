import { createClient } from '@supabase/supabase-js';

type RequestBody = { patientName?: string; patientEmail?: string; reason?: string; startsAt?: string };

const encoder = new TextEncoder();
const database = () => {
  const url = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error('The clinical database is not configured.');
  return createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
};
const tokenHash = async (token: string) => {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
};
const newOpaqueToken = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, '0')).join('');
async function requireClinician(request: Request) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) throw new Error('Sign in is required.');
  const db = database();
  const { data: userData, error: userError } = await db.auth.getUser(token);
  if (userError || !userData.user) throw new Error('Your sign-in session is invalid.');
  const { data: clinician, error } = await db.from('clinician_profiles').select('id').eq('id', userData.user.id).maybeSingle();
  if (error || !clinician) throw new Error('This account is not an authorised clinician.');
  return { db, clinician };
}

export default {
  async fetch(request: Request) {
    if (request.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 });
    try {
      const body = await request.json() as RequestBody;
      if (!body.patientName?.trim() || !body.patientEmail?.trim() || !body.reason?.trim() || !body.startsAt) {
        return Response.json({ error: 'Patient name, email, appointment reason and time are required.' }, { status: 400 });
      }
      const startsAt = new Date(body.startsAt);
      if (Number.isNaN(startsAt.valueOf())) return Response.json({ error: 'Appointment time is invalid.' }, { status: 400 });
      const { db, clinician } = await requireClinician(request);
      const { data: patient, error: patientError } = await db.from('patients').insert({
        clinician_id: clinician.id, display_name: body.patientName.trim(), email: body.patientEmail.trim().toLowerCase(),
      }).select('id').single();
      if (patientError || !patient) throw new Error('Could not save the patient record.');
      const roomName = `pw-${newOpaqueToken().slice(0, 24)}`;
      const { data: appointment, error: appointmentError } = await db.from('appointments').insert({
        clinician_id: clinician.id, patient_id: patient.id, room_name: roomName, reason: body.reason.trim(), starts_at: startsAt.toISOString(),
      }).select('id').single();
      if (appointmentError || !appointment) throw new Error('Could not create the appointment.');
      const token = newOpaqueToken();
      const { error: inviteError } = await db.from('patient_invites').insert({
        appointment_id: appointment.id, token_hash: await tokenHash(token),
        expires_at: new Date(startsAt.valueOf() + 24 * 60 * 60 * 1000).toISOString(),
      });
      if (inviteError) throw new Error('Could not create the patient link.');
      return Response.json({ invitationUrl: `${new URL(request.url).origin}/join?token=${encodeURIComponent(token)}` }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
      return Response.json({ error: error instanceof Error ? error.message : 'Unable to create patient link.' }, { status: 400 });
    }
  },
};
