-- Native clinician availability and public booking links.
create table if not exists public.clinician_booking_profiles (
  clinician_id uuid primary key references public.clinician_profiles(id) on delete cascade,
  booking_token text not null unique,
  timezone text not null default 'Australia/Adelaide',
  duration_minutes integer not null default 30 check (duration_minutes in (15, 30, 45, 60)),
  weekly_availability jsonb not null default '[
    {"day":1,"enabled":true,"start":"09:00","end":"17:00"},
    {"day":2,"enabled":true,"start":"09:00","end":"17:00"},
    {"day":3,"enabled":true,"start":"09:00","end":"17:00"},
    {"day":4,"enabled":true,"start":"09:00","end":"17:00"},
    {"day":5,"enabled":true,"start":"09:00","end":"17:00"},
    {"day":6,"enabled":false,"start":"09:00","end":"17:00"},
    {"day":0,"enabled":false,"start":"09:00","end":"17:00"}
  ]'::jsonb,
  booking_enabled boolean not null default false,
  booking_reason text not null default 'Telehealth consultation',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.clinician_booking_profiles enable row level security;

drop policy if exists "Clinicians manage their own booking profile" on public.clinician_booking_profiles;
create policy "Clinicians manage their own booking profile"
  on public.clinician_booking_profiles
  for all to authenticated
  using (clinician_id = auth.uid())
  with check (clinician_id = auth.uid());

create index if not exists appointments_clinician_starts_at_idx
  on public.appointments (clinician_id, starts_at);
