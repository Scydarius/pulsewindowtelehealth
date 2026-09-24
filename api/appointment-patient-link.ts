import { createClient } from '@supabase/supabase-js';

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
      const { appointmentId } = await request.json() as { appointmentId?: string };
      if (!appointmentId) return Response.json({ error: 'Appointment is required.' }, { status: 400 });
      const { db, clinician } = await requireClinician(request);
      const { data: appointment } = await db.from('appointments').select('id, starts_at').eq('id', appointmentId).eq('clinician_id', clinician.id).maybeSingle();
      if (!appointment) return Response.json({ error: 'You are not authorised for this appointment.' }, { status: 403 });
      await db.from('patient_invites').update({ revoked_at: new Date().toISOString() }).eq('appointment_id', appointment.id).is('revoked_at', null);
      const token = newOpaqueToken();
      const expiresAt = new Date(Math.max(new Date(appointment.starts_at).valueOf() + 24 * 60 * 60 * 1000, Date.now() + 24 * 60 * 60 * 1000));
      const { error: invitationError } = await db.from('patient_invites').insert({ appointment_id: appointment.id, token_hash: await tokenHash(token), expires_at: expiresAt.toISOString() });
      if (invitationError) throw new Error('Unable to create a replacement patient link.');
      return Response.json({ invitationUrl: `${new URL(request.url).origin}/join?token=${encodeURIComponent(token)}` }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
      return Response.json({ error: error instanceof Error ? error.message : 'Unable to create a replacement patient link.' }, { status: 400 });
    }
  },
};
