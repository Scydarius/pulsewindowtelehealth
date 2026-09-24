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

export default {
  async fetch(request: Request) {
    const token = new URL(request.url).searchParams.get('token');
    if (!token || token.length < 32) return Response.json({ error: 'Invalid patient link.' }, { status: 400 });
    try {
      const db = database();
      const { data: invite } = await db.from('patient_invites').select('appointment_id, expires_at, revoked_at').eq('token_hash', await tokenHash(token)).maybeSingle();
      if (!invite || invite.revoked_at || new Date(invite.expires_at) <= new Date()) return Response.json({ error: 'This patient link has expired or was revoked.' }, { status: 410 });
      const { data: appointment } = await db.from('appointments').select('id, reason, starts_at, clinician:clinician_profiles(display_name)').eq('id', invite.appointment_id).single();
      if (!appointment) return Response.json({ error: 'Appointment not found.' }, { status: 404 });
      const clinician = appointment.clinician as unknown as { display_name: string } | null;
      return Response.json({ appointmentId: appointment.id, reason: appointment.reason, startsAt: appointment.starts_at, clinicianName: clinician?.display_name ?? 'Your clinician' }, { headers: { 'Cache-Control': 'no-store' } });
    } catch {
      return Response.json({ error: 'Unable to open this patient link.' }, { status: 500 });
    }
  },
};
