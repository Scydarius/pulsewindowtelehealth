-- Clinic-readiness controls: auditable patient consent and a restricted event log.
-- Apply this migration in the Supabase SQL editor before enabling a clinic pilot.

alter table public.appointments
  add column if not exists patient_consent_at timestamptz,
  add column if not exists patient_consent_version text;

-- Booking intake notes are presently stored alongside the appointment reason.
-- The original prototype limit (240 characters) would reject a normal patient
-- note, so make the storage limit match the validated UI limit.
alter table public.appointments drop constraint if exists appointments_reason_check;
alter table public.appointments
  add constraint appointments_reason_check check (char_length(reason) between 1 and 2400);

create table if not exists public.access_audit_events (
  id uuid primary key default gen_random_uuid(),
  action text not null check (char_length(action) between 1 and 120),
  clinician_id uuid references public.clinician_profiles(id) on delete set null,
  patient_id uuid references public.patients(id) on delete set null,
  appointment_id uuid references public.appointments(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists access_audit_events_appointment_created_idx
  on public.access_audit_events (appointment_id, created_at desc);
create index if not exists access_audit_events_clinician_created_idx
  on public.access_audit_events (clinician_id, created_at desc);

alter table public.access_audit_events enable row level security;
revoke all on public.access_audit_events from anon, authenticated;
