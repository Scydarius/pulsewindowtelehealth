import { createClient } from '@supabase/supabase-js';

type RequestBody = { email?: string; displayName?: string };

function database() {
  const url = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error('The clinical database is not configured.');
  return createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function requireAdministrator(request: Request) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) throw new Error('Sign in is required.');
  const db = database();
  const { data: userData, error: userError } = await db.auth.getUser(token);
  if (userError || !userData.user) throw new Error('Your sign-in session is invalid.');
  const { data: profile, error: profileError } = await db
    .from('clinician_profiles')
    .select('id, is_admin')
    .eq('id', userData.user.id)
    .maybeSingle();
  if (profileError || !profile?.is_admin) throw new Error('Administrator access is required to add clinicians.');
  return db;
}

export default {
  async fetch(request: Request) {
    if (request.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 });
    try {
      const { email, displayName } = await request.json() as RequestBody;
      if (!email?.trim() || !displayName?.trim()) return Response.json({ error: 'Clinician name and work email are required.' }, { status: 400 });
      const db = await requireAdministrator(request);
      const { data: invitation, error: invitationError } = await db.auth.admin.inviteUserByEmail(email.trim().toLowerCase(), {
        redirectTo: `${new URL(request.url).origin}/clinician/sign-in`,
      });
      if (invitationError || !invitation.user) throw new Error(invitationError?.message ?? 'Unable to invite this clinician.');
      const { error: profileError } = await db.from('clinician_profiles').upsert({
        id: invitation.user.id,
        display_name: displayName.trim(),
      }, { onConflict: 'id' });
      if (profileError) throw new Error('The clinician was invited, but their workspace could not be prepared.');
      return Response.json({ message: `Invitation sent to ${email.trim().toLowerCase()}.` }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
      return Response.json({ error: error instanceof Error ? error.message : 'Unable to add clinician.' }, { status: 400 });
    }
  },
};
