import { createClient } from '@supabase/supabase-js';

function database() {
  const url = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error('The clinical database is not configured yet.');
  return createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function requireAppointmentAccess(request: Request, appointmentId: string) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) throw new Error('Sign in is required.');
  const db = database();
  const { data: userData, error: userError } = await db.auth.getUser(token);
  if (userError || !userData.user) throw new Error('Your sign-in session is invalid.');
  const { data: appointment } = await db.from('appointments').select('id, clinician_id').eq('id', appointmentId).eq('clinician_id', userData.user.id).maybeSingle();
  if (!appointment) throw new Error('You are not authorised to access notes for this appointment.');
  return { db, clinicianId: userData.user.id };
}

export default {
  async fetch(request: Request) {
    try {
      if (request.method === 'GET') {
        const appointmentId = new URL(request.url).searchParams.get('appointmentId');
        if (!appointmentId) return Response.json({ error: 'Appointment is required.' }, { status: 400 });
        const { db } = await requireAppointmentAccess(request, appointmentId);
        const { data, error } = await db.from('clinician_private_notes').select('content, updated_at').eq('appointment_id', appointmentId).maybeSingle();
        if (error) throw new Error('Unable to load private notes.');
        return Response.json({ note: data ?? { content: '', updated_at: null } }, { headers: { 'Cache-Control': 'no-store' } });
      }
      if (request.method === 'PUT') {
        const body = await request.json() as { appointmentId?: string; content?: string };
        const appointmentId = body.appointmentId;
        const content = typeof body.content === 'string' ? body.content.trimEnd() : '';
        if (!appointmentId) return Response.json({ error: 'Appointment is required.' }, { status: 400 });
        if (content.length > 10000) return Response.json({ error: 'Private notes must be 10,000 characters or fewer.' }, { status: 400 });
        const { db, clinicianId } = await requireAppointmentAccess(request, appointmentId);
        const { data, error } = await db.from('clinician_private_notes').upsert({ appointment_id: appointmentId, clinician_id: clinicianId, content, updated_at: new Date().toISOString() }, { onConflict: 'appointment_id' }).select('content, updated_at').single();
        if (error) throw new Error('Unable to save private notes.');
        return Response.json({ note: data });
      }
      return Response.json({ error: 'Method not allowed.' }, { status: 405 });
    } catch (error) {
      return Response.json({ error: error instanceof Error ? error.message : 'Unable to manage private notes.' }, { status: 403 });
    }
  },
};
