-- Migration: Add review flags to appointments
-- Allows clinicians to flag appointments/patients for review during or after consultations,
-- and remove them from the review queue when completed.

alter table public.appointments
  add column if not exists needs_review boolean default false,
  add column if not exists reviewed_at timestamptz;

create index if not exists appointments_clinician_needs_review_idx
  on public.appointments (clinician_id, needs_review);

-- Allow authenticated clinicians to update their own appointments' review status directly
do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'appointments' and policyname = 'clinicians update their appointments review status'
  ) then
    create policy "clinicians update their appointments review status"
      on public.appointments
      for update
      to authenticated
      using ((select auth.uid()) = clinician_id)
      with check ((select auth.uid()) = clinician_id);
  end if;
end $$;
