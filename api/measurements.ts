import { createClient } from '@supabase/supabase-js';

type MeasurementBody = {
  appointmentId?: string;
  invitationToken?: string;
  heartRateBpm?: number;
  respiratoryRateBpm?: number;
  signalQuality?: number;
  algorithmVersion?: string;
};

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
async function requireClinician(request: Request, appointmentId: string) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) throw new Error('Sign in is required.');
  const db = database();
  const { data: userData, error: userError } = await db.auth.getUser(token);
  if (userError || !userData.user) throw new Error('Your sign-in session is invalid.');
  const { data: appointment } = await db.from('appointments').select('id').eq('id', appointmentId).eq('clinician_id', userData.user.id).maybeSingle();
  if (!appointment) throw new Error('You are not authorised for this appointment.');
  return db;
}

export default {
  async fetch(request: Request) {
    try {
      if (request.method === 'GET') {
        const appointmentId = new URL(request.url).searchParams.get('appointmentId');
        if (!appointmentId) return Response.json({ error: 'Appointment is required.' }, { status: 400 });
        const db = await requireClinician(request, appointmentId);
        const { data, error } = await db.from('measurements').select('measured_at, heart_rate_bpm, respiratory_rate_bpm, signal_quality, algorithm_version').eq('appointment_id', appointmentId).order('measured_at', { ascending: false }).limit(30);
        if (error) throw new Error('Unable to load the patient measurement.');
        const measurements = (data ?? []).reverse();
        return Response.json({ measurement: measurements.at(-1) ?? null, measurements }, { headers: { 'Cache-Control': 'no-store' } });
      }
      if (request.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 });
      const body = await request.json() as MeasurementBody;
      const { appointmentId, invitationToken, heartRateBpm, respiratoryRateBpm, signalQuality, algorithmVersion } = body;
      if (!appointmentId || !invitationToken || invitationToken.length < 32) throw new Error('A valid patient link is required to save a measurement.');
      if (![heartRateBpm, respiratoryRateBpm, signalQuality].every(Number.isFinite)) throw new Error('A valid measurement is required.');
      if (heartRateBpm! < 25 || heartRateBpm! > 240 || respiratoryRateBpm! < 2 || respiratoryRateBpm! > 80 || signalQuality! < 0 || signalQuality! > 1) throw new Error('Measurement values were outside the permitted prototype range.');
      const db = database();
      const { data: invite } = await db.from('patient_invites').select('appointment_id, expires_at, revoked_at').eq('token_hash', await tokenHash(invitationToken)).maybeSingle();
      if (!invite || invite.appointment_id !== appointmentId || invite.revoked_at || new Date(invite.expires_at) <= new Date()) throw new Error('This patient link is not authorised to save a measurement.');
      const { error } = await db.from('measurements').insert({
        appointment_id: appointmentId,
        heart_rate_bpm: heartRateBpm,
        respiratory_rate_bpm: respiratoryRateBpm,
        signal_quality: signalQuality,
        algorithm_version: algorithmVersion ?? 'railway-rppg',
      });
      if (error) throw new Error('Unable to save the measurement.');
      return Response.json({ message: 'Measurement saved.' }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
      return Response.json({ error: error instanceof Error ? error.message : 'Unable to process measurement.' }, { status: 400 });
    }
  },
};
