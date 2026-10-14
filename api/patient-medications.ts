import { createClient } from '@supabase/supabase-js';

type VercelRequest = {
  method?: string;
  body?: unknown;
  headers: Record<string, string | string[] | undefined>;
  query?: Record<string, string | string[] | undefined>;
};
type VercelResponse = { status: (code: number) => { json: (body: unknown) => void } };

function database() {
  const url = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error('The clinical database is not configured.');
  return createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
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
    throw new Error('You do not have permission to view or prescribe medications for this patient.');
  }

  return { patient, clinicId: patientClinicId || clinician.clinic_id || null };
}

async function handle(request: Request) {
  try {
    const url = new URL(request.url);

    // GET /api/patient-medications?patientId=...
    if (request.method === 'GET') {
      const patientId = url.searchParams.get('patientId')?.trim();
      if (!patientId) throw new Error('Patient ID is required.');

      const { db, clinician } = await signedInClinician(request);
      await verifyPatientClinicAccess(db, clinician, patientId);

      const { data: medications, error } = await db
        .from('patient_medications')
        .select('*')
        .eq('patient_id', patientId)
        .order('status', { ascending: true }) // 'active' comes before 'ceased'
        .order('prescribed_date', { ascending: false });

      if (error) {
        // If the table is not yet created, return empty array gracefully
        if (error.message?.includes('relation "public.patient_medications" does not exist') || error.code === '42P01') {
          return Response.json({ medications: [] }, { headers: { 'Cache-Control': 'no-store' } });
        }
        throw new Error('Unable to load patient medications: ' + error.message);
      }

      return Response.json({ medications: medications ?? [] }, { headers: { 'Cache-Control': 'no-store' } });
    }

    // POST /api/patient-medications (Prescribe / Assign medication)
    if (request.method === 'POST') {
      const { db, clinician } = await signedInClinician(request);
      const body = (await request.json()) as {
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
      const isPbs = body.isPbs !== false; // default true for Australian PBS prescriptions

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
        status: 'active',
        notes: body.notes?.trim().slice(0, 500) || null,
        updated_at: new Date().toISOString(),
      };

      const { data: created, error } = await db
        .from('patient_medications')
        .insert(newRecord)
        .select('*')
        .single();

      if (error) {
        throw new Error('Unable to record prescription: ' + error.message);
      }

      return Response.json(
        { message: `${body.medicationName} prescribed and saved to patient record.`, medication: created },
        { headers: { 'Cache-Control': 'no-store' } }
      );
    }

    // PATCH /api/patient-medications (Cease, Renew, or Update Directions)
    if (request.method === 'PATCH') {
      const { db, clinician } = await signedInClinician(request);
      const body = (await request.json()) as {
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

      const { data: existing, error: findError } = await db
        .from('patient_medications')
        .select('*')
        .eq('id', body.medicationId)
        .maybeSingle();

      if (findError || !existing) throw new Error('Medication record not found.');
      await verifyPatientClinicAccess(db, clinician, existing.patient_id);

      const updateData: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };

      if (body.action === 'cease') {
        updateData.status = 'ceased';
        updateData.ceased_at = new Date().toISOString();
        updateData.ceased_reason = body.ceasedReason?.trim() || `Ceased by ${clinician.display_name}`;
      } else if (body.action === 'renew') {
        updateData.status = 'active';
        updateData.prescribed_date = new Date().toISOString().split('T')[0];
        updateData.prescribed_by_id = clinician.id;
        updateData.prescribed_by_name = clinician.display_name;
        if (typeof body.repeats === 'number') updateData.repeats = body.repeats;
        updateData.ceased_at = null;
        updateData.ceased_reason = null;
      } else {
        // General updates
        if (body.dose !== undefined) updateData.dose = body.dose.trim().slice(0, 120);
        if (body.frequency !== undefined) updateData.frequency = body.frequency.trim().slice(0, 160);
        if (body.directions !== undefined) updateData.directions = body.directions.trim().slice(0, 600) || null;
        if (body.repeats !== undefined) updateData.repeats = Math.max(0, body.repeats);
        if (body.isPbs !== undefined) updateData.is_pbs = Boolean(body.isPbs);
        if (body.notes !== undefined) updateData.notes = body.notes.trim().slice(0, 500) || null;
      }

      const { data: updated, error: updateError } = await db
        .from('patient_medications')
        .update(updateData)
        .eq('id', body.medicationId)
        .select('*')
        .single();

      if (updateError) throw new Error('Unable to update medication: ' + updateError.message);

      const actionMessage =
        body.action === 'cease'
          ? 'Medication marked as ceased.'
          : body.action === 'renew'
          ? 'Medication prescription renewed.'
          : 'Medication details updated.';

      return Response.json({ message: actionMessage, medication: updated });
    }

    // DELETE /api/patient-medications (Remove accidental entry)
    if (request.method === 'DELETE') {
      const { db, clinician } = await signedInClinician(request);
      const body = (await request.json()) as { medicationId?: string };
      if (!body.medicationId?.trim()) throw new Error('Medication ID is required.');

      const { data: existing, error: findError } = await db
        .from('patient_medications')
        .select('id, patient_id')
        .eq('id', body.medicationId)
        .maybeSingle();

      if (findError || !existing) throw new Error('Medication record not found.');
      await verifyPatientClinicAccess(db, clinician, existing.patient_id);

      const { error: deleteError } = await db.from('patient_medications').delete().eq('id', body.medicationId);
      if (deleteError) throw new Error('Unable to remove medication record: ' + deleteError.message);

      return Response.json({ message: 'Medication removed from patient record.' });
    }

    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Unable to process medication request.' },
      { status: 400 }
    );
  }
}

export default async function patientMedications(request: VercelRequest, response: VercelResponse) {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (value) headers.set(name, Array.isArray(value) ? value[0] : value);
  }
  const host = Array.isArray(request.headers.host) ? request.headers.host[0] : request.headers.host;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(request.query ?? {})) {
    if (value) query.set(key, Array.isArray(value) ? value[0] : value);
  }
  const method = request.method ?? 'GET';
  const req = new Request(`https://${host ?? 'www.ventricura.com'}/api/patient-medications${query.size ? `?${query}` : ''}`, {
    method,
    headers,
    body: method === 'GET' ? undefined : JSON.stringify(request.body ?? {}),
  });
  const res = await handle(req);
  const data = await res.json().catch(() => ({ error: 'Service unavailable' }));
  return response.status(res.status).json(data);
}
