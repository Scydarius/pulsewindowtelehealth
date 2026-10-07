-- Multi-clinic structure and patient-facing clinician profiles.
-- Apply this migration in Supabase before deploying the matching application code.

create table if not exists public.clinics (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 160),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  public_domain text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.clinics (name, slug)
values ('Ventricura', 'ventricura')
on conflict (slug) do nothing;

alter table public.clinician_profiles
  add column if not exists clinic_id uuid references public.clinics(id) on delete set null,
  add column if not exists professional_title text,
  add column if not exists about_me text,
  add column if not exists photo_url text,
  add column if not exists is_platform_admin boolean not null default false;

update public.clinician_profiles
set clinic_id = (select id from public.clinics where slug = 'ventricura')
where clinic_id is null;

create index if not exists clinician_profiles_clinic_id_idx on public.clinician_profiles(clinic_id);

alter table public.clinics enable row level security;
grant select on public.clinics to authenticated;
drop policy if exists "clinicians read clinics" on public.clinics;
create policy "clinicians read clinics" on public.clinics for select to authenticated using (true);

-- Public avatar storage. Users may upload only inside their own UUID folder;
-- the bucket is public only so patient booking pages can render clinician photos.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('clinician-avatars', 'clinician-avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = 2097152,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

drop policy if exists "public clinician avatar read" on storage.objects;
create policy "public clinician avatar read" on storage.objects for select using (bucket_id = 'clinician-avatars');
drop policy if exists "clinicians upload own avatar" on storage.objects;
create policy "clinicians upload own avatar" on storage.objects for insert to authenticated
  with check (bucket_id = 'clinician-avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "clinicians update own avatar" on storage.objects;
create policy "clinicians update own avatar" on storage.objects for update to authenticated
  using (bucket_id = 'clinician-avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'clinician-avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "clinicians delete own avatar" on storage.objects;
create policy "clinicians delete own avatar" on storage.objects for delete to authenticated
  using (bucket_id = 'clinician-avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Promote the two founders after applying the migration (replace emails if needed):
-- update public.clinician_profiles cp
-- set is_admin = true, is_platform_admin = true
-- from auth.users u where u.id = cp.id and lower(u.email) in ('sid@ventricura.com', 'ramsay@ventricura.com');
