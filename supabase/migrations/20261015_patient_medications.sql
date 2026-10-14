-- Australian Prescribing and Patient Medications Table
-- Supports ARTG-indexed or custom medications prescribed to patients across clinic doctors.

create table if not exists public.patient_medications (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  clinic_id uuid references public.clinics(id) on delete cascade,
  prescribed_by_id uuid references public.clinician_profiles(id) on delete set null,
  prescribed_by_name text not null check (char_length(prescribed_by_name) between 1 and 160),
  medication_name text not null check (char_length(medication_name) between 1 and 240),
  generic_name text,
  brand_name text,
  artg_id text,
  dose text not null check (char_length(dose) between 1 and 120),
  frequency text not null check (char_length(frequency) between 1 and 160),
  directions text,
  prescribed_date date not null default current_date,
  repeats integer not null default 0 check (repeats >= 0),
  is_pbs boolean not null default true,
  status text not null default 'active' check (status in ('active', 'ceased', 'completed')),
  ceased_at timestamptz,
  ceased_reason text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_patient_medications_patient_id on public.patient_medications(patient_id);
create index if not exists idx_patient_medications_clinic_id on public.patient_medications(clinic_id);
create index if not exists idx_patient_medications_status on public.patient_medications(status);

alter table public.patient_medications enable row level security;
grant select, insert, update, delete on public.patient_medications to authenticated;

drop policy if exists "clinicians read patient medications" on public.patient_medications;
create policy "clinicians read patient medications" on public.patient_medications
  for select to authenticated using (true);

drop policy if exists "clinicians manage patient medications" on public.patient_medications;
create policy "clinicians manage patient medications" on public.patient_medications
  for all to authenticated using (true) with check (true);
