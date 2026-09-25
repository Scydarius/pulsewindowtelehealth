-- Notes are deliberately clinician-only and are never exposed through the
-- patient invitation endpoints.
create table if not exists public.clinician_private_notes (
  appointment_id uuid primary key references public.appointments(id) on delete cascade,
  clinician_id uuid not null references public.clinician_profiles(id) on delete restrict,
  content text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clinician_private_notes_content_length check (char_length(content) <= 10000)
);

alter table public.clinician_private_notes enable row level security;
revoke all on public.clinician_private_notes from anon, authenticated;

-- All reads and writes go through the authenticated server endpoint so a
-- clinician can only access notes attached to their own appointments.
