-- PulseWindow clinical prototype schema.
-- Apply in a new Supabase project before configuring Vercel environment values.
-- Do not place real patient data in the demo tables until the service has passed
-- the team's privacy, security, clinical-governance and legal review.

create extension if not exists pgcrypto;

create table public.clinician_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 120),
  created_at timestamptz not null default now()
);

create table public.patients (
  id uuid primary key default gen_random_uuid(),
  clinician_id uuid not null references public.clinician_profiles(id) on delete restrict,
  display_name text not null check (char_length(display_name) between 1 and 120),
  email text not null check (char_length(email) between 3 and 320),
  created_at timestamptz not null default now()
);

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  clinician_id uuid not null references public.clinician_profiles(id) on delete restrict,
  patient_id uuid not null references public.patients(id) on delete restrict,
  room_name text not null unique check (room_name ~ '^[A-Za-z0-9_-]{1,80}$'),
  reason text not null check (char_length(reason) between 1 and 240),
  starts_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table public.patient_invites (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.measurements (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete restrict,
  measured_at timestamptz not null default now(),
  heart_rate_bpm numeric,
  respiratory_rate_bpm numeric,
  signal_quality numeric,
  algorithm_version text,
  is_research_prototype boolean not null default true
);

create index appointments_clinician_id_idx on public.appointments(clinician_id);
create index measurements_appointment_id_idx on public.measurements(appointment_id, measured_at desc);

alter table public.clinician_profiles enable row level security;
alter table public.patients enable row level security;
alter table public.appointments enable row level security;
alter table public.patient_invites enable row level security;
alter table public.measurements enable row level security;

revoke all on public.clinician_profiles, public.patients, public.appointments, public.patient_invites, public.measurements from anon, authenticated;
grant select on public.clinician_profiles, public.patients, public.appointments, public.measurements to authenticated;

create policy "clinicians read their profile" on public.clinician_profiles for select to authenticated
  using ((select auth.uid()) = id);
create policy "clinicians read their patients" on public.patients for select to authenticated
  using ((select auth.uid()) = clinician_id);
create policy "clinicians read their appointments" on public.appointments for select to authenticated
  using ((select auth.uid()) = clinician_id);
create policy "clinicians read their measurements" on public.measurements for select to authenticated
  using (exists (select 1 from public.appointments a where a.id = appointment_id and a.clinician_id = (select auth.uid())));

-- Invitations and all writes are deliberately server-only. The service-role key
-- bypasses RLS, so it must only ever be used by Vercel server functions.
