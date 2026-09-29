import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createGoogleCalendarEvent, getGoogleFreeBusy } from '../lib/googleCalendar';

type AvailabilityDay = { day: number; enabled: boolean; start: string; end: string };
type RequestBody = { action?: 'save-availability' | 'public-book'; patientName?: string; patientEmail?: string; reason?: string; startsAt?: string; bookingToken?: string; timezone?: string; durationMinutes?: number; weeklyAvailability?: AvailabilityDay[]; bookingEnabled?: boolean; bookingReason?: string };
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
  const configuredSender = process.env.VENTRICURA_FROM_EMAIL?.trim() || process.env.RESEND_FROM_EMAIL?.trim();
  const from = configuredSender && /@ventricura\.com>?$/i.test(configuredSender) ? configuredSender : 'Ventricura <admin@ventricura.com>';
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
}
async function createAppointment(input: { db: SupabaseClient; clinicianId: string; patientName: string; patientEmail: string; reason: string; startsAt: Date; request: Request }) {
  const patientEmail = input.patientEmail.trim().toLowerCase(); const { data: existingPatients, error: patientLookupError } = await input.db.from('patients').select('id').eq('clinician_id', input.clinicianId).eq('email', patientEmail).order('created_at', { ascending: true }).limit(1); if (patientLookupError) throw new Error('Could not look up the patient record.'); let patient = existingPatients?.[0];
  if (patient) { const { error } = await input.db.from('patients').update({ display_name: input.patientName.trim() }).eq('id', patient.id); if (error) throw new Error('Could not update the patient record.'); } else { const { data, error } = await input.db.from('patients').insert({ clinician_id: input.clinicianId, display_name: input.patientName.trim(), email: patientEmail }).select('id').single(); if (error || !data) throw new Error('Could not save the patient record.'); patient = data; }
  const { data: appointment, error: appointmentError } = await input.db.from('appointments').insert({ clinician_id: input.clinicianId, patient_id: patient.id, room_name: `vent-${newOpaqueToken().slice(0, 24)}`, reason: input.reason.trim(), starts_at: input.startsAt.toISOString() }).select('id').single(); if (appointmentError || !appointment) throw new Error('Could not create the appointment.');
  const invitationToken = newOpaqueToken(); const { error: inviteError } = await input.db.from('patient_invites').insert({ appointment_id: appointment.id, token_hash: await tokenHash(invitationToken), expires_at: new Date(input.startsAt.valueOf() + 24 * 60 * 60 * 1000).toISOString() }); if (inviteError) throw new Error('Could not create the patient link.');
  const baseUrl = (process.env.APP_URL ?? new URL(input.request.url).origin).replace(/\/$/, ''); const invitationUrl = `${baseUrl}/join?token=${encodeURIComponent(invitationToken)}`; const delivery = await sendPatientAppointmentEmail({ to: patientEmail, patientName: input.patientName.trim(), reason: input.reason.trim(), startsAt: input.startsAt, invitationUrl });
  try {
    const { data: bookingProfile } = await input.db.from('clinician_booking_profiles').select('duration_minutes, timezone').eq('clinician_id', input.clinicianId).maybeSingle();
    const duration = (bookingProfile?.duration_minutes ?? 30) * 60_000;
    const endIso = new Date(input.startsAt.valueOf() + duration).toISOString();
    const googleEventId = await createGoogleCalendarEvent(input.db, input.clinicianId, {
      summary: `Ventricura: ${input.patientName.trim()} (${input.reason.trim()})`,
      description: `Ventricura Telehealth Consultation\n\nPatient: ${input.patientName.trim()}\nEmail: ${patientEmail}\nReason: ${input.reason.trim()}\n\nClinician Call Link: ${baseUrl}/consultation/${appointment.id}?role=clinician\nPatient Secure Link: ${invitationUrl}\n\nPrivate and encrypted consultation.`,
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
  return { invitationUrl, emailSent: delivery.sent, emailWarning: delivery.warning };
}

export default { async fetch(request: Request) {
  const url = new URL(request.url);
  try {
    if (request.method === 'GET') {
      const action = url.searchParams.get('action');
      if (action === 'availability') { const { db, clinician } = await requireClinician(request); const { data, error } = await db.from('clinician_booking_profiles').select('booking_token, timezone, duration_minutes, weekly_availability, booking_enabled, booking_reason').eq('clinician_id', clinician.id).maybeSingle(); if (error) throw new Error('Could not load booking availability.'); const profile = data ?? { booking_token: newOpaqueToken().slice(0, 20), timezone: 'Australia/Adelaide', duration_minutes: 30, weekly_availability: defaultAvailability, booking_enabled: false, booking_reason: 'Telehealth consultation' }; return Response.json({ ...profile, weekly_availability: normaliseAvailability(profile.weekly_availability), bookingUrl: `${(process.env.APP_URL ?? url.origin).replace(/\/$/, '')}/book/${profile.booking_token}` }, { headers: { 'Cache-Control': 'no-store' } }); }
      const bookingToken = url.searchParams.get('bookingToken') ?? '';
      if (action === 'public-profile') { const db = database(); const profile = await getBookingProfile(db, bookingToken); const { data: clinician } = await db.from('clinician_profiles').select('display_name').eq('id', profile.clinician_id).single(); return Response.json({ clinicianName: clinician?.display_name ?? 'Your clinician', timezone: profile.timezone, durationMinutes: profile.duration_minutes, bookingReason: profile.booking_reason }); }
      if (action === 'public-slots') { const db = database(); const profile = await getBookingProfile(db, bookingToken); return Response.json({ slots: await slotsForDate(db, profile, url.searchParams.get('date') ?? ''), timezone: profile.timezone }); }
      return Response.json({ error: 'Unknown booking request.' }, { status: 400 });
    }
    if (request.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 }); const body = await request.json() as RequestBody;
    if (body.action === 'save-availability') { const { db, clinician } = await requireClinician(request); const duration = Number(body.durationMinutes); if (![15, 30, 45, 60].includes(duration)) throw new Error('Choose an appointment length of 15, 30, 45 or 60 minutes.'); const availability = normaliseAvailability(body.weeklyAvailability); if (!availability.some((day) => day.enabled && day.end > day.start)) throw new Error('Add at least one available time window before publishing your booking link.'); const existing = await db.from('clinician_booking_profiles').select('booking_token').eq('clinician_id', clinician.id).maybeSingle(); const bookingToken = existing.data?.booking_token ?? newOpaqueToken().slice(0, 20); const { error } = await db.from('clinician_booking_profiles').upsert({ clinician_id: clinician.id, booking_token: bookingToken, timezone: 'Australia/Adelaide', duration_minutes: duration, weekly_availability: availability, booking_enabled: Boolean(body.bookingEnabled), booking_reason: body.bookingReason?.trim().slice(0, 140) || 'Telehealth consultation', updated_at: new Date().toISOString() }, { onConflict: 'clinician_id' }); if (error) throw new Error('Could not save availability. Run the booking migration in Supabase first.'); return Response.json({ bookingToken, bookingUrl: `${(process.env.APP_URL ?? url.origin).replace(/\/$/, '')}/book/${bookingToken}` }); }
    if (body.action === 'public-book') { if (!body.bookingToken || !body.patientName?.trim() || !body.patientEmail?.trim() || !body.startsAt) throw new Error('Name, email and an available appointment time are required.'); const db = database(); const profile = await getBookingProfile(db, body.bookingToken); const startsAt = new Date(body.startsAt); if (Number.isNaN(startsAt.valueOf())) throw new Error('Choose a valid appointment time.'); if (!(await slotsForDate(db, profile, dateForTimezone(startsAt, profile.timezone))).includes(startsAt.toISOString())) throw new Error('That time has just become unavailable. Please choose another slot.'); const result = await createAppointment({ db, clinicianId: profile.clinician_id, patientName: body.patientName, patientEmail: body.patientEmail, reason: body.reason?.trim() || profile.booking_reason, startsAt, request }); return Response.json({ ...result, startsAt: startsAt.toISOString() }); }
    if (!body.patientName?.trim() || !body.patientEmail?.trim() || !body.reason?.trim() || !body.startsAt) throw new Error('Patient name, email, appointment reason and time are required.'); const startsAt = new Date(body.startsAt); if (Number.isNaN(startsAt.valueOf())) throw new Error('Appointment time is invalid.'); const { db, clinician } = await requireClinician(request); return Response.json(await createAppointment({ db, clinicianId: clinician.id, patientName: body.patientName, patientEmail: body.patientEmail, reason: body.reason, startsAt, request }), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'Unable to complete this booking request.' }, { status: 400 }); }
} };
