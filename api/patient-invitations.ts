import { database, tokenHash } from './clinic';

export default {
  async fetch(request: Request) {
    const token = new URL(request.url).searchParams.get('token');
    if (!token || token.length < 32) return Response.json({ error: 'Invalid patient link.' }, { status: 400 });
    try {
      const db = database();
      const { data: invite } = await db.from('patient_invites').select('appointment_id, expires_at, revoked_at').eq('token_hash', tokenHash(token)).maybeSingle();
      if (!invite || invite.revoked_at || new Date(invite.expires_at) <= new Date()) return Response.json({ error: 'This patient link has expired or was revoked.' }, { status: 410 });
      const { data: appointment } = await db.from('appointments').select('id, reason, starts_at, clinician:clinician_profiles(display_name)').eq('id', invite.appointment_id).single();
      if (!appointment) return Response.json({ error: 'Appointment not found.' }, { status: 404 });
      const clinician = appointment.clinician as unknown as { display_name: string } | null;
      return Response.json({ appointmentId: appointment.id, reason: appointment.reason, startsAt: appointment.starts_at, clinicianName: clinician?.display_name ?? 'Your clinician' }, { headers: { 'Cache-Control': 'no-store' } });
    } catch {
      return Response.json({ error: 'Unable to open this patient link.' }, { status: 500 });
    }
  },
};
