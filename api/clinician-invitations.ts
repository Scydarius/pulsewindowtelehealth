import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createGoogleCalendarEvent, getGoogleFreeBusy } from '../lib/googleCalendar.js';
import { recordAuditEvent } from '../lib/audit.js';

type AvailabilityDay = { day: number; enabled: boolean; start: string; end: string };
type RequestBody = { action?: 'save-availability' | 'public-book' | 'patient-consent'; patientName?: string; patientEmail?: string; reason?: string; patientNote?: string; startsAt?: string; bookingToken?: string; timezone?: string; durationMinutes?: number; weeklyAvailability?: AvailabilityDay[]; bookingEnabled?: boolean; bookingReason?: string; appointmentId?: string; invitationToken?: string };
type DeliveryResult = { sent: boolean; warning?: string };
type BookingProfile = { clinician_id: string; booking_token: string; timezone: string; duration_minutes: number; weekly_availability: AvailabilityDay[]; booking_enabled: boolean; booking_reason: string };

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
const newOpaqueToken = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, '0')).join('');
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[character] ?? character));
const defaultAvailability: AvailabilityDay[] = [1, 2, 3, 4, 5, 6, 0].map((day) => ({ day, enabled: day >= 1 && day <= 5, start: '09:00', end: '17:00' }));
const slugify = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 63);

function dateParts(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date);
  const value = (kind: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === kind)?.value ?? '00';
  return { year: Number(value('year')), month: Number(value('month')), day: Number(value('day')), hour: Number(value('hour')), minute: Number(value('minute')) };
}
function dateForTimezone(date: Date, timezone: string) { const parts = dateParts(date, timezone); return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`; }
function zonedTime(date: string, time: string, timezone: string) {
  const [year, month, day] = date.split('-').map(Number); const [hour, minute] = time.split(':').map(Number); const wanted = Date.UTC(year, month - 1, day, hour, minute); let timestamp = wanted;
  for (let attempt = 0; attempt < 3; attempt += 1) { const actual = dateParts(new Date(timestamp), timezone); timestamp += wanted - Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute); }
  return new Date(timestamp);
}
function isTime(value: string) { return /^([01]\d|2[0-3]):[0-5]\d$/.test(value); }
function normaliseAvailability(value: unknown): AvailabilityDay[] {
  if (!Array.isArray(value)) return defaultAvailability;
  const supplied = new Map(value.filter((item): item is AvailabilityDay => Boolean(item) && typeof item === 'object').map((item) => [Number(item.day), item]));
  return [1, 2, 3, 4, 5, 6, 0].map((day) => { const item = supplied.get(day); return { day, enabled: Boolean(item?.enabled), start: isTime(String(item?.start ?? '')) ? String(item?.start) : '09:00', end: isTime(String(item?.end ?? '')) ? String(item?.end) : '17:00' }; });
}

async function sendPatientAppointmentEmail(input: { to: string; patientName: string; reason: string; startsAt: Date; invitationUrl: string }): Promise<DeliveryResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { sent: false, warning: 'The secure link was created, but appointment email delivery has not been configured yet.' };
  // Appointment confirmations always come from the product mailbox. Do not
  // inherit a developer's or clinician's personal Resend sender setting.
  const from = 'Ventricura <noreply@ventricura.com>';
  const replyTo = process.env.VENTRICURA_REPLY_TO?.trim() || 'admin@ventricura.com';
  const formattedTime = new Intl.DateTimeFormat('en-AU', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Australia/Adelaide', timeZoneName: 'short' }).format(input.startsAt);
  try {
    const response = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from, reply_to: replyTo, to: [input.to], subject: 'Your secure Ventricura appointment link', text: `Hello ${input.patientName},\n\nYour Ventricura appointment (${input.reason}) is scheduled for ${formattedTime}.\n\nJoin securely: ${input.invitationUrl}\n\nThis service is not for emergencies.`, html: `<p>Hello ${escapeHtml(input.patientName)},</p><p>Your Ventricura appointment for <strong>${escapeHtml(input.reason)}</strong> is scheduled for <strong>${formattedTime}</strong>.</p><p><a href="${escapeHtml(input.invitationUrl)}">Join your secure appointment</a></p><p>This service is not for emergencies.</p>` }) });
    if (!response.ok) { const body = await response.json().catch(() => null) as { message?: unknown } | null; return { sent: false, warning: `The appointment was created, but the email could not be delivered${typeof body?.message === 'string' ? ` (${body.message})` : ''}` }; }
    return { sent: true };
  } catch (error) { return { sent: false, warning: `The appointment was created, but the email could not be delivered${error instanceof Error ? ` (${error.message})` : ''}` }; }
}

async function requireClinician(request: Request) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, ''); if (!token) throw new Error('Sign in is required.'); const db = database();
  const { data: userData, error: userError } = await db.auth.getUser(token); if (userError || !userData.user) throw new Error('Your sign-in session is invalid.');
  const { data: clinician, error } = await db.from('clinician_profiles').select('id, display_name').eq('id', userData.user.id).maybeSingle(); if (error || !clinician) throw new Error('This account is not an authorised clinician.');
  return { db, clinician };
}
async function getBookingProfile(db: SupabaseClient, bookingToken: string) {
  const { data, error } = await db.from('clinician_booking_profiles').select('clinician_id, booking_token, timezone, duration_minutes, weekly_availability, booking_enabled, booking_reason').eq('booking_token', bookingToken).maybeSingle();
  if (error || !data || !data.booking_enabled) throw new Error('This clinician booking link is unavailable.'); return { ...data, weekly_availability: normaliseAvailability(data.weekly_availability) } as BookingProfile;
}
async function slotsForDate(db: SupabaseClient, profile: BookingProfile, date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Please choose a valid date.');
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay(); const day = profile.weekly_availability.find((item) => item.day === weekday); if (!day?.enabled || day.end <= day.start) return [] as string[];
  const start = zonedTime(date, day.start, profile.timezone); const end = zonedTime(date, day.end, profile.timezone); const duration = profile.duration_minutes * 60_000;
  const { data: appointments, error } = await db.from('appointments').select('starts_at').eq('clinician_id', profile.clinician_id).gte('starts_at', new Date(start.valueOf() - duration).toISOString()).lt('starts_at', new Date(end.valueOf() + duration).toISOString());
  if (error) throw new Error('Could not load availability.'); const result: string[] = [];
  const googleBusy = await getGoogleFreeBusy(db, profile.clinician_id, start.toISOString(), end.toISOString(), profile.timezone);
  for (let cursor = start.valueOf(); cursor + duration <= end.valueOf(); cursor += duration) {
    if (cursor < Date.now() + 15 * 60_000) continue;
    if ((appointments ?? []).some((appointment) => { const other = new Date(appointment.starts_at).valueOf(); return other < cursor + duration && other + duration > cursor; })) continue;
    if (googleBusy.some((item) => item.start < cursor + duration && item.end > cursor)) continue;
    result.push(new Date(cursor).toISOString());
  }
  return result;
async function createAppointment(input: { db: SupabaseClient; clinicianId: string; patientName: string; patientEmail: string; reason: string; patientNote?: string; startsAt: Date; request: Request }) {
  const patientEmail = input.patientEmail.trim().toLowerCase();
  const { data: existingPatients, error: patientLookupError } = await input.db
    .from('patients')
    .select('id')
    .ilike('email', patientEmail)
    .order('created_at', { ascending: true })
    .limit(1);
  if (patientLookupError) throw new Error('Could not look up the patient record.');
  let patient = existingPatients?.[0];
  if (patient) { const { error } = await input.db.from('patients').update({ display_name: input.patientName.trim() }).eq('id', patient.id); if (error) throw new Error('Could not update the patient record.'); } else { const { data, error } = await input.db.from('patients').insert({ clinician_id: input.clinicianId, display_name: input.patientName.trim(), email: patientEmail }).select('id').single(); if (error || !data) throw new Error('Could not save the patient record.'); patient = data; }
  const patientNote = input.patientNote?.trim().slice(0, 2000);
  const appointmentReason = `${input.reason.trim()}${patientNote ? `\n\nPatient notes: ${patientNote}` : ''}`;
  const { data: appointment, error: appointmentError } = await input.db.from('appointments').insert({ clinician_id: input.clinicianId, patient_id: patient.id, room_name: `vent-${newOpaqueToken().slice(0, 24)}`, reason: appointmentReason, starts_at: input.startsAt.toISOString() }).select('id').single(); if (appointmentError || !appointment) throw new Error('Could not create the appointment.');
  const invitationToken = newOpaqueToken(); const { error: inviteError } = await input.db.from('patient_invites').insert({ appointment_id: appointment.id, token_hash: await tokenHash(invitationToken), expires_at: new Date(input.startsAt.valueOf() + 24 * 60 * 60 * 1000).toISOString() }); if (inviteError) throw new Error('Could not create the patient link.');
  const baseUrl = (process.env.APP_URL ?? new URL(input.request.url).origin).replace(/\/$/, ''); const invitationUrl = `${baseUrl}/join?token=${encodeURIComponent(invitationToken)}`; const delivery = await sendPatientAppointmentEmail({ to: patientEmail, patientName: input.patientName.trim(), reason: input.reason.trim(), startsAt: input.startsAt, invitationUrl });
  try {
    const { data: bookingProfile } = await input.db.from('clinician_booking_profiles').select('duration_minutes, timezone').eq('clinician_id', input.clinicianId).maybeSingle();
    const duration = (bookingProfile?.duration_minutes ?? 30) * 60_000;
    const endIso = new Date(input.startsAt.valueOf() + duration).toISOString();
    const googleEventId = await createGoogleCalendarEvent(input.db, input.clinicianId, {
      summary: `Ventricura: ${input.patientName.trim()} (${input.reason.trim()})`,
      description: `Ventricura Telehealth Consultation\n\nPatient: ${input.patientName.trim()}\nReason: ${input.reason.trim()}\n\nJoin your secure appointment:\n${invitationUrl}\n\nPrivate and encrypted consultation.`,
      startIso: input.startsAt.toISOString(),
      endIso,
      timeZone: bookingProfile?.timezone ?? 'Australia/Adelaide',
      patientEmail,
    });
    if (googleEventId) {
      await input.db.from('appointments').update({ google_event_id: googleEventId }).eq('id', appointment.id);
    }
  } catch {
    // Non-blocking: calendar sync failure should not prevent appointment creation
  }
  await recordAuditEvent(input.db, { action: 'appointment.created', clinicianId: input.clinicianId, appointmentId: appointment.id, patientId: patient.id, metadata: { source: 'booking' } });
  return { invitationUrl, appointmentId: appointment.id, emailSent: delivery.sent, emailWarning: delivery.warning };
}

export default { async fetch(request: Request) {
  const url = new URL(request.url);
  try {
    if (request.method === 'GET') {
      const action = url.searchParams.get('action');
      const token = url.searchParams.get('token');
      if (action === 'patient-invite' || (!action && token)) {
        if (!token || token.length < 32) return Response.json({ error: 'Invalid patient link.' }, { status: 400 });
        const db = database();
        const { data: invite } = await db.from('patient_invites').select('appointment_id, expires_at, revoked_at').eq('token_hash', await tokenHash(token)).maybeSingle();
        if (!invite || invite.revoked_at || new Date(invite.expires_at) <= new Date()) return Response.json({ error: 'This patient link has expired or was revoked.' }, { status: 410 });
        const { data: appointment } = await db.from('appointments').select('id, reason, starts_at, clinician:clinician_profiles(display_name), patient:patients(display_name)').eq('id', invite.appointment_id).single();
        if (!appointment) return Response.json({ error: 'Appointment not found.' }, { status: 404 });
        const clinician = appointment.clinician as unknown as { display_name: string } | null;
        const patient = appointment.patient as unknown as { display_name: string } | null;
        return Response.json({ appointmentId: appointment.id, reason: appointment.reason, startsAt: appointment.starts_at, clinicianName: clinician?.display_name ?? 'Your clinician', patientName: patient?.display_name ?? 'Patient' }, { headers: { 'Cache-Control': 'no-store' } });
      }
      if (action === 'availability') { const { db, clinician } = await requireClinician(request); const { data, error } = await db.from('clinician_booking_profiles').select('booking_token, timezone, duration_minutes, weekly_availability, booking_enabled, booking_reason').eq('clinician_id', clinician.id).maybeSingle(); if (error) throw new Error('Could not load booking availability.'); const profile = data ?? { booking_token: newOpaqueToken().slice(0, 20), timezone: 'Australia/Adelaide', duration_minutes: 30, weekly_availability: defaultAvailability, booking_enabled: false, booking_reason: 'Telehealth consultation' }; return Response.json({ ...profile, weekly_availability: normaliseAvailability(profile.weekly_availability), bookingUrl: `${(process.env.APP_URL ?? url.origin).replace(/\/$/, '')}/book/${profile.booking_token}` }, { headers: { 'Cache-Control': 'no-store' } }); }
      const bookingToken = url.searchParams.get('bookingToken') ?? '';
      if (action === 'clinic-site') {
        const rawSlug = url.searchParams.get('slug')?.trim().toLowerCase() ?? '';
        if (!rawSlug) throw new Error('Clinic page not found.');
        const slug = slugify(rawSlug);
        const isVentricura = slug === 'ventricura' || rawSlug === 'ventricura' || rawSlug.includes('ventricura');

        let db: ReturnType<typeof database> | null = null;
        try {
          db = database();
        } catch {
          // If database is not configured and it is Ventricura, serve the accredited default site
        }

        let staffProfile: { id: string; is_admin: boolean; is_platform_admin?: boolean; clinic_id?: string | null } | null = null;
        if (db) {
          try {
            const rawAuth = request.headers.get('authorization');
            const token = rawAuth?.replace(/^Bearer\s+/i, '');
            if (token) {
              const { data: userAuth } = await db.auth.getUser(token);
              if (userAuth?.user) {
                const { data: staff } = await db.from('clinician_profiles').select('id, is_admin, is_platform_admin, clinic_id').eq('id', userAuth.user.id).maybeSingle();
                if (staff) {
                  staffProfile = staff;
                }
              }
            }
          } catch {
            // best-effort
          }
        }

        let clinicRecord: Record<string, unknown> | null = null;

        if (db) {
          // Select field sets in descending order of column availability to prevent schema drift errors
          const fieldSets = [
            'id, name, slug, website_headline, website_intro, website_about, website_phone, website_email, website_address, website_specialties, website_banner_url, website_banner_text, website_banner_enabled, website_enabled',
            'id, name, slug, website_headline, website_intro, website_about, website_phone, website_email, website_address, website_specialties, website_enabled',
            'id, name, slug, website_headline, website_intro, website_about, website_phone, website_email, website_enabled',
            'id, name, slug',
          ];

          for (const fields of fieldSets) {
            try {
              // 1. Exact slug match
              const q1 = await db.from('clinics').select(fields).eq('slug', slug).maybeSingle();
              if (q1.error && (q1.error.message?.includes('column') || q1.error.code === '42703' || q1.error.code === 'PGRST204')) {
                continue; // try narrower fieldset
              }
              if (q1.data) {
                clinicRecord = q1.data as Record<string, unknown>;
                break;
              }

              // 2. Exact rawSlug match if different
              if (rawSlug !== slug) {
                const q2 = await db.from('clinics').select(fields).eq('slug', rawSlug).maybeSingle();
                if (q2.data) {
                  clinicRecord = q2.data as Record<string, unknown>;
                  break;
                }
              }

              // 3. Case-insensitive slug match
              const q3 = await db.from('clinics').select(fields).ilike('slug', rawSlug).maybeSingle();
              if (q3.data) {
                clinicRecord = q3.data as Record<string, unknown>;
                break;
              }

              // 4. Name match (case-insensitive substring)
              const nameClean = rawSlug.replace(/[-_]+/g, ' ').trim();
              if (nameClean) {
                const q4 = await db.from('clinics').select(fields).ilike('name', `%${nameClean}%`).limit(1).maybeSingle();
                if (q4.data) {
                  clinicRecord = q4.data as Record<string, unknown>;
                  break;
                }
              }

              // 5. If looking for Ventricura and not found, match the earliest clinic in DB
              if (isVentricura) {
                const q5 = await db.from('clinics').select(fields).order('created_at', { ascending: true }).limit(1).maybeSingle();
                if (q5.data) {
                  clinicRecord = q5.data as Record<string, unknown>;
                  break;
                }
              }

              // If query succeeded without column error and found nothing, no need to retry with fewer columns
              if (!q1.error) {
                break;
              }
            } catch {
              // try next fieldset
            }
          }

          // If still no clinic record and looking for Ventricura, ensure base record exists
          if (!clinicRecord && isVentricura) {
            try {
              const { data: created } = await db.from('clinics').insert({ name: 'Ventricura Telehealth', slug: 'ventricura' }).select('id, name, slug').maybeSingle();
              if (created) {
                clinicRecord = created as Record<string, unknown>;
              }
            } catch {
              // will use default values below
            }
          }
        }

        // If not found in database:
        // Ventricura ALWAYS loads; non-Ventricura clinics return 404
        if (!clinicRecord && !isVentricura) {
          return Response.json({ error: 'Clinic page not found.' }, { status: 404 });
        }

        const isManager = Boolean(staffProfile && (staffProfile.is_platform_admin || (staffProfile.is_admin && clinicRecord && staffProfile.clinic_id === clinicRecord.id)));

        // Non-Ventricura clinics respect unpublished status
        if (!isVentricura && clinicRecord && clinicRecord.website_enabled === false && !isManager) {
          return Response.json({ error: 'This clinic page is currently unpublished.' }, { status: 404 });
        }

        const baseUrl = (process.env.APP_URL ?? url.origin).replace(/\/$/, '');
        const clinicId = typeof clinicRecord?.id === 'string' ? clinicRecord.id : 'ventricura-telehealth';
        const clinicName = typeof clinicRecord?.name === 'string' ? clinicRecord.name : 'Ventricura Telehealth';
        const clinicSlug = typeof clinicRecord?.slug === 'string' ? clinicRecord.slug : 'ventricura';
        const headline = (clinicRecord?.website_headline as string) || 'Specialist telehealth & contactless vitals consultations.';
        const intro = (clinicRecord?.website_intro as string) || 'A unified clinical workspace connecting patients with qualified medical practitioners, backed by camera-assisted vital metrics.';
        const about = (clinicRecord?.website_about as string) || 'Ventricura delivers browser-based telehealth consultations with contactless vitals extraction, structured clinical notes, and integrated appointment scheduling. Patients connect securely with accredited medical practitioners from any device.';
        const address = (clinicRecord?.website_address as string) || (isVentricura ? 'Level 1, 115 King William Street, Adelaide SA 5000' : '');
        const phone = (clinicRecord?.website_phone as string) || (isVentricura ? '1300 000 836' : '');
        const email = (clinicRecord?.website_email as string) || (isVentricura ? 'admin@ventricura.com' : '');
        const bannerUrl = (clinicRecord?.website_banner_url as string) || null;
        const bannerText = (clinicRecord?.website_banner_text as string) || null;
        const bannerEnabled = clinicRecord?.website_banner_enabled !== false;

        const rawSpecialties = clinicRecord?.website_specialties as string | null | undefined;
        let specialties: string[] = [];
        if (rawSpecialties) {
          specialties = rawSpecialties.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean);
        } else if (isVentricura) {
          specialties = [
            'General Telehealth',
            'Specialist Cardiovascular Care',
            'Contactless Biometrics & Vitals',
            'Remote Chronic Disease Monitoring',
          ];
        }

        const isValidUuid = (val?: unknown): val is string =>
          typeof val === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(val);

        let doctors: {
          id: string;
          name: string;
          title: string;
          about: string;
          photoUrl: string | null;
          bookingUrl: string | null;
          durationMinutes: number;
          bookingReason: string;
        }[] = [];

        if (db) {
          try {
            let clinicianQuery = db.from('clinician_profiles').select('id, display_name, professional_title, about_me, photo_url, created_at');
            if (isVentricura) {
              if (isValidUuid(clinicId)) {
                clinicianQuery = clinicianQuery.or(`clinic_id.eq.${clinicId},clinic_id.is.null`);
              }
            } else if (isValidUuid(clinicId)) {
              clinicianQuery = clinicianQuery.eq('clinic_id', clinicId);
            }

            let cliniciansResult = await clinicianQuery.order('created_at', { ascending: true });
            if (cliniciansResult.error && (cliniciansResult.error.message?.includes('column') || cliniciansResult.error.code === '42703')) {
              let fallbackQuery = db.from('clinician_profiles').select('id, display_name, created_at');
              if (isVentricura) {
                if (isValidUuid(clinicId)) {
                  fallbackQuery = fallbackQuery.or(`clinic_id.eq.${clinicId},clinic_id.is.null`);
                }
              } else if (isValidUuid(clinicId)) {
                fallbackQuery = fallbackQuery.eq('clinic_id', clinicId);
              }
              cliniciansResult = await fallbackQuery.order('created_at', { ascending: true });
            }

            const clinicians = cliniciansResult.data ?? [];
            const clinicianIds = clinicians.map((c) => c.id).filter(isValidUuid);

            const bookingMap = new Map<string, { duration_minutes?: number; booking_enabled: boolean; booking_token: string; booking_reason?: string }>();
            if (clinicianIds.length > 0) {
              try {
                const { data: bookingProfiles } = await db
                  .from('clinician_booking_profiles')
                  .select('clinician_id, booking_token, duration_minutes, booking_enabled, booking_reason')
                  .in('clinician_id', clinicianIds);
                if (bookingProfiles) {
                  for (const b of bookingProfiles) {
                    bookingMap.set(b.clinician_id, b);
                  }
                }
              } catch {
                // best-effort
              }
            }

            doctors = clinicians.map((item) => {
              const booking = bookingMap.get(item.id);
              return {
                id: item.id,
                name: item.display_name,
                title: ((item as Record<string, unknown>).professional_title as string) || 'Consultant Clinician',
                about: ((item as Record<string, unknown>).about_me as string) || '',
                photoUrl: ((item as Record<string, unknown>).photo_url as string) || null,
                bookingUrl: booking?.booking_enabled ? `${baseUrl}/book/${booking.booking_token}` : null,
                durationMinutes: booking?.duration_minutes ?? 30,
                bookingReason: booking?.booking_reason ?? 'Telehealth consultation',
              };
            });
          } catch {
            // best-effort
          }
        }

        const defaultBooking = doctors.find((d) => Boolean(d.bookingUrl))?.bookingUrl ?? null;

        return Response.json({
          clinic: {
            id: clinicId,
            name: clinicName,
            slug: clinicSlug,
            headline,
            intro,
            about,
            address,
            specialties,
            phone,
            email,
            bannerUrl,
            bannerText,
            bannerEnabled,
            bookingUrl: defaultBooking,
            doctors,
          },
          isManager,
        }, { headers: { 'Cache-Control': 'no-store' } });
      }
      if (action === 'public-profile') {
        const db = database();
        const profile = await getBookingProfile(db, bookingToken);
        let { data: clinician } = await db
          .from('clinician_profiles')
          .select('display_name, professional_title, about_me, photo_url, clinic:clinics(name, website_banner_url, website_banner_text, website_banner_enabled)')
          .eq('id', profile.clinician_id)
          .maybeSingle();
        if (!clinician) {
          const fallback = await db
            .from('clinician_profiles')
            .select('display_name, professional_title, about_me, photo_url, clinic:clinics(name)')
            .eq('id', profile.clinician_id)
            .single();
          clinician = fallback.data as typeof clinician;
        }
        const clinic = clinician?.clinic as unknown as { name?: string; website_banner_url?: string; website_banner_text?: string; website_banner_enabled?: boolean } | null;
        return Response.json({
          clinicianName: clinician?.display_name ?? 'Your clinician',
          professionalTitle: clinician?.professional_title ?? '',
          aboutMe: clinician?.about_me ?? '',
          photoUrl: clinician?.photo_url ?? '',
          clinicName: clinic?.name ?? '',
          clinicBannerUrl: clinic?.website_banner_enabled !== false ? (clinic?.website_banner_url ?? null) : null,
          clinicBannerText: clinic?.website_banner_enabled !== false ? (clinic?.website_banner_text ?? null) : null,
          timezone: profile.timezone,
          durationMinutes: profile.duration_minutes,
          bookingReason: profile.booking_reason,
        });
      }
      if (action === 'public-slots') { const db = database(); const profile = await getBookingProfile(db, bookingToken); return Response.json({ slots: await slotsForDate(db, profile, url.searchParams.get('date') ?? ''), timezone: profile.timezone }); }
      return Response.json({ error: 'Unknown booking request.' }, { status: 400 });
    }
    if (request.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 }); const body = await request.json() as RequestBody;
    if (body.action === 'patient-consent') {
      if (!body.appointmentId || !body.invitationToken || body.invitationToken.length < 32) throw new Error('A valid secure appointment link is required.');
      const db = database();
      const { data: invite } = await db.from('patient_invites').select('appointment_id, expires_at, revoked_at').eq('token_hash', await tokenHash(body.invitationToken)).maybeSingle();
      if (!invite || invite.appointment_id !== body.appointmentId || invite.revoked_at || new Date(invite.expires_at) <= new Date()) throw new Error('This patient link is not authorised for this appointment.');
      const consentAt = new Date().toISOString();
      const { data: appointment, error } = await db.from('appointments').update({ patient_consent_at: consentAt, patient_consent_version: '2026-09-30' }).eq('id', body.appointmentId).select('patient_id').single();
      if (error || !appointment) throw new Error('Unable to record consent for this appointment.');
      await recordAuditEvent(db, { action: 'patient.consent_recorded', appointmentId: body.appointmentId, patientId: appointment.patient_id, metadata: { version: '2026-09-30' } });
      return Response.json({ consentAt }, { headers: { 'Cache-Control': 'no-store' } });
    }
    if (body.action === 'save-availability') { const { db, clinician } = await requireClinician(request); const duration = Number(body.durationMinutes); if (![15, 30, 45, 60].includes(duration)) throw new Error('Choose an appointment length of 15, 30, 45 or 60 minutes.'); const availability = normaliseAvailability(body.weeklyAvailability); if (!availability.some((day) => day.enabled && day.end > day.start)) throw new Error('Add at least one available time window before publishing your booking link.'); const existing = await db.from('clinician_booking_profiles').select('booking_token').eq('clinician_id', clinician.id).maybeSingle(); const bookingToken = existing.data?.booking_token ?? newOpaqueToken().slice(0, 20); const { error } = await db.from('clinician_booking_profiles').upsert({ clinician_id: clinician.id, booking_token: bookingToken, timezone: 'Australia/Adelaide', duration_minutes: duration, weekly_availability: availability, booking_enabled: Boolean(body.bookingEnabled), booking_reason: body.bookingReason?.trim().slice(0, 140) || 'Telehealth consultation', updated_at: new Date().toISOString() }, { onConflict: 'clinician_id' }); if (error) throw new Error('Could not save availability. Run the booking migration in Supabase first.'); return Response.json({ bookingToken, bookingUrl: `${(process.env.APP_URL ?? url.origin).replace(/\/$/, '')}/book/${bookingToken}` }); }
    if (body.action === 'public-book') { if (!body.bookingToken || !body.patientName?.trim() || !body.patientEmail?.trim() || !body.startsAt) throw new Error('Name, email and an available appointment time are required.'); const db = database(); const profile = await getBookingProfile(db, body.bookingToken); const startsAt = new Date(body.startsAt); if (Number.isNaN(startsAt.valueOf())) throw new Error('Choose a valid appointment time.'); if (!(await slotsForDate(db, profile, dateForTimezone(startsAt, profile.timezone))).includes(startsAt.toISOString())) throw new Error('That time has just become unavailable. Please choose another slot.'); const result = await createAppointment({ db, clinicianId: profile.clinician_id, patientName: body.patientName, patientEmail: body.patientEmail, reason: body.reason?.trim() || profile.booking_reason, patientNote: body.patientNote, startsAt, request }); return Response.json({ ...result, startsAt: startsAt.toISOString() }); }
    if (!body.patientName?.trim() || !body.patientEmail?.trim() || !body.reason?.trim() || !body.startsAt) throw new Error('Patient name, email, appointment reason and time are required.'); const startsAt = new Date(body.startsAt); if (Number.isNaN(startsAt.valueOf())) throw new Error('Appointment time is invalid.'); const { db, clinician } = await requireClinician(request); return Response.json(await createAppointment({ db, clinicianId: clinician.id, patientName: body.patientName, patientEmail: body.patientEmail, reason: body.reason, patientNote: body.patientNote, startsAt, request }), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'Unable to complete this booking request.' }, { status: 400 }); }
} };
