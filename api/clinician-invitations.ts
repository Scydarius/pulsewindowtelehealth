import { createClient } from '@supabase/supabase-js';

type RequestBody = { patientName?: string; patientEmail?: string; reason?: string; startsAt?: string };
type DeliveryResult = { sent: boolean; warning?: string };

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

async function sendPatientAppointmentEmail(input: { to: string; patientName: string; reason: string; startsAt: Date; invitationUrl: string }): Promise<DeliveryResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { sent: false, warning: 'The secure link was created, but appointment email delivery has not been configured yet.' };
  const formattedTime = input.startsAt.toLocaleString('en-AU', { dateStyle: 'full', timeStyle: 'short' });
  const safeName = escapeHtml(input.patientName);
  const safeReason = escapeHtml(input.reason);
  const safeUrl = escapeHtml(input.invitationUrl);
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL ?? 'PulseWindow <no-reply@pulsewindow.me>',
        to: [input.to],
        subject: 'Your secure PulseWindow appointment link',
        text: `Hello ${input.patientName},\n\nYour PulseWindow appointment (${input.reason}) is scheduled for ${formattedTime}.\n\nJoin securely: ${input.invitationUrl}\n\nThis is a research prototype and not for emergencies.`,
        html: `<p>Hello ${safeName},</p><p>Your PulseWindow appointment for <strong>${safeReason}</strong> is scheduled for <strong>${formattedTime}</strong>.</p><p><a href="${safeUrl}">Join your secure appointment</a></p><p>This research prototype is not for emergencies.</p>`,
      }),
    });
    if (!response.ok) return { sent: false, warning: 'The secure link was created, but the appointment email could not be delivered.' };
    return { sent: true };
  } catch {
    return { sent: false, warning: 'The secure link was created, but the appointment email could not be delivered.' };
  }
}
async function requireClinician(request: Request) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) throw new Error('Sign in is required.');
  const db = database();
  const { data: userData, error: userError } = await db.auth.getUser(token);
  if (userError || !userData.user) throw new Error('Your sign-in session is invalid.');
  const { data: clinician, error } = await db.from('clinician_profiles').select('id').eq('id', userData.user.id).maybeSingle();
  if (error || !clinician) throw new Error('This account is not an authorised clinician.');
  return { db, clinician };
}

export default {
  async fetch(request: Request) {
    if (request.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 });
    try {
      const body = await request.json() as RequestBody;
      if (!body.patientName?.trim() || !body.patientEmail?.trim() || !body.reason?.trim() || !body.startsAt) {
        return Response.json({ error: 'Patient name, email, appointment reason and time are required.' }, { status: 400 });
      }
      const startsAt = new Date(body.startsAt);
      if (Number.isNaN(startsAt.valueOf())) return Response.json({ error: 'Appointment time is invalid.' }, { status: 400 });
      const { db, clinician } = await requireClinician(request);
      const patientEmail = body.patientEmail.trim().toLowerCase();
      const { data: existingPatients, error: patientLookupError } = await db.from('patients').select('id').eq('clinician_id', clinician.id).eq('email', patientEmail).order('created_at', { ascending: true }).limit(1);
      if (patientLookupError) throw new Error('Could not look up the patient record.');
      let patient = existingPatients?.[0];
      if (patient) {
        const { error: updatePatientError } = await db.from('patients').update({ display_name: body.patientName.trim() }).eq('id', patient.id);
        if (updatePatientError) throw new Error('Could not update the patient record.');
      } else {
        const { data: createdPatient, error: patientError } = await db.from('patients').insert({
          clinician_id: clinician.id, display_name: body.patientName.trim(), email: patientEmail,
        }).select('id').single();
        if (patientError || !createdPatient) throw new Error('Could not save the patient record.');
        patient = createdPatient;
      }
      const roomName = `pw-${newOpaqueToken().slice(0, 24)}`;
      const { data: appointment, error: appointmentError } = await db.from('appointments').insert({
        clinician_id: clinician.id, patient_id: patient.id, room_name: roomName, reason: body.reason.trim(), starts_at: startsAt.toISOString(),
      }).select('id').single();
      if (appointmentError || !appointment) throw new Error('Could not create the appointment.');
      const token = newOpaqueToken();
      const { error: inviteError } = await db.from('patient_invites').insert({
        appointment_id: appointment.id, token_hash: await tokenHash(token),
        expires_at: new Date(startsAt.valueOf() + 24 * 60 * 60 * 1000).toISOString(),
      });
      if (inviteError) throw new Error('Could not create the patient link.');
      const baseUrl = (process.env.APP_URL ?? new URL(request.url).origin).replace(/\/$/, '');
      const invitationUrl = `${baseUrl}/join?token=${encodeURIComponent(token)}`;
      const delivery = await sendPatientAppointmentEmail({ to: patientEmail, patientName: body.patientName.trim(), reason: body.reason.trim(), startsAt, invitationUrl });
      return Response.json({ invitationUrl, emailSent: delivery.sent, emailWarning: delivery.warning }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
      return Response.json({ error: error instanceof Error ? error.message : 'Unable to create patient link.' }, { status: 400 });
    }
  },
};
