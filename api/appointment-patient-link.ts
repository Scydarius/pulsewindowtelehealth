import { createClient } from '@supabase/supabase-js';
import { deleteGoogleCalendarEvent } from '../lib/googleCalendar.js';
import { recordAuditEvent } from '../lib/audit.js';

type VercelRequest = {
  method?: string;
  body?: unknown;
  headers: Record<string, string | string[] | undefined>;
};
type VercelResponse = { status: (code: number) => { json: (body: unknown) => void } };

const database = () => {
  const url = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error('The clinical database is not configured.');
  return createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
};
const hashToken = async (token: string) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
};
const newToken = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, '0')).join('');
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[character] ?? character));

async function sendReplacementLink(input: { email: string; patientName: string; startsAt: string; invitationUrl: string }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { sent: false, warning: 'The new secure link was created, but email delivery is not configured.' };
  const when = new Intl.DateTimeFormat('en-AU', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Australia/Adelaide', timeZoneName: 'short' }).format(new Date(input.startsAt));
  try {
    const result = await fetch('https://api.resend.com/emails', {
      method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Ventricura <noreply@ventricura.com>',
        reply_to: process.env.VENTRICURA_REPLY_TO?.trim() || 'admin@ventricura.com',
        to: [input.email], subject: 'Your updated secure Ventricura appointment link',
        text: `Hello ${input.patientName},\n\nYour clinician has issued a new secure joining link for your Ventricura appointment on ${when}.\n\nJoin securely: ${input.invitationUrl}`,
        html: `<p>Hello ${escapeHtml(input.patientName)},</p><p>Your clinician has issued a new secure joining link for your Ventricura appointment on <strong>${when}</strong>.</p><p><a href="${escapeHtml(input.invitationUrl)}">Join your secure appointment</a></p>`,
      }),
    });
    if (!result.ok) { const body = await result.json().catch(() => null) as { message?: string } | null; return { sent: false, warning: `The new link was created, but the email could not be delivered${body?.message ? ` (${body.message})` : ''}.` }; }
    return { sent: true };
  } catch { return { sent: false, warning: 'The new link was created, but the email could not be delivered.' }; }
}

export default async function patientLink(request: VercelRequest, response: VercelResponse) {
  if (request.method !== 'POST' && request.method !== 'DELETE') return response.status(405).json({ error: 'Method not allowed.' });
  try {
    const rawAuthorization = request.headers.authorization;
    const token = (Array.isArray(rawAuthorization) ? rawAuthorization[0] : rawAuthorization)?.replace(/^Bearer\s+/i, '');
    if (!token) throw new Error('Sign in is required.');
    const body = (typeof request.body === 'string' ? JSON.parse(request.body) : request.body ?? {}) as { appointmentId?: string; deleteAppointment?: boolean };
    if (!body.appointmentId) return response.status(400).json({ error: 'Appointment is required.' });
    const db = database();
    const { data: userData, error: userError } = await db.auth.getUser(token);
    if (userError || !userData.user) throw new Error('Your sign-in session is invalid.');
    const { data: clinician, error: clinicianError } = await db.from('clinician_profiles').select('id').eq('id', userData.user.id).maybeSingle();
    if (clinicianError || !clinician) throw new Error('This account is not an authorised clinician.');
    const { data: appointment } = await db.from('appointments').select('id, patient_id, starts_at, google_event_id, patient:patients(display_name, email)').eq('id', body.appointmentId).eq('clinician_id', clinician.id).maybeSingle();
    if (!appointment) return response.status(403).json({ error: 'You are not authorised for this appointment.' });

    if (request.method === 'DELETE' && body.deleteAppointment) {
      if (appointment.google_event_id) {
        try { await deleteGoogleCalendarEvent(db, clinician.id, appointment.google_event_id); }
        catch { /* best-effort */ }
      }
      // A clinician can remove only their own appointment. The patient record
      // deliberately remains available for future appointments.
      const [{ error: noteError }, { error: measurementError }, { error: inviteError }] = await Promise.all([
        db.from('clinician_private_notes').delete().eq('appointment_id', appointment.id),
        db.from('measurements').delete().eq('appointment_id', appointment.id),
        db.from('patient_invites').delete().eq('appointment_id', appointment.id),
      ]);
      if (noteError || measurementError || inviteError) throw new Error('Unable to remove the appointment data.');
      await recordAuditEvent(db, { action: 'appointment.deleted', clinicianId: clinician.id, appointmentId: null, patientId: appointment.patient_id, metadata: { deleted_appointment_id: appointment.id } });
      const { error: appointmentError } = await db.from('appointments').delete().eq('id', appointment.id);
      if (appointmentError) throw new Error('Unable to remove the appointment.');
      return response.status(200).json({ deleted: true });
    }

    const { error: revokeError } = await db.from('patient_invites').update({ revoked_at: new Date().toISOString() }).eq('appointment_id', appointment.id).is('revoked_at', null);
    if (revokeError) throw new Error('Unable to revoke the current patient link.');
    if (request.method === 'DELETE') {
      await recordAuditEvent(db, { action: 'patient_link.revoked', clinicianId: clinician.id, appointmentId: appointment.id, patientId: appointment.patient_id });
      return response.status(200).json({ revoked: true });
    }

    const inviteToken = newToken();
    const expiresAt = new Date(Math.max(new Date(appointment.starts_at).valueOf() + 24 * 60 * 60 * 1000, Date.now() + 24 * 60 * 60 * 1000));
    const { error: invitationError } = await db.from('patient_invites').insert({ appointment_id: appointment.id, token_hash: await hashToken(inviteToken), expires_at: expiresAt.toISOString() });
    if (invitationError) throw new Error('Unable to create a replacement patient link.');
    const host = Array.isArray(request.headers.host) ? request.headers.host[0] : request.headers.host;
    const origin = host ? `https://${host}` : 'https://www.ventricura.com';
    const invitationUrl = `${origin}/join?token=${encodeURIComponent(inviteToken)}`;
    const shouldSendEmail = (body as { sendEmail?: boolean; noEmail?: boolean }).sendEmail !== false && !(body as { noEmail?: boolean }).noEmail;
    const patient = appointment.patient as unknown as { display_name: string; email: string } | null;
    const delivery = (patient?.email && shouldSendEmail) ? await sendReplacementLink({ email: patient.email, patientName: patient.display_name, startsAt: appointment.starts_at, invitationUrl }) : { sent: false, warning: undefined };
    await recordAuditEvent(db, { action: 'patient_link.regenerated', clinicianId: clinician.id, appointmentId: appointment.id, patientId: appointment.patient_id, metadata: { email_sent: delivery.sent } });
    return response.status(200).json({ invitationUrl, emailSent: delivery.sent, emailWarning: delivery.warning });
  } catch (error) {
    return response.status(400).json({ error: error instanceof Error ? error.message : 'Unable to update patient access.' });
  }
}
