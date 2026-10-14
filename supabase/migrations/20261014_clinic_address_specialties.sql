-- Add address and specialties to clinic public pages
alter table public.clinics
  add column if not exists website_address text,
  add column if not exists website_specialties text;
