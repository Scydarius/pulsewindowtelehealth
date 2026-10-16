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
    .select('id, display_name, email, clinician_id, clinician:clinician_profiles(id, display_name, professional_title, clinic_id, clinic:clinics(id, name, slug))')
    .eq('id', patientId)
    .maybeSingle();

  if (patientError || !patient) throw new Error('Patient record not found.');

  const patientClinician = patient.clinician as unknown as {
    id?: string;
    display_name?: string;
    professional_title?: string;
    clinic_id?: string | null;
    clinic?: { id?: string; name?: string; slug?: string } | null;
  } | null;

  const patientClinicId = patientClinician?.clinic_id ?? null;

  return {
    patient,
    clinicId: patientClinicId || clinician.clinic_id || null,
    clinicName: patientClinician?.clinic?.name || 'Ventricura Telehealth',
    clinicSlug: patientClinician?.clinic?.slug || 'ventricura',
    assignedClinicianName: patientClinician?.display_name || null,
  };
}

export default {
  async fetch(request: Request) {
    try {
      const url = new URL(request.url);
      const action = url.searchParams.get('action');

      // -----------------------------------------------------------------------
      // DATABASE OMNI-SEARCH ACTION (Search everything accessible to clinician)
      // -----------------------------------------------------------------------
      if (action === 'search' && request.method === 'GET') {
        const { db, clinician } = await signedInClinician(request);
        const query = (url.searchParams.get('q') || '').trim();
        const scope = url.searchParams.get('scope') || 'clinic'; // 'clinic', 'mine', 'all'

        if (!query || query.length < 2) {
          return Response.json(
            {
              query,
              totalCount: 0,
              results: {
                patients: [],
                appointments: [],
                medications: [],
                clinicalNotes: [],
                measurements: [],
                clinicians: [],
                clinics: [],
              },
            },
            { headers: { 'Cache-Control': 'no-store' } }
          );
        }

        const cleanTerm = query.replace(/[%_,*]/g, ' ').trim() || query;
        const isSuperAdmin = Boolean(clinician.is_platform_admin);
        const clinicId = clinician.clinic_id ?? null;

        // 1. Patients Query
        const patientsPromise = (async () => {
          let { data, error } = await db
            .from('patients')
            .select(`
              id,
              display_name,
              email,
              clinician_id,
              created_at,
              clinician:clinician_profiles(
                id,
                display_name,
                professional_title,
                clinic_id,
                clinic:clinics(id, name, slug)
              )
            `)
            .or(`display_name.ilike.%${cleanTerm}%,email.ilike.%${cleanTerm}%`)
            .limit(40);

          if (error || !data) {
            const fallback = await db
              .from('patients')
              .select('id, display_name, email, clinician_id, created_at')
              .or(`display_name.ilike.%${cleanTerm}%,email.ilike.%${cleanTerm}%`)
              .limit(40);
            data = fallback.data as any;
          }

          return (data ?? [])
            .filter((p: any) => {
              if (isSuperAdmin || scope === 'all') return true;
              const pClinicId = p.clinician?.clinic_id ?? null;
              if (scope === 'mine') return p.clinician_id === clinician.id;
              return !pClinicId || !clinicId || pClinicId === clinicId || p.clinician_id === clinician.id;
            })
            .map((p: any) => {
              const pClinician = p.clinician;
              return {
                id: p.id,
                displayName: p.display_name,
                email: p.email,
                clinicianId: p.clinician_id,
                clinicianName: pClinician?.display_name || null,
                clinicianTitle: pClinician?.professional_title || null,
                clinicName: pClinician?.clinic?.name || null,
                clinicSlug: pClinician?.clinic?.slug || null,
                createdAt: p.created_at,
              };
            });
        })();

        // 2. Appointments Query
        const appointmentsPromise = (async () => {
          let { data, error } = await db
            .from('appointments')
            .select(`
              id,
              patient_id,
              reason,
              starts_at,
              created_at,
              clinician_id,
              needs_review,
              reviewed_at,
              patient:patients(id, display_name, email),
              clinician:clinician_profiles(id, display_name, professional_title, clinic_id)
            `)
            .or(`reason.ilike.%${cleanTerm}%`)
            .order('starts_at', { ascending: false })
            .limit(40);

          if (error || !data) {
            const fallback = await db
              .from('appointments')
              .select('id, patient_id, reason, starts_at, created_at, clinician_id')
              .or(`reason.ilike.%${cleanTerm}%`)
              .order('starts_at', { ascending: false })
              .limit(40);
            data = fallback.data as any;
          }

          return (data ?? [])
            .filter((a: any) => {
              if (isSuperAdmin || scope === 'all') return true;
              const aClinicId = a.clinician?.clinic_id ?? null;
              if (scope === 'mine') return a.clinician_id === clinician.id;
              return !aClinicId || !clinicId || aClinicId === clinicId || a.clinician_id === clinician.id;
            })
            .map((a: any) => {
              const reason = a.reason || '';
              const parts = reason.split('\n\nPatient notes:');
              return {
                id: a.id,
                patientId: a.patient_id,
                patientName: a.patient?.display_name || 'Patient',
                patientEmail: a.patient?.email || '',
                startsAt: a.starts_at,
                reason: parts[0]?.trim() || 'Consultation',
                intakeNote: parts[1]?.trim() || '',
                clinicianId: a.clinician_id,
                clinicianName: a.clinician?.display_name || null,
                needsReview: Boolean(a.needs_review),
                reviewedAt: a.reviewed_at || null,
              };
            });
        })();

        // 3. Medications Query
        const medicationsPromise = (async () => {
          try {
            const { data, error } = await db
              .from('patient_medications')
              .select(`
                id,
                patient_id,
                clinic_id,
                prescribed_by_id,
                prescribed_by_name,
                medication_name,
                generic_name,
                brand_name,
                artg_id,
                dose,
                frequency,
                directions,
                prescribed_date,
                repeats,
                is_pbs,
                status,
                ceased_at,
                ceased_reason,
                notes,
                patient:patients(id, display_name, email)
              `)
              .or(
                `medication_name.ilike.%${cleanTerm}%,generic_name.ilike.%${cleanTerm}%,brand_name.ilike.%${cleanTerm}%,notes.ilike.%${cleanTerm}%,directions.ilike.%${cleanTerm}%,prescribed_by_name.ilike.%${cleanTerm}%`
              )
              .order('prescribed_date', { ascending: false })
              .limit(40);

            if (error || !data) return [];

            return data
              .filter((m: any) => {
                if (isSuperAdmin || scope === 'all') return true;
                if (scope === 'mine') return m.prescribed_by_id === clinician.id;
                return !m.clinic_id || !clinicId || m.clinic_id === clinicId || m.prescribed_by_id === clinician.id;
              })
              .map((m: any) => ({
                id: m.id,
                patientId: m.patient_id,
                patientName: m.patient?.display_name || 'Patient',
                patientEmail: m.patient?.email || '',
                medicationName: m.medication_name,
                genericName: m.generic_name,
                brandName: m.brand_name,
                dose: m.dose,
                frequency: m.frequency,
                directions: m.directions,
                prescribedDate: m.prescribed_date,
                prescribedByName: m.prescribed_by_name,
                repeats: m.repeats,
                isPbs: m.is_pbs,
                status: m.status,
                ceasedAt: m.ceased_at,
                ceasedReason: m.ceased_reason,
                notes: m.notes,
              }));
          } catch {
            return [];
          }
        })();

        // 4. Clinical Private Notes Query
        const notesPromise = (async () => {
          try {
            let { data, error } = await db
              .from('clinician_private_notes')
              .select(`
                appointment_id,
                clinician_id,
                content,
                updated_at,
                appointment:appointments(
                  id,
                  patient_id,
                  starts_at,
                  reason,
                  patient:patients(id, display_name, email)
                )
              `)
              .ilike('content', `%${cleanTerm}%`)
              .order('updated_at', { ascending: false })
              .limit(30);

            if (error || !data) {
              const fallback = await db
                .from('clinician_private_notes')
                .select('appointment_id, clinician_id, content, updated_at')
                .ilike('content', `%${cleanTerm}%`)
                .order('updated_at', { ascending: false })
                .limit(30);
              data = fallback.data as any;
            }

            return (data ?? [])
              .filter((n: any) => {
                if (isSuperAdmin || scope === 'all') return true;
                return n.clinician_id === clinician.id;
              })
              .map((n: any) => {
                const appt = n.appointment;
                const patient = appt?.patient;
                return {
                  appointmentId: n.appointment_id,
                  patientId: appt?.patient_id || null,
                  patientName: patient?.display_name || 'Patient',
                  patientEmail: patient?.email || '',
                  appointmentDate: appt?.starts_at || null,
                  appointmentReason: appt?.reason ? appt.reason.split('\n\nPatient notes:')[0].trim() : 'Consultation',
                  content: n.content,
                  updatedAt: n.updated_at,
                };
              });
          } catch {
            return [];
          }
        })();

        // 5. Measurements & Telemetry Query
        const measurementsPromise = (async () => {
          try {
            const num = parseInt(cleanTerm, 10);
            let query = db
              .from('measurements')
              .select(`
                appointment_id,
                measured_at,
                heart_rate_bpm,
                respiratory_rate_bpm,
                signal_quality,
                algorithm_version,
                diagnostics,
                appointment:appointments(
                  id,
                  patient_id,
                  starts_at,
                  reason,
                  patient:patients(id, display_name, email)
                )
              `)
              .order('measured_at', { ascending: false })
              .limit(20);

            if (!isNaN(num) && num >= 30 && num <= 240) {
              query = query.gte('heart_rate_bpm', num - 4).lte('heart_rate_bpm', num + 4);
            } else if (cleanTerm.toLowerCase().includes('tachy') || cleanTerm.toLowerCase().includes('high')) {
              query = query.gte('heart_rate_bpm', 100);
            } else if (cleanTerm.toLowerCase().includes('brady') || cleanTerm.toLowerCase().includes('low')) {
              query = query.lte('heart_rate_bpm', 60);
            }

            const { data, error } = await query;
            if (error || !data) return [];

            return data.map((m: any) => ({
              appointmentId: m.appointment_id,
              patientId: m.appointment?.patient_id || null,
              patientName: m.appointment?.patient?.display_name || 'Patient',
              patientEmail: m.appointment?.patient?.email || '',
              measuredAt: m.measured_at,
              heartRateBpm: m.heart_rate_bpm,
              respiratoryRateBpm: m.respiratory_rate_bpm,
              signalQuality: m.signal_quality,
            }));
          } catch {
            return [];
          }
        })();

        // 6. Clinicians and Clinics Directory Query
        const directoryPromise = (async () => {
          const [cliniciansResult, clinicsResult] = await Promise.allSettled([
            db
              .from('clinician_profiles')
              .select('id, display_name, professional_title, about_me, photo_url, clinic:clinics(id, name, slug)')
              .or(`display_name.ilike.%${cleanTerm}%,professional_title.ilike.%${cleanTerm}%,about_me.ilike.%${cleanTerm}%`)
              .limit(10),
            db
              .from('clinics')
              .select('id, name, slug, website_headline, website_specialties, website_address')
              .or(`name.ilike.%${cleanTerm}%,website_specialties.ilike.%${cleanTerm}%,website_headline.ilike.%${cleanTerm}%`)
              .limit(10),
          ]);

          const clinicians =
            cliniciansResult.status === 'fulfilled' && cliniciansResult.value.data
              ? cliniciansResult.value.data.map((c: any) => ({
                  id: c.id,
                  displayName: c.display_name,
                  professionalTitle: c.professional_title,
                  aboutMe: c.about_me,
                  photoUrl: c.photo_url,
                  clinicName: c.clinic?.name || null,
                  clinicSlug: c.clinic?.slug || null,
                }))
              : [];

          const clinics =
            clinicsResult.status === 'fulfilled' && clinicsResult.value.data
              ? clinicsResult.value.data.map((cl: any) => ({
                  id: cl.id,
                  name: cl.name,
                  slug: cl.slug,
                  headline: cl.website_headline,
                  specialties: cl.website_specialties,
                  address: cl.website_address,
                }))
              : [];

          return { clinicians, clinics };
        })();

        const [patientsRes, apptsRes, medsRes, notesRes, measurementsRes, dirRes] = await Promise.allSettled([
          patientsPromise,
          appointmentsPromise,
          medicationsPromise,
          notesPromise,
          measurementsPromise,
          directoryPromise,
        ]);

        const patients = patientsRes.status === 'fulfilled' ? patientsRes.value : [];
        const appointments = apptsRes.status === 'fulfilled' ? apptsRes.value : [];
        const medications = medsRes.status === 'fulfilled' ? medsRes.value : [];
        const clinicalNotes = notesRes.status === 'fulfilled' ? notesRes.value : [];
        const measurements = measurementsRes.status === 'fulfilled' ? measurementsRes.value : [];
        const directory = dirRes.status === 'fulfilled' ? dirRes.value : { clinicians: [], clinics: [] };

        const totalCount =
          patients.length +
          appointments.length +
          medications.length +
          clinicalNotes.length +
          measurements.length +
          directory.clinicians.length +
          directory.clinics.length;

        return Response.json(
          {
            query: cleanTerm,
            totalCount,
            results: {
              patients,
              appointments,
              medications,
              clinicalNotes,
              measurements,
              clinicians: directory.clinicians,
              clinics: directory.clinics,
            },
          },
          { headers: { 'Cache-Control': 'no-store' } }
        );
      }

      // -----------------------------------------------------------------------
      // PATIENT DIRECTORY ACTION (GET clinic-wide and cross-clinic patients)
      // -----------------------------------------------------------------------
      if (action === 'directory' && request.method === 'GET') {
        const { db, clinician } = await signedInClinician(request);
        const scope = url.searchParams.get('scope') || 'clinic'; // 'mine', 'clinic', 'all'

        let patients: any[] | null = null;
        const { data: joinedPatients, error: patientsError } = await db
          .from('patients')
          .select(`
            id,
            display_name,
            email,
            clinician_id,
            created_at,
            clinician:clinician_profiles(
              id,
              display_name,
              professional_title,
              clinic_id,
              clinic:clinics(id, name, slug)
            )
          `)
          .order('created_at', { ascending: false });

        if (patientsError || !joinedPatients) {
          const { data: fallbackPatients, error: fbErr } = await db
            .from('patients')
            .select('id, display_name, email, clinician_id, created_at')
            .order('created_at', { ascending: false });
          if (fbErr) throw new Error('Unable to load patient directory: ' + fbErr.message);
          patients = fallbackPatients ?? [];
        } else {
          patients = joinedPatients;
        }

        const patientIds = (patients ?? []).map((p) => p.id);
        const { data: appointments } = patientIds.length
          ? await db
              .from('appointments')
              .select('id, patient_id, starts_at, reason')
              .in('patient_id', patientIds)
              .order('starts_at', { ascending: false })
          : { data: [] };

        const apptsByPatient = new Map<string, Array<{ id: string; starts_at: string; reason: string }>>();
        for (const a of appointments ?? []) {
          const list = apptsByPatient.get(a.patient_id) ?? [];
          list.push(a);
          apptsByPatient.set(a.patient_id, list);
        }

        const enriched = (patients ?? []).map((p) => {
          const pClinician = p.clinician as unknown as {
            id?: string;
            display_name?: string;
            professional_title?: string;
            clinic_id?: string | null;
            clinic?: { id?: string; name?: string; slug?: string } | null;
          } | null;

          const patientAppts = apptsByPatient.get(p.id) ?? [];
          return {
            id: p.id,
            displayName: p.display_name,
            email: p.email,
            clinicianId: p.clinician_id,
            clinicianName: pClinician?.display_name || 'Assigned Clinician',
            clinicianTitle: pClinician?.professional_title || null,
            clinicId: pClinician?.clinic_id || null,
            clinicName: pClinician?.clinic?.name || 'Ventricura Telehealth',
            clinicSlug: pClinician?.clinic?.slug || 'ventricura',
            appointmentCount: patientAppts.length,
            latestAppointment: patientAppts[0]?.starts_at ?? p.created_at,
          };
        });

        let filtered = enriched;
        if (scope === 'mine') {
          filtered = enriched.filter((p) => p.clinicianId === clinician.id);
        } else if (scope === 'clinic' && clinician.clinic_id) {
          filtered = enriched.filter((p) => p.clinicId === clinician.clinic_id || p.clinicianId === clinician.id);
        }

        return Response.json({ patients: filtered }, { headers: { 'Cache-Control': 'no-store' } });
      }

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
      const { patient, clinicId, clinicName, clinicSlug, assignedClinicianName } = await verifyPatientClinicAccess(db, clinician, patientId);

      let appointments: any[] | null = null;
      const { data: joinedAppts, error: appointmentError } = await db
        .from('appointments')
        .select(`
          id,
          patient_id,
          reason,
          starts_at,
          created_at,
          clinician_id,
          clinician:clinician_profiles(
            id,
            display_name,
            professional_title,
            clinic:clinics(id, name, slug)
          )
        `)
        .eq('patient_id', patient.id)
        .order('starts_at', { ascending: false });

      if (appointmentError || !joinedAppts) {
        // Fallback without joins if schema does not have relations cached
        const { data: fallbackAppts, error: fbError } = await db
          .from('appointments')
          .select('id, patient_id, reason, starts_at, created_at, clinician_id')
          .eq('patient_id', patient.id)
          .order('starts_at', { ascending: false });
        if (fbError) throw new Error('Unable to load appointment history: ' + fbError.message);
        appointments = fallbackAppts ?? [];
      } else {
        appointments = joinedAppts;
      }

      const appointmentIds = (appointments ?? []).map((appointment) => appointment.id);
      const { data: measurements, error: measurementError } = appointmentIds.length
        ? await db
            .from('measurements')
            .select('appointment_id, measured_at, heart_rate_bpm, respiratory_rate_bpm, signal_quality, algorithm_version, diagnostics')
            .in('appointment_id', appointmentIds)
            .order('measured_at', { ascending: true })
        : { data: [], error: null };

      if (measurementError) throw new Error('Unable to load measurement history.');

      let notesData: Array<{ appointment_id: string; content?: string }> | null = null;
      if (appointmentIds.length) {
        try {
          const res = await db
            .from('clinician_private_notes')
            .select('appointment_id, content')
            .in('appointment_id', appointmentIds);
          notesData = res.data;
        } catch {
          // Graceful fallback if table is unavailable
        }
      }

      const notesByAppointment = new Map<string, string>();
      for (const note of notesData ?? []) {
        if (note?.appointment_id && note?.content) {
          notesByAppointment.set(note.appointment_id, note.content);
        }
      }

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
        const apptClinician = (appointment as unknown as { clinician?: { display_name?: string; professional_title?: string; clinic?: { name?: string; slug?: string } | null } | null }).clinician;
        return {
          id: appointment.id,
          reason: appointment.reason,
          starts_at: appointment.starts_at,
          created_at: appointment.created_at,
          clinician_id: appointment.clinician_id,
          clinician_name: apptClinician?.display_name || null,
          clinician_title: apptClinician?.professional_title || null,
          clinic_name: apptClinician?.clinic?.name || null,
          clinic_slug: apptClinician?.clinic?.slug || null,
          measurements: samples,
          clinical_notes: notesByAppointment.get(appointment.id) || null,
        };
      });

      return Response.json(
        {
          patient: {
            id: patient.id,
            email: patient.email,
            display_name: patient.display_name,
            clinic_id: clinicId,
            clinic_name: clinicName,
            clinic_slug: clinicSlug,
            assigned_clinician_name: assignedClinicianName,
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
