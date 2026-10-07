-- Public, clinic-branded mini-sites hosted on clinic-name.ventricura.com.
alter table public.clinics
  add column if not exists website_headline text,
  add column if not exists website_intro text,
  add column if not exists website_about text,
  add column if not exists website_phone text,
  add column if not exists website_email text,
  add column if not exists website_enabled boolean not null default true;
