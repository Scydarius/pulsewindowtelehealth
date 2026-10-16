-- Multi-clinic banner images and announcement banners.
alter table public.clinics
  add column if not exists website_banner_url text,
  add column if not exists website_banner_text text,
  add column if not exists website_banner_enabled boolean not null default true;
