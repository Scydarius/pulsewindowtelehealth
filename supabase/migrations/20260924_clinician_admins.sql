-- Enables a small, explicit administrator group to invite clinicians.
-- After applying this migration, promote the initial owner once in SQL:
-- update public.clinician_profiles set is_admin = true where id = 'YOUR_AUTH_USER_UUID';

alter table public.clinician_profiles
  add column if not exists is_admin boolean not null default false;
