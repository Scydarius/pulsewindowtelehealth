import { createClient } from '@supabase/supabase-js';

function database() {
  const url = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error('The clinical database is not configured.');
  return createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

export default {
  async fetch(request: Request) {
    if (request.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 });
    try {
      const allowedEmail = process.env.PULSEWINDOW_INITIAL_ADMIN_EMAIL?.trim().toLowerCase();
      if (!allowedEmail) throw new Error('Initial administrator setup has not been configured.');
      const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
      if (!token) throw new Error('Sign in is required.');
      const db = database();
      const { data: userData, error: userError } = await db.auth.getUser(token);
      const user = userData.user;
      if (userError || !user?.email) throw new Error('Your sign-in session is invalid.');
      if (user.email.toLowerCase() !== allowedEmail) throw new Error('This signed-in email is not approved for initial administrator setup.');
      const { error: profileError } = await db.from('clinician_profiles').upsert({
        id: user.id,
        display_name: user.user_metadata?.full_name?.trim() || user.email.split('@')[0],
        is_admin: true,
      }, { onConflict: 'id' });
      if (profileError) throw new Error('Unable to create administrator access.');
      return Response.json({ message: 'Administrator access is ready.' }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
      return Response.json({ error: error instanceof Error ? error.message : 'Unable to complete administrator setup.' }, { status: 400 });
    }
  },
};
