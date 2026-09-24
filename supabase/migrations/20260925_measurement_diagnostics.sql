-- Research-only diagnostic telemetry captured alongside an accepted rPPG sample.
-- These data support clinician review and model validation; they are not a diagnosis.
alter table public.measurements
  add column if not exists diagnostics jsonb;
