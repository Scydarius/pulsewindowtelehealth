-- Supports fast email-based patient history lookups for one clinician.
-- Existing records are intentionally not made unique: historical prototype data
-- may contain duplicate patient rows, and the API groups those safely by email.
create index if not exists patients_clinician_email_lookup_idx
  on public.patients (clinician_id, lower(email));
