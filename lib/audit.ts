import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Audit recording must never block a clinician or patient from a safe action.
 * The table is created by the clinic-readiness migration; until that migration
 * is applied this helper intentionally becomes a no-op.
 */
export async function recordAuditEvent(
  db: SupabaseClient,
  input: { action: string; clinicianId?: string | null; appointmentId?: string | null; patientId?: string | null; metadata?: Record<string, unknown> },
) {
  try {
    await db.from('access_audit_events').insert({
      action: input.action,
      clinician_id: input.clinicianId ?? null,
      appointment_id: input.appointmentId ?? null,
      patient_id: input.patientId ?? null,
      metadata: input.metadata ?? {},
    });
  } catch {
    // Audit storage is a supporting control, never an availability dependency.
  }
}
