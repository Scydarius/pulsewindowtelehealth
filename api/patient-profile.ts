import { createClient } from '@supabase/supabase-js';

function database() {
  const url = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error('The clinical database is not configured.');
  return createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

function isMissingTableError(error: { message?: string; code?: string } | null | undefined): boolean {
  if (!error) return false;
  const msg = (error.message || '').toLowerCase();
  const code = error.code || '';
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    msg.includes('schema cache') ||
    msg.includes('does not exist') ||
    msg.includes('patient_medications')
  );
}

async function signedInClinician(request: Request) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) throw new Error('Sign in is required.');
  const db = database();
  const { data: userData, error: userError } = await db.auth.getUser(token);
  if (userError || !userData.user) throw new Error('Your sign-in session is invalid.');

  const { data: clinician, error: clinicianError } = await db
    .from('clinician_profiles')
    .select('id, display_name, clinic_id, is_admin, is_platform_admin')
    .eq('id', userData.user.id)
    .maybeSingle();

  if (clinicianError || !clinician) throw new Error('This account is not an authorised clinician.');
  return { db, clinician, user: userData.user };
}

async function verifyPatientClinicAccess(
  db: ReturnType<typeof database>,
  clinician: { id: string; clinic_id?: string | null; is_platform_admin?: boolean },
  patientId: string
) {
  const { data: patient, error: patientError } = await db
    .from('patients')
    .select('id, display_name, email, clinician_id, clinician:clinician_profiles(clinic_id)')
    .eq('id', patientId)
    .maybeSingle();

  if (patientError || !patient) throw new Error('Patient record not found.');

  // Access permitted if clinician is assigned doctor, platform admin, or shares the same clinic
  const patientClinicId = (patient.clinician as unknown as { clinic_id?: string | null } | null)?.clinic_id ?? null;
  const isAuthorised =
    clinician.is_platform_admin ||
    patient.clinician_id === clinician.id ||
    (Boolean(clinician.clinic_id) && clinician.clinic_id === patientClinicId);

  if (!isAuthorised) {
    throw new Error('You do not have permission to view or manage records for this patient.');
  }

  return { patient, clinicId: patientClinicId || clinician.clinic_id || null };
}

export default {
  async fetch(request: Request) {
    try {
      const url = new URL(request.url);
      const action = url.searchParams.get('action');

      // -----------------------------------------------------------------------
      // MEDICATIONS ACTION DISPATCH (GET, POST, PATCH, DELETE)
      // -----------------------------------------------------------------------
      if (action === 'medications' || request.method === 'POST' || request.method === 'PATCH' || request.method === 'DELETE') {
        const { db, clinician } = await signedInClinician(request);

        // GET /api/patient-profile?action=medications&patientId=...
        if (request.method === 'GET') {
          const patientId = url.searchParams.get('patientId')?.trim();
          if (!patientId) throw new Error('Patient ID is required.');
          await verifyPatientClinicAccess(db, clinician, patientId);

          const { data: medications, error } = await db
            .from('patient_medications')
            .select('*')
            .eq('patient_id', patientId)
            .order('status', { ascending: true }) // 'active' before 'ceased'
            .order('prescribed_date', { ascending: false });

          if (error) {
            if (isMissingTableError(error)) {
              return Response.json({ medications: [], tablePending: true }, { headers: { 'Cache-Control': 'no-store' } });
            }
            throw new Error('Unable to load patient medications: ' + error.message);
          }

          return Response.json({ medications: medications ?? [], tablePending: false }, { headers: { 'Cache-Control': 'no-store' } });
        }

        // POST /api/patient-profile?action=medications (Prescribe / Assign medication)
        if (request.method === 'POST') {
          const body = (await request.json().catch(() => ({}))) as {
            patientId?: string;
            medicationName?: string;
            genericName?: string;
            brandName?: string;
            artgId?: string;
            dose?: string;
            frequency?: string;
            directions?: string;
            prescribedDate?: string;
            repeats?: number;
            isPbs?: boolean;
            notes?: string;
          };

          if (!body.patientId?.trim()) throw new Error('Patient ID is required.');
          if (!body.medicationName?.trim()) throw new Error('Medication name is required.');
          if (!body.dose?.trim()) throw new Error('Dosage is required (e.g. 20 mg).');
          if (!body.frequency?.trim()) throw new Error('Frequency is required (e.g. Once daily).');

          const { clinicId } = await verifyPatientClinicAccess(db, clinician, body.patientId);

          const prescribedDate = body.prescribedDate?.trim() || new Date().toISOString().split('T')[0];
          const repeats = typeof body.repeats === 'number' && body.repeats >= 0 ? body.repeats : 0;
          const isPbs = body.isPbs !== false;

          const newRecord = {
            patient_id: body.patientId,
            clinic_id: clinicId,
            prescribed_by_id: clinician.id,
            prescribed_by_name: clinician.display_name,
            medication_name: body.medicationName.trim().slice(0, 240),
            generic_name: body.genericName?.trim().slice(0, 240) || null,
            brand_name: body.brandName?.trim().slice(0, 160) || null,
            artg_id: body.artgId?.trim().slice(0, 80) || null,
            dose: body.dose.trim().slice(0, 120),
            frequency: body.frequency.trim().slice(0, 160),
            directions: body.directions?.trim().slice(0, 600) || null,
            prescribed_date: prescribedDate,
            repeats,
            is_pbs: isPbs,
            status: 'active' as const,
            notes: body.notes?.trim().slice(0, 500) || null,
            updated_at: new Date().toISOString(),
          };

          const { data: created, error } = await db
            .from('patient_medications')
            .insert(newRecord)
            .select('*')
            .single();

          if (error) {
            // Gracefully support local fallback if Supabase table is not yet created
            if (isMissingTableError(error)) {
              const fallbackRecord = {
                ...newRecord,
                id: 'local_' + crypto.randomUUID(),
                created_at: new Date().toISOString(),
              };
              return Response.json(
                {
                  medication: fallbackRecord,
                  tablePending: true,
                  message: 'Recorded with local storage. Run Supabase SQL migration to enable shared cloud sync.',
                },
                { status: 200, headers: { 'Cache-Control': 'no-store' } }
              );
            }
            throw new Error('Unable to record prescription: ' + error.message);
          }

          return Response.json(
            { medication: created, tablePending: false, message: 'Medication prescribed successfully.' },
            { status: 201, headers: { 'Cache-Control': 'no-store' } }
          );
        }

        // PATCH /api/patient-profile?action=medications (Cease, renew, or update medication)
        if (request.method === 'PATCH') {
          const body = (await request.json().catch(() => ({}))) as {
            medicationId?: string;
            action?: 'cease' | 'renew' | 'update';
            ceasedReason?: string;
            dose?: string;
            frequency?: string;
            directions?: string;
            repeats?: number;
            isPbs?: boolean;
            notes?: string;
          };

          if (!body.medicationId?.trim()) throw new Error('Medication ID is required.');

          // If local ID, return success with local flag
          if (body.medicationId.startsWith('local_')) {
            return Response.json(
              {
                medication: {
                  id: body.medicationId,
                  status: body.action === 'cease' ? 'ceased' : 'active',
                  ceased_at: body.action === 'cease' ? new Date().toISOString() : null,
                  ceased_reason: body.ceasedReason || null,
                  updated_at: new Date().toISOString(),
                },
                tablePending: true,
                message: 'Medication updated locally.',
              },
              { headers: { 'Cache-Control': 'no-store' } }
            );
          }

          const { data: existing, error: findError } = await db
            .from('patient_medications')
            .select('*')
            .eq('id', body.medicationId)
            .single();

          if (findError) {
            if (isMissingTableError(findError)) {
              return Response.json(
                {
                  medication: {
                    id: body.medicationId,
                    status: body.action === 'cease' ? 'ceased' : 'active',
                    ceased_at: body.action === 'cease' ? new Date().toISOString() : null,
                    ceased_reason: body.ceasedReason || null,
                    updated_at: new Date().toISOString(),
                  },
                  tablePending: true,
                  message: 'Medication updated locally.',
                },
                { headers: { 'Cache-Control': 'no-store' } }
              );
            }
            throw new Error('Medication record not found.');
          }

          if (!existing) throw new Error('Medication record not found.');
          await verifyPatientClinicAccess(db, clinician, existing.patient_id);

          const updates: Record<string, unknown> = {
            updated_at: new Date().toISOString(),
          };

          if (body.action === 'cease') {
            updates.status = 'ceased';
            updates.ceased_at = new Date().toISOString();
            updates.ceased_reason = body.ceasedReason?.trim().slice(0, 300) || 'Ceased by clinician';
          } else if (body.action === 'renew') {
            updates.status = 'active';
            updates.ceased_at = null;
            updates.ceased_reason = null;
            updates.prescribed_date = new Date().toISOString().split('T')[0];
            if (typeof body.repeats === 'number') updates.repeats = body.repeats;
          } else {
            if (body.dose?.trim()) updates.dose = body.dose.trim().slice(0, 120);
            if (body.frequency?.trim()) updates.frequency = body.frequency.trim().slice(0, 160);
            if (body.directions !== undefined) updates.directions = body.directions?.trim().slice(0, 600) || null;
            if (typeof body.repeats === 'number') updates.repeats = body.repeats;
            if (typeof body.isPbs === 'boolean') updates.is_pbs = body.isPbs;
            if (body.notes !== undefined) updates.notes = body.notes?.trim().slice(0, 500) || null;
          }

          const { data: updated, error: updateError } = await db
            .from('patient_medications')
            .update(updates)
            .eq('id', body.medicationId)
            .select('*')
            .single();

          if (updateError) {
            throw new Error('Unable to update medication: ' + updateError.message);
          }

          return Response.json(
            { medication: updated, tablePending: false, message: 'Medication updated successfully.' },
            { headers: { 'Cache-Control': 'no-store' } }
          );
        }

        // DELETE /api/patient-profile?action=medications (Remove medication record)
        if (request.method === 'DELETE') {
          const body = (await request.json().catch(() => ({}))) as { medicationId?: string };
          if (!body.medicationId?.trim()) throw new Error('Medication ID is required.');

          if (body.medicationId.startsWith('local_')) {
            return Response.json({ success: true, tablePending: true, message: 'Medication removed locally.' }, { headers: { 'Cache-Control': 'no-store' } });
          }

          const { data: existing, error: findError } = await db
            .from('patient_medications')
            .select('patient_id')
            .eq('id', body.medicationId)
            .single();

          if (findError) {
            if (isMissingTableError(findError)) {
              return Response.json({ success: true, tablePending: true, message: 'Medication removed.' }, { headers: { 'Cache-Control': 'no-store' } });
            }
            throw new Error('Medication record not found.');
          }

          if (!existing) throw new Error('Medication record not found.');
          await verifyPatientClinicAccess(db, clinician, existing.patient_id);

          const { error: deleteError } = await db
            .from('patient_medications')
            .delete()
            .eq('id', body.medicationId);

          if (deleteError) {
            throw new Error('Unable to delete medication record: ' + deleteError.message);
          }

          return Response.json({ success: true, message: 'Medication removed.' }, { headers: { 'Cache-Control': 'no-store' } });
        }
      }

      // -----------------------------------------------------------------------
      // PATIENT PROFILE ACTION (GET full patient profile)
      // -----------------------------------------------------------------------
      if (request.method !== 'GET') {
        return Response.json({ error: 'Method not allowed' }, { status: 405 });
      }

      const patientId = url.searchParams.get('patientId')?.trim();
      const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
      if (!patientId || !token) throw new Error('A clinician sign-in and patient record are required.');

      const { db, clinician } = await signedInClinician(request);
      const { patient } = await verifyPatientClinicAccess(db, clinician, patientId);

      const { data: appointments, error: appointmentError } = await db
        .from('appointments')
        .select('id, patient_id, reason, starts_at, created_at')
        .eq('patient_id', patient.id)
        .order('starts_at', { ascending: false });

      if (appointmentError) throw new Error('Unable to load appointment history.');

      const appointmentIds = (appointments ?? []).map((appointment) => appointment.id);
      const { data: measurements, error: measurementError } = appointmentIds.length
        ? await db
            .from('measurements')
            .select('appointment_id, measured_at, heart_rate_bpm, respiratory_rate_bpm, signal_quality, algorithm_version, diagnostics')
            .in('appointment_id', appointmentIds)
            .order('measured_at', { ascending: true })
        : { data: [], error: null };

      if (measurementError) throw new Error('Unable to load measurement history.');

      let medications: unknown[] = [];
      let tablePending = false;
      try {
        const { data: medsData, error: medsError } = await db
          .from('patient_medications')
          .select('*')
          .eq('patient_id', patient.id)
          .order('status', { ascending: true })
          .order('prescribed_date', { ascending: false });
        if (medsData) {
          medications = medsData;
        } else if (isMissingTableError(medsError)) {
          tablePending = true;
        }
      } catch {
        tablePending = true;
      }

      const samplesByAppointment = new Map<string, typeof measurements>();
      for (const measurement of measurements ?? []) {
        const samples = samplesByAppointment.get(measurement.appointment_id) ?? [];
        samples.push(measurement);
        samplesByAppointment.set(measurement.appointment_id, samples);
      }

      const history = (appointments ?? []).map((appointment) => {
        const samples = samplesByAppointment.get(appointment.id) ?? [];
        return {
          id: appointment.id,
          reason: appointment.reason,
          starts_at: appointment.starts_at,
          created_at: appointment.created_at,
          measurements: samples,
        };
      });

      return Response.json(
        {
          patient: {
            id: patient.id,
            email: patient.email,
            display_name: patient.display_name,
            appointments: history,
            medications,
            tablePending,
          },
        },
        { headers: { 'Cache-Control': 'no-store' } }
      );
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : 'Unable to complete request.' },
        { status: 400 }
      );
    }
  },
};
