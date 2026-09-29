import { requireClinician } from './clinic';

/**
 * Authoritative server-side check for the clinician UI. A Supabase password
 * session is deliberately insufficient: the user must also have a record in
 * clinician_profiles, which is only created by an authorised administrator.
 */
export default {
  async fetch(request: Request) {
    if (request.method !== 'GET') return Response.json({ error: 'Method not allowed' }, { status: 405 });
    try {
      const { db, clinician } = await requireClinician(request);
      const { data: profile, error } = await db
        .from('clinician_profiles')
        .select('display_name, is_admin')
        .eq('id', clinician.id)
        .single();
      if (error || !profile) throw new Error('This account is not an authorised clinician.');
      return Response.json({ clinician: { id: clinician.id, displayName: profile.display_name, isAdmin: profile.is_admin === true } }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
      return Response.json({ error: error instanceof Error ? error.message : 'Clinician access could not be verified.' }, { status: 403 });
    }
  },
};
