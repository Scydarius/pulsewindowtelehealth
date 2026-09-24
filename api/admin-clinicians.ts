import { createClient } from '@supabase/supabase-js';

type CreateBody = { email?: string; displayName?: string };
type ManageBody = { action?: 'update' | 'reset_password' | 'repair'; clinicianId?: string; displayName?: string; isAdmin?: boolean };

const appUrl = (request: Request, path: string) => `${(process.env.APP_URL || new URL(request.url).origin).replace(/\/$/, '')}${path}`;
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
  const { data: profile, error: profileError } = await db.from('clinician_profiles').select('id, is_admin').eq('id', userData.user.id).maybeSingle();
  if (profileError || !profile?.is_admin) throw new Error('Administrator access is required to manage clinicians.');
  return { db, administratorId: userData.user.id };
}
async function findUser(db: ReturnType<typeof database>, clinicianId: string) {
  const { data, error } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw new Error('Unable to load clinician accounts.');
  return data.users.find((user) => user.id === clinicianId);
}

export default {
  async fetch(request: Request) {
    try {
      const { db, administratorId } = await requireAdministrator(request);
      if (request.method === 'GET') {
        const [{ data: profiles, error: profileError }, { data: users, error: userError }] = await Promise.all([
          db.from('clinician_profiles').select('id, display_name, is_admin, created_at').order('created_at', { ascending: true }),
          db.auth.admin.listUsers({ page: 1, perPage: 1000 }),
        ]);
        if (profileError || userError) throw new Error('Unable to load clinician accounts.');
        const emails = new Map(users.users.map((user) => [user.id, user.email ?? '']));
        return Response.json({ clinicians: (profiles ?? []).map((profile) => ({ ...profile, email: emails.get(profile.id) ?? '' })) }, { headers: { 'Cache-Control': 'no-store' } });
      }
      if (request.method === 'POST') {
        const { email, displayName } = await request.json() as CreateBody;
        if (!email?.trim() || !displayName?.trim()) throw new Error('Clinician name and work email are required.');
        const clinicianEmail = email.trim().toLowerCase();
        const { data: invitation, error: invitationError } = await db.auth.admin.inviteUserByEmail(clinicianEmail, { redirectTo: appUrl(request, '/clinician/activate') });
        if (invitationError?.message.toLowerCase().includes('already')) {
          const { data: users, error: usersError } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
          const existingUser = users?.users.find((user) => user.email?.toLowerCase() === clinicianEmail);
          if (usersError || !existingUser) throw new Error('This email is already registered, but its account could not be found.');
          const { error: profileError } = await db.from('clinician_profiles').upsert({ id: existingUser.id, display_name: displayName.trim() }, { onConflict: 'id' });
          if (profileError) throw new Error('The existing account could not be added to the clinician workspace.');
          const { error: resetError } = await db.auth.resetPasswordForEmail(clinicianEmail, { redirectTo: appUrl(request, '/clinician/reset-password') });
          return Response.json({ message: resetError ? `Existing account added. Ask ${clinicianEmail} to use Forgot password.` : `Existing account added and password setup email sent to ${clinicianEmail}.` });
        }
        if (invitationError || !invitation.user) throw new Error(invitationError?.message ?? 'Unable to invite this clinician.');
        const { error: profileError } = await db.from('clinician_profiles').upsert({ id: invitation.user.id, display_name: displayName.trim() }, { onConflict: 'id' });
        if (profileError) throw new Error('The clinician was invited, but their workspace could not be prepared.');
        return Response.json({ message: `Invitation sent to ${clinicianEmail}.` });
      }
      if (request.method !== 'PATCH') return Response.json({ error: 'Method not allowed' }, { status: 405 });
      const body = await request.json() as ManageBody;
      if (!body.action || !body.clinicianId) throw new Error('Clinician and action are required.');
      const user = await findUser(db, body.clinicianId);
      if (!user?.email) throw new Error('This clinician account could not be found.');
      if (body.action === 'update') {
        if (!body.displayName?.trim() || typeof body.isAdmin !== 'boolean') throw new Error('Name and administrator status are required.');
        if (body.clinicianId === administratorId && !body.isAdmin) throw new Error('You cannot remove your own administrator access.');
        const { error } = await db.from('clinician_profiles').update({ display_name: body.displayName.trim(), is_admin: body.isAdmin }).eq('id', body.clinicianId);
        if (error) throw new Error('Unable to update the clinician.');
        return Response.json({ message: 'Clinician access updated.' });
      }
      if (body.action === 'reset_password') {
        const { error } = await db.auth.resetPasswordForEmail(user.email, { redirectTo: appUrl(request, '/clinician/reset-password') });
        if (error) throw new Error(error.message);
        return Response.json({ message: `Password-reset email sent to ${user.email}.` });
      }
      if (body.action === 'repair') {
        if (body.clinicianId === administratorId) throw new Error('You cannot repair the account currently being used to administer the clinic.');
        const { count, error: appointmentError } = await db.from('appointments').select('id', { count: 'exact', head: true }).eq('clinician_id', body.clinicianId);
        if (appointmentError) throw new Error('Unable to check clinician appointments.');
        if (count) throw new Error('This clinician has appointments, so their account cannot be repaired automatically.');
        const { error: deleteError } = await db.auth.admin.deleteUser(body.clinicianId);
        if (deleteError) throw new Error('Unable to remove the broken account.');
        const { data: invitation, error: invitationError } = await db.auth.admin.inviteUserByEmail(user.email, { redirectTo: appUrl(request, '/clinician/activate') });
        if (invitationError || !invitation.user) throw new Error(invitationError?.message ?? 'Unable to create a fresh invitation.');
        const { error: profileError } = await db.from('clinician_profiles').upsert({ id: invitation.user.id, display_name: body.displayName?.trim() || user.email.split('@')[0] }, { onConflict: 'id' });
        if (profileError) throw new Error('The new clinician workspace could not be prepared.');
        return Response.json({ message: `Broken account removed and a fresh activation email sent to ${user.email}.` });
      }
      throw new Error('Unknown clinician action.');
    } catch (error) {
      return Response.json({ error: error instanceof Error ? error.message : 'Unable to manage clinician.' }, { status: 400 });
    }
  },
};
