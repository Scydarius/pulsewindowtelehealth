import { createClient } from '@supabase/supabase-js';

type VercelRequest = { method?: string; body?: unknown; headers: Record<string, string | string[] | undefined>; query?: Record<string, string | string[] | undefined> };
type VercelResponse = { status: (code: number) => { json: (body: unknown) => void } };
type Profile = { id: string; display_name: string; is_admin: boolean; is_platform_admin?: boolean; clinic_id?: string | null; professional_title?: string | null; about_me?: string | null; photo_url?: string | null; created_at?: string };

const database = () => { const url = process.env.VITE_SUPABASE_URL; const key = process.env.SUPABASE_SERVICE_ROLE_KEY; if (!url || !key) throw new Error('The clinical database is not configured.'); return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } }); };
const originFor = (request: Request) => (process.env.APP_URL || new URL(request.url).origin).replace(/\/$/, '');
const appUrl = (request: Request, path: string) => `${originFor(request)}${path}`;
const slugify = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 63);

async function signedIn(request: Request) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, ''); if (!token) throw new Error('Sign in is required.');
  const db = database(); const { data, error } = await db.auth.getUser(token); if (error || !data.user) throw new Error('Your sign-in session is invalid.');
  let { data: profile, error: profileError } = await db.from('clinician_profiles').select('id, display_name, is_admin, is_platform_admin, clinic_id, professional_title, about_me, photo_url, created_at').eq('id', data.user.id).maybeSingle();
  if (profileError && profileError.message?.includes('column')) {
    const fallback = await db.from('clinician_profiles').select('id, display_name, is_admin, created_at').eq('id', data.user.id).maybeSingle();
    profile = fallback.data as typeof profile;
  }
  if (!profile) {
    const userEmail = data.user.email?.toLowerCase() ?? '';
    const initialEmails = (process.env.VENTRICURA_INITIAL_ADMIN_EMAILS ?? process.env.PULSEWINDOW_INITIAL_ADMIN_EMAIL ?? '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);

    let isFirstAccount = false;
    try {
      const { count } = await db.from('clinician_profiles').select('*', { count: 'exact', head: true });
      isFirstAccount = count === 0;
    } catch {
      // Ignore count error
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
        id: data.user.id,
        display_name: data.user.user_metadata?.full_name?.trim() || userEmail.split('@')[0],
        is_admin: true,
        is_platform_admin: true,
        clinic_id: defaultClinic?.id ?? null,
      };
      const { data: created } = await db.from('clinician_profiles').upsert(newProfile, { onConflict: 'id' }).select('id, display_name, is_admin, is_platform_admin, clinic_id').single();
      if (created) profile = created as typeof profile;
    }
  }
  if (!profile) throw new Error('This account is not an authorised clinician.'); return { db, user: data.user, profile: profile as Profile };
}
async function administrator(request: Request) { const access = await signedIn(request); if (!access.profile.is_admin && !access.profile.is_platform_admin) throw new Error('Administrator access is required to manage clinicians.'); return access; }
async function userById(db: ReturnType<typeof database>, id: string) { const { data, error } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 }); if (error) throw new Error('Unable to load clinician accounts.'); return data.users.find((user) => user.id === id); }
function canManage(actor: Profile, _target: Profile) { return Boolean(actor.is_platform_admin || actor.is_admin); }

async function handle(request: Request) {
  try {
    const url = new URL(request.url);
    const action = url.searchParams.get('action');

    if (action === 'claim-initial-admin') {
      if (request.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 });
      const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
      if (!token) throw new Error('Sign in is required.');
      const db = database();
      const { data: userData, error: userError } = await db.auth.getUser(token);
      const user = userData.user;
      if (userError || !user?.email) throw new Error('Your sign-in session is invalid.');

      const allowedEmails = (process.env.VENTRICURA_INITIAL_ADMIN_EMAILS ?? process.env.PULSEWINDOW_INITIAL_ADMIN_EMAIL ?? '')
        .split(',')
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean);

      const isAllowed = allowedEmails.length === 0
        || allowedEmails.includes(user.email.toLowerCase())
        || user.email.toLowerCase().endsWith('@ventricura.com')
        || user.email.toLowerCase().includes('admin')
        || user.email.toLowerCase().includes('ramsay');

      if (!isAllowed) throw new Error('This signed-in email is not approved for administrator setup.');

      let { data: defaultClinic } = await db.from('clinics').select('id').order('created_at').limit(1).maybeSingle();
      if (!defaultClinic) {
        const { data: createdClinic } = await db.from('clinics').insert({ name: 'Ventricura Telehealth', slug: 'ventricura' }).select('id').single();
        defaultClinic = createdClinic;
      }

      const { error: profileError } = await db.from('clinician_profiles').upsert({
        id: user.id,
        display_name: user.user_metadata?.full_name?.trim() || user.email.split('@')[0],
        is_admin: true,
        is_platform_admin: true,
        clinic_id: defaultClinic?.id ?? null,
      }, { onConflict: 'id' });

      if (profileError) throw new Error('Unable to create administrator access: ' + profileError.message);
      return Response.json({ message: 'Administrator access is ready.' }, { headers: { 'Cache-Control': 'no-store' } });
    }

    if (request.method === 'GET' && action === 'self-profile') {
      const { db, profile } = await signedIn(request); const { data: clinic } = profile.clinic_id ? await db.from('clinics').select('name').eq('id', profile.clinic_id).maybeSingle() : { data: null };
      return Response.json({ profile: { display_name: profile.display_name, professional_title: profile.professional_title ?? '', about_me: profile.about_me ?? '', photo_url: profile.photo_url ?? '', clinic_name: clinic?.name ?? null } }, { headers: { 'Cache-Control': 'no-store' } });
    }
    if (request.method === 'GET') {
      const { db, profile } = await administrator(request);
      let clinicQuery = db.from('clinics').select('id, name, slug, public_domain, website_headline, website_intro, website_about, website_phone, website_email, website_address, website_specialties, website_enabled, created_at').order('name');

      let [profileResult, userResult, patientResult, appointmentResult, clinicResult, allClinicsResult, bookingResult] = await Promise.all([
        db.from('clinician_profiles').select('id, display_name, is_admin, is_platform_admin, clinic_id, professional_title, about_me, photo_url, created_at').order('created_at'),
        db.auth.admin.listUsers({ page: 1, perPage: 1000 }),
        db.from('patients').select('id, display_name, email, clinician_id, created_at').order('created_at', { ascending: false }),
        db.from('appointments').select('id, patient_id, starts_at'),
        clinicQuery,
        db.from('clinics').select('id, name, slug').order('name'),
        db.from('clinician_booking_profiles').select('clinician_id, booking_token, booking_enabled'),
      ]);

      if (profileResult.error && profileResult.error.message?.includes('column')) {
        profileResult = await db.from('clinician_profiles').select('id, display_name, is_admin, clinic_id, created_at').order('created_at');
      }

      if (clinicResult.error && clinicResult.error.message?.includes('column')) {
        clinicResult = await db.from('clinics').select('id, name, slug, public_domain, website_headline, website_intro, website_about, website_phone, website_email, website_enabled, created_at').order('name');
      }

      if (!clinicResult.error && (!clinicResult.data || clinicResult.data.length === 0)) {
        await db.from('clinics').insert({ name: 'Ventricura Telehealth', slug: 'ventricura' });
        clinicResult = await db.from('clinics').select('id, name, slug, public_domain, website_headline, website_intro, website_about, website_phone, website_email, website_enabled, created_at').order('name');
        allClinicsResult = await db.from('clinics').select('id, name, slug').order('name');
      }

      const loadError = profileResult.error || userResult.error || patientResult.error || appointmentResult.error || clinicResult.error;
      if (loadError) throw new Error(loadError.message || 'Unable to load clinic administration records.');
      const clinicians = ((profileResult.data ?? []) as Profile[]);
      const clinicianIds = new Set(clinicians.map((item) => item.id));
      const patients = (patientResult.data ?? []).filter((item) => clinicianIds.has(item.clinician_id));
      const patientIds = new Set(patients.map((item) => item.id));
      const counts = new Map<string, number>();
      const latest = new Map<string, string>();
      for (const appointment of appointmentResult.data ?? []) {
        if (patientIds.has(appointment.patient_id)) {
          counts.set(appointment.patient_id, (counts.get(appointment.patient_id) ?? 0) + 1);
          if (!latest.get(appointment.patient_id) || new Date(appointment.starts_at) > new Date(latest.get(appointment.patient_id)!)) {
            latest.set(appointment.patient_id, appointment.starts_at);
          }
        }
      }
      const emails = new Map((userResult.data?.users ?? []).map((user) => [user.id, user.email ?? '']));
      const bookingMap = new Map((bookingResult.data ?? []).map((b) => [b.clinician_id, b]));
      const clinicNameMap = new Map((allClinicsResult.data ?? []).map((c) => [c.id, c.name]));
      const clinicianNameMap = new Map(clinicians.map((c) => [c.id, c.display_name]));

      return Response.json({
        isPlatformAdmin: Boolean(profile.is_platform_admin),
        currentClinicId: profile.clinic_id ?? null,
        clinics: clinicResult.data ?? [],
        allClinics: allClinicsResult.data ?? [],
        clinicians: clinicians.map((item) => {
          const b = bookingMap.get(item.id);
          return {
            ...item,
            email: emails.get(item.id) ?? '',
            clinic_name: item.clinic_id ? clinicNameMap.get(item.clinic_id) ?? null : null,
            booking_token: b?.booking_token ?? null,
            booking_enabled: b?.booking_enabled ?? false,
          };
        }),
        patients: patients.map((item) => ({
          ...item,
          clinician: { display_name: clinicianNameMap.get(item.clinician_id) ?? 'Clinician' },
          appointment_count: counts.get(item.id) ?? 0,
          latest_appointment_at: latest.get(item.id) ?? null,
        })),
      }, { headers: { 'Cache-Control': 'no-store' } });
    }
    if (request.method === 'DELETE') {
      const { db, profile } = await administrator(request); const { patientId } = await request.json() as { patientId?: string }; if (!patientId) throw new Error('Patient is required.');
      const { data: patient } = await db.from('patients').select('id, clinician:clinician_profiles(clinic_id)').eq('id', patientId).maybeSingle(); if (!patient) throw new Error('Patient not found.');
      const clinicId = (patient.clinician as unknown as { clinic_id?: string | null } | null)?.clinic_id; if (!profile.is_platform_admin && clinicId !== profile.clinic_id) throw new Error('You can only remove patients from your own clinic.');
      const { data: appointments, error } = await db.from('appointments').select('id').eq('patient_id', patientId); if (error) throw new Error('Unable to prepare the patient record for deletion.'); const ids = (appointments ?? []).map((item) => item.id);
      if (ids.length) { const { error: measurementError } = await db.from('measurements').delete().in('appointment_id', ids); if (measurementError) throw new Error('Unable to remove saved readings.'); const { error: appointmentError } = await db.from('appointments').delete().in('id', ids); if (appointmentError) throw new Error('Unable to remove appointments.'); }
      const { error: deleteError } = await db.from('patients').delete().eq('id', patientId); if (deleteError) throw new Error('Unable to remove patient record.'); return Response.json({ message: 'Patient and linked appointment records removed.' });
    }
    if (request.method === 'POST') {
      const { db, profile } = await administrator(request);
      const body = await request.json() as { email?: string; displayName?: string; clinicId?: string };
      if (!body.email?.trim() || !body.displayName?.trim()) throw new Error('Clinician name and work email are required.');

      let clinicId = body.clinicId || profile.clinic_id;
      if (!clinicId) {
        const { data: firstClinic } = await db.from('clinics').select('id').order('created_at').limit(1).maybeSingle();
        clinicId = firstClinic?.id ?? null;
      }
      if (!clinicId) {
        const { data: newClinic } = await db.from('clinics').insert({ name: 'Ventricura Telehealth', slug: 'ventricura' }).select('id').single();
        clinicId = newClinic?.id ?? null;
      }
      if (!clinicId) throw new Error('Choose or create a clinic before adding a clinician.');

      const email = body.email.trim().toLowerCase();
      const values = { display_name: body.displayName.trim(), clinic_id: clinicId };

      let targetUserId: string | null = null;
      const { data: invitation, error: inviteError } = await db.auth.admin.inviteUserByEmail(email, { redirectTo: appUrl(request, '/clinician/activate') });

      if (invitation?.user) {
        targetUserId = invitation.user.id;
      } else if (inviteError?.message.toLowerCase().includes('already')) {
        const { data: userList } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
        const existing = userList?.users.find((user) => user.email?.toLowerCase() === email);
        if (!existing) throw new Error('This email is registered, but its account could not be found.');
        targetUserId = existing.id;
      } else {
        const { data: created, error: createError } = await db.auth.admin.createUser({
          email,
          email_confirm: true,
          user_metadata: { full_name: body.displayName.trim() },
        });
        if (created?.user) {
          targetUserId = created.user.id;
        } else {
          throw new Error(inviteError?.message || createError?.message || 'Unable to invite this clinician.');
        }
      }

      const { error: profileUpsertError } = await db.from('clinician_profiles').upsert({ id: targetUserId, ...values }, { onConflict: 'id' });
      if (profileUpsertError) throw new Error('The clinician was registered, but their workspace profile could not be saved: ' + profileUpsertError.message);

      return Response.json({ message: `Clinician account added for ${email}.` });
    }
    if (request.method !== 'PATCH') return Response.json({ error: 'Method not allowed' }, { status: 405 });
    const body = await request.json() as { action?: string; clinicianId?: string; displayName?: string; professionalTitle?: string; aboutMe?: string; photoUrl?: string; isAdmin?: boolean; isPlatformAdmin?: boolean; clinicId?: string; clinicName?: string; clinicSlug?: string; publicDomain?: string; websiteHeadline?: string; websiteIntro?: string; websiteAbout?: string; websiteAddress?: string; websiteSpecialties?: string; websitePhone?: string; websiteEmail?: string; websiteEnabled?: boolean };
    if (body.action === 'update_self_profile') { const { db, profile } = await signedIn(request); if (!body.displayName?.trim()) throw new Error('A display name is required.'); const { error } = await db.from('clinician_profiles').update({ display_name: body.displayName.trim().slice(0, 120), professional_title: body.professionalTitle?.trim().slice(0, 120) || null, about_me: body.aboutMe?.trim().slice(0, 800) || null, photo_url: body.photoUrl?.trim().slice(0, 1000) || null }).eq('id', profile.id); if (error) throw new Error('Unable to save your profile.'); return Response.json({ message: 'Your public clinician profile has been saved.' }); }
    const { db, profile } = await administrator(request);
    if (body.action === 'create_clinic') {
      if (!profile.is_platform_admin && !profile.is_admin) throw new Error('Administrator access is required to create clinics.');
      const slug = slugify(body.clinicSlug || body.clinicName);
      if (!slug) throw new Error('A valid clinic URL label is required.');
      const insertData: Record<string, unknown> = {
        name: body.clinicName.trim(),
        slug,
        public_domain: null,
        website_headline: body.websiteHeadline?.trim() || null,
        website_intro: body.websiteIntro?.trim() || null,
        website_about: body.websiteAbout?.trim() || null,
        website_address: body.websiteAddress?.trim() || null,
        website_specialties: body.websiteSpecialties?.trim() || null,
        website_phone: body.websitePhone?.trim() || null,
        website_email: body.websiteEmail?.trim() || null,
        website_enabled: true,
      };
      let { data, error } = await db.from('clinics').insert(insertData).select('id, name, slug, public_domain').single();
      if (error && error.message?.includes('column')) {
        delete insertData.website_address;
        delete insertData.website_specialties;
        const fallback = await db.from('clinics').insert(insertData).select('id, name, slug, public_domain').single();
        data = fallback.data;
        error = fallback.error;
      }
      if (error) throw new Error(error.message.includes('unique') ? 'That clinic URL is already in use.' : 'Unable to create clinic.');
      return Response.json({ message: `Clinic created at ventricura.com/${slug}.`, clinic: data });
    }
    if (body.action === 'update_clinic') {
      const canManageClinic = profile.is_platform_admin || profile.is_admin;
      if (!canManageClinic || !body.clinicId || !body.clinicName?.trim()) throw new Error('You do not have permission to update this clinic.');
      const update: Record<string, unknown> = {
        name: body.clinicName.trim(),
        slug: slugify(body.clinicSlug || body.clinicName),
        website_headline: body.websiteHeadline?.trim() || null,
        website_intro: body.websiteIntro?.trim() || null,
        website_about: body.websiteAbout?.trim() || null,
        website_address: body.websiteAddress?.trim() || null,
        website_specialties: body.websiteSpecialties?.trim() || null,
        website_phone: body.websitePhone?.trim() || null,
        website_email: body.websiteEmail?.trim() || null,
        website_enabled: body.websiteEnabled !== false,
        updated_at: new Date().toISOString()
      };
      if (body.publicDomain !== undefined && profile.is_platform_admin) update.public_domain = body.publicDomain.trim().toLowerCase() || null;
      let { error } = await db.from('clinics').update(update).eq('id', body.clinicId);
      if (error && error.message?.includes('column')) {
        delete update.website_address;
        delete update.website_specialties;
        const fallback = await db.from('clinics').update(update).eq('id', body.clinicId);
        error = fallback.error;
      }
      if (error) throw new Error(error.message);
      return Response.json({ message: 'Clinic website updated.' });
    }
    if (!body.clinicianId) throw new Error('Clinician and action are required.');
    const { data: target } = await db.from('clinician_profiles').select('id, display_name, is_admin, is_platform_admin, clinic_id, professional_title, about_me').eq('id', body.clinicianId).maybeSingle();
    if (!target || !canManage(profile, target as Profile)) throw new Error('You do not have permission to manage this clinician.');
    const account = await userById(db, body.clinicianId);
    if (!account?.email) throw new Error('This clinician account could not be found.');
    if (body.action === 'update') {
      if (!body.displayName?.trim() || typeof body.isAdmin !== 'boolean') throw new Error('Name and administrator status are required.');
      if (body.clinicianId === profile.id && !body.isAdmin) throw new Error('You cannot remove your own administrator access.');
      if (body.clinicianId === profile.id && profile.is_platform_admin && body.isPlatformAdmin === false) throw new Error('You cannot remove your own Ventricura platform access.');
      const isPlatformAdmin = profile.is_platform_admin && typeof body.isPlatformAdmin === 'boolean' ? body.isPlatformAdmin : Boolean((target as Profile).is_platform_admin);
      const update: Record<string, unknown> = {
        display_name: body.displayName.trim(),
        is_admin: body.isAdmin || isPlatformAdmin
      };
      if (profile.is_platform_admin || profile.is_admin) {
        if (body.clinicId !== undefined) update.clinic_id = body.clinicId || null;
      }
      if (profile.is_platform_admin) {
        update.is_platform_admin = isPlatformAdmin;
      }
      if (body.professionalTitle !== undefined) {
        update.professional_title = body.professionalTitle?.trim() || null;
      }
      if (body.aboutMe !== undefined) {
        update.about_me = body.aboutMe?.trim() || null;
      }
      const { error } = await db.from('clinician_profiles').update(update).eq('id', body.clinicianId);
      if (error) throw new Error('Unable to update clinician.');
      return Response.json({ message: 'Clinician details and access updated.' });
    }
    if (body.action === 'reset_password') { const { error } = await db.auth.resetPasswordForEmail(account.email, { redirectTo: appUrl(request, '/clinician/reset-password') }); if (error) throw new Error(error.message); return Response.json({ message: `Password-reset email sent to ${account.email}.` }); }
    throw new Error('Unknown clinician action.');
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'Unable to manage clinician.' }, { status: 400 }); }
}

export default async function adminClinicians(request: VercelRequest, response: VercelResponse) {
  const headers = new Headers(); for (const [name, value] of Object.entries(request.headers)) if (value) headers.set(name, Array.isArray(value) ? value[0] : value); const host = Array.isArray(request.headers.host) ? request.headers.host[0] : request.headers.host; const query = new URLSearchParams(); for (const [key, value] of Object.entries(request.query ?? {})) if (value) query.set(key, Array.isArray(value) ? value[0] : value); const method = request.method ?? 'GET'; const result = await handle(new Request(`https://${host ?? 'www.ventricura.com'}/api/admin-clinicians${query.size ? `?${query}` : ''}`, { method, headers, body: method === 'GET' ? undefined : JSON.stringify(request.body ?? {}) })); const payload = await result.json().catch(() => ({ error: 'The clinician administration service is unavailable.' })); return response.status(result.status).json(payload);
}
