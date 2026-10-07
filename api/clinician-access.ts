// Vercel runs the compiled API as native ESM, which requires the output extension.
import { requireClinician } from '../lib/clinic.js';

/**
 * Authoritative server-side check for the clinician UI. A Supabase password
 * session is deliberately insufficient: the user must also have a record in
 * clinician_profiles, which is only created by an authorised administrator.
 */
type VercelRequest = {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
};

type VercelResponse = {
  status: (code: number) => { json: (body: unknown) => void };
};

/** Vercel Node function: convert its request shape for the shared auth helper. */
export default async function clinicianAccess(request: VercelRequest, response: VercelResponse) {
  if (request.method !== 'GET') return response.status(405).json({ error: 'Method not allowed' });
  try {
    const authorization = request.headers.authorization;
    const headers = new Headers();
    if (authorization) headers.set('authorization', Array.isArray(authorization) ? authorization[0] : authorization);
    const authRequest = new Request('https://ventricura.internal/api/clinician-access', { headers });
    const { db, clinician } = await requireClinician(authRequest);
    const { data: profile, error } = await db
      .from('clinician_profiles')
      .select('display_name, is_admin, is_platform_admin, clinic_id')
      .eq('id', clinician.id)
      .single();
    if (error || !profile) throw new Error('This account is not an authorised clinician.');
    return response.status(200).json({ clinician: { id: clinician.id, displayName: profile.display_name, isAdmin: profile.is_admin === true, isPlatformAdmin: profile.is_platform_admin === true, clinicId: profile.clinic_id ?? null } });
  } catch (error) {
    return response.status(403).json({ error: error instanceof Error ? error.message : 'Clinician access could not be verified.' });
  }
}
