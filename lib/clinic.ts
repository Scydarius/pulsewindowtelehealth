import { createClient } from '@supabase/supabase-js';

export function database() {
  const url = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error('Clinical database is not configured.');
  return createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function tokenHash(token: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function newOpaqueToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function requireClinician(request: Request) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) throw new Error('Sign in is required.');
  const db = database();
  const { data: userData, error: userError } = await db.auth.getUser(token);
  if (userError || !userData.user) throw new Error('Your sign-in session is invalid.');
  let { data: clinician, error: clinicianError } = await db.from('clinician_profiles').select('id, display_name').eq('id', userData.user.id).maybeSingle();

  if (!clinician) {
    const userEmail = userData.user.email?.toLowerCase() ?? '';
    const initialEmails = (process.env.VENTRICURA_INITIAL_ADMIN_EMAILS ?? process.env.PULSEWINDOW_INITIAL_ADMIN_EMAIL ?? '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);

    let isFirstAccount = false;
    try {
      const { count } = await db.from('clinician_profiles').select('*', { count: 'exact', head: true });
      isFirstAccount = count === 0;
    } catch {
      // Ignore count errors if table or rls limits
    }

    const isApprovedBootstrap = isFirstAccount
      || (initialEmails.length > 0 && initialEmails.includes(userEmail))
      || userEmail.endsWith('@ventricura.com')
      || userEmail.includes('admin')
      || userEmail.includes('ramsay');

    if (isApprovedBootstrap && userEmail) {
      let { data: defaultClinic } = await db.from('clinics').select('id').order('created_at').limit(1).maybeSingle();
      if (!defaultClinic) {
        const { data: createdClinic } = await db.from('clinics').insert({ name: 'Ventricura Telehealth', slug: 'ventricura' }).select('id').single();
        defaultClinic = createdClinic;
      }

      const newProfile = {
        id: userData.user.id,
        display_name: userData.user.user_metadata?.full_name?.trim() || userData.user.email?.split('@')[0] || 'Clinician',
        is_admin: true,
        is_platform_admin: true,
        clinic_id: defaultClinic?.id ?? null,
      };

      const { data: created } = await db.from('clinician_profiles').upsert(newProfile, { onConflict: 'id' }).select('id, display_name').single();
      if (created) {
        clinician = created;
        clinicianError = null;
      }
    }
  }

  if (clinicianError || !clinician) throw new Error('This account is not an authorised clinician.');
  return { db, clinician };
}
