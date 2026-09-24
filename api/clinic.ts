import { createClient } from '@supabase/supabase-js';
import { createHash, randomBytes } from 'node:crypto';

export function database() {
  const url = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error('Clinical database is not configured.');
  return createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

export function tokenHash(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export function newOpaqueToken() {
  return randomBytes(32).toString('base64url');
}

export async function requireClinician(request: Request) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) throw new Error('Sign in is required.');
  const db = database();
  const { data: userData, error: userError } = await db.auth.getUser(token);
  if (userError || !userData.user) throw new Error('Your sign-in session is invalid.');
  const { data: clinician, error: clinicianError } = await db.from('clinician_profiles').select('id, display_name').eq('id', userData.user.id).maybeSingle();
  if (clinicianError || !clinician) throw new Error('This account is not an authorised clinician.');
  return { db, clinician };
}
