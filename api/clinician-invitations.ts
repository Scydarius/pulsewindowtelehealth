import { newOpaqueToken, requireClinician, tokenHash } from './clinic';

type RequestBody = { patientName?: string; patientEmail?: string; reason?: string; startsAt?: string };

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
      const { data: patient, error: patientError } = await db.from('patients').insert({
        clinician_id: clinician.id, display_name: body.patientName.trim(), email: body.patientEmail.trim().toLowerCase(),
      }).select('id').single();
      if (patientError || !patient) throw new Error('Could not save the patient record.');
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
      return Response.json({ invitationUrl: `${new URL(request.url).origin}/join?token=${encodeURIComponent(token)}` }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
      return Response.json({ error: error instanceof Error ? error.message : 'Unable to create patient link.' }, { status: 400 });
    }
  },
};
