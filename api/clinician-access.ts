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

const BANNER_TAG_REGEX = /<!-- CLINIC_BANNER:([\s\S]*?) -->/;

function decodeClinicBanner(
  about: string | null | undefined,
  existingUrl?: string | null,
  existingText?: string | null,
  existingEnabled?: boolean | null
): { url: string | null; text: string | null; enabled: boolean } {
  const match = (about || '').match(BANNER_TAG_REGEX);
  let tagUrl: string | null = null;
  let tagText: string | null = null;
  let tagEnabled = true;
  if (match) {
    try {
      const parsed = JSON.parse(match[1]);
      if (typeof parsed.u === 'string' && parsed.u.trim()) tagUrl = parsed.u.trim();
      if (typeof parsed.t === 'string' && parsed.t.trim()) tagText = parsed.t.trim();
      if (typeof parsed.e === 'boolean') tagEnabled = parsed.e;
    } catch {}
  }
  const url = existingUrl?.trim() || tagUrl || null;
  const text = existingText?.trim() || tagText || null;
  const enabled = existingEnabled !== undefined && existingEnabled !== null ? existingEnabled : tagEnabled;
  return { url, text, enabled };
}

/** Vercel Node function: convert its request shape for the shared auth helper. */
export default async function clinicianAccess(request: VercelRequest, response: VercelResponse) {
  if (request.method !== 'GET') return response.status(405).json({ error: 'Method not allowed' });
  try {
    const authorization = request.headers.authorization;
    const headers = new Headers();
    if (authorization) headers.set('authorization', Array.isArray(authorization) ? authorization[0] : authorization);
    const authRequest = new Request('https://ventricura.internal/api/clinician-access', { headers });
    const { db, clinician } = await requireClinician(authRequest);
    let { data: profile, error } = await db
      .from('clinician_profiles')
      .select('display_name, professional_title, about_me, is_admin, is_platform_admin, clinic_id, photo_url, clinic:clinics(id, name, slug, website_about, website_banner_url, website_banner_text, website_banner_enabled)')
      .eq('id', clinician.id)
      .maybeSingle();

    if (error && error.message?.includes('column')) {
      const fallback = await db
        .from('clinician_profiles')
        .select('display_name, professional_title, about_me, is_admin, is_platform_admin, clinic_id, photo_url, clinic:clinics(id, name, slug)')
        .eq('id', clinician.id)
        .maybeSingle();
      profile = fallback.data as typeof profile;
      error = fallback.error;
      if (error && error.message?.includes('column')) {
        const minFallback = await db
          .from('clinician_profiles')
          .select('display_name, is_admin')
          .eq('id', clinician.id)
          .maybeSingle();
        profile = minFallback.data as typeof profile;
        error = minFallback.error;
      }
    }

    if (error || !profile) throw new Error('This account is not an authorised clinician.');
    const clinicObj = (profile as unknown as { clinic?: { id?: string; name?: string; slug?: string; website_about?: string; website_banner_url?: string; website_banner_text?: string; website_banner_enabled?: boolean } | null })?.clinic;
    let banner = decodeClinicBanner(
      clinicObj?.website_about,
      clinicObj?.website_banner_url,
      clinicObj?.website_banner_text,
      clinicObj?.website_banner_enabled
    );
    if (!banner.url && (profile as unknown as { about_me?: string })?.about_me) {
      const profileBanner = decodeClinicBanner((profile as unknown as { about_me?: string }).about_me);
      if (profileBanner.url) banner = profileBanner;
    }

    return response.status(200).json({
      clinician: {
        id: clinician.id,
        displayName: profile.display_name,
        professionalTitle: (profile as unknown as { professional_title?: string | null })?.professional_title ?? null,
        isAdmin: profile.is_admin === true,
        isPlatformAdmin: profile.is_platform_admin === true,
        clinicId: profile.clinic_id ?? null,
        clinicName: clinicObj?.name ?? 'Ventricura Telehealth',
        clinicSlug: clinicObj?.slug ?? 'ventricura',
        clinicBannerUrl: banner.enabled ? banner.url : null,
        clinicBannerText: banner.enabled ? banner.text : null,
        photoUrl: profile.photo_url ?? null,
      },
    });
  } catch (error) {
    return response.status(403).json({ error: error instanceof Error ? error.message : 'Clinician access could not be verified.' });
  }
}
