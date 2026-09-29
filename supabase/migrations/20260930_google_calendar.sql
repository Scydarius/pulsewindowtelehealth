-- Google Calendar integration schema for Ventricura Telehealth.
-- Run in Supabase SQL editor to enable calendar sync and conflict checks.

create table if not exists public.clinician_calendar_integrations (
  clinician_id uuid primary key references public.clinician_profiles(id) on delete cascade,
  provider text not null default 'google',
  refresh_token text not null,
  access_token text,
  access_token_expires_at timestamptz,
  calendar_email text,
  calendar_id text not null default 'primary',
  sync_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Store Google Calendar event ID to allow automatic deletion when an appointment is cancelled
alter table public.appointments
  add column if not exists google_event_id text;

-- Restrict all access: tokens are strictly accessed server-side via service role key
alter table public.clinician_calendar_integrations enable row level security;
revoke all on public.clinician_calendar_integrations from anon, authenticated;
