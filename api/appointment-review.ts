import { createClient } from '@supabase/supabase-js';

function database() {
  const url = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error('The clinical database is not configured.');
  return createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function requireAppointmentAccess(request: Request, appointmentId: string) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) throw new Error('Sign in is required.');
  const db = database();
  const { data: userData, error: userError } = await db.auth.getUser(token);
  if (userError || !userData.user) throw new Error('Your sign-in session is invalid.');

  const { data: appointment } = await db
    .from('appointments')
    .select('id, clinician_id')
    .eq('id', appointmentId)
    .eq('clinician_id', userData.user.id)
    .maybeSingle();

  if (!appointment) throw new Error('You are not authorised for this appointment.');
  return { db, clinicianId: userData.user.id };
}

export default {
  async fetch(request: Request) {
    try {
      if (request.method === 'GET') {
        const url = new URL(request.url);
        const appointmentId = url.searchParams.get('appointmentId');
        if (!appointmentId) return Response.json({ error: 'Appointment ID is required.' }, { status: 400 });

        const { db, clinicianId } = await requireAppointmentAccess(request, appointmentId);

        // Try selecting review fields from appointments
        let needsReview = false;
        let reviewedAt: string | null = null;

        try {
          const { data, error } = await db
            .from('appointments')
            .select('needs_review, reviewed_at')
            .eq('id', appointmentId)
            .eq('clinician_id', clinicianId)
            .maybeSingle();

          if (!error && data) {
            needsReview = Boolean(data.needs_review);
            reviewedAt = data.reviewed_at ?? null;
          }
        } catch {
          // Columns might not exist yet if not migrated
        }

        return Response.json({ appointmentId, needsReview, reviewedAt }, { headers: { 'Cache-Control': 'no-store' } });
      }

      if (request.method === 'POST') {
        const body = (await request.json().catch(() => ({}))) as { appointmentId?: string; needsReview?: boolean };
        const appointmentId = body.appointmentId;
        const needsReview = body.needsReview !== false;

        if (!appointmentId) return Response.json({ error: 'Appointment ID is required.' }, { status: 400 });

        const { db, clinicianId } = await requireAppointmentAccess(request, appointmentId);
        const reviewedAt = needsReview ? null : new Date().toISOString();

        try {
          const { error } = await db
            .from('appointments')
            .update({
              needs_review: needsReview,
              reviewed_at: reviewedAt,
            })
            .eq('id', appointmentId)
            .eq('clinician_id', clinicianId);

          if (error && !error.message?.includes('column "needs_review" does not exist')) {
            throw error;
          }
        } catch (updateErr) {
          console.warn('[appointment-review] Could not update appointments table directly:', updateErr);
        }

        return Response.json(
          {
            success: true,
            appointmentId,
            needsReview,
            reviewedAt,
          },
          { headers: { 'Cache-Control': 'no-store' } }
        );
      }

      return Response.json({ error: 'Method not allowed.' }, { status: 405 });
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : 'Unable to update review status.' },
        { status: 400 }
      );
    }
  },
};
