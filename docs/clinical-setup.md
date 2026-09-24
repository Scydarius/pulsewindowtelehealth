# Clinical prototype setup

This enables clinician-created patient links. It is a prototype workflow, not a statement that the service is ready for clinical use.

## 1. Create the database and clinician account

1. Create a Supabase project in an approved region and run `supabase/migrations/20260924_clinician_invites.sql` in its SQL editor.
2. In Supabase Authentication, create or invite each clinician. Do **not** enable open public sign-up for this portal.
3. Add each approved account to the clinician table, using the account's user ID from Authentication:

```sql
insert into public.clinician_profiles (id, display_name)
values ('AUTH_USER_UUID_HERE', 'Dr Example Name');
```

4. In Authentication URL settings, add these redirect URLs:

```text
https://pulsewindowtelehealth.vercel.app/clinician
http://localhost:5173/clinician
```

## 2. Configure Vercel

Add these production environment values in the existing Vercel project:

```text
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVER_ONLY_SERVICE_ROLE_KEY
```

`SUPABASE_SERVICE_ROLE_KEY` must be server-only: never commit it or prefix it with `VITE_`.

Keep the existing LiveKit variables in Vercel. When the database values are present, the LiveKit token function checks that a clinician owns the appointment or that a patient holds the matching valid invite link.

## 3. Use the workflow

1. A clinician opens `/clinician/sign-in` and uses their authorised work email.
2. From `/clinician`, they create a patient link and send it directly to the patient.
3. The patient opens `/join?token=…`, reviews the appointment, and joins the video call.
4. The clinician joins from their workspace. The patient link expires 24 hours after the appointment start time.

## 4. Before real patient use

Complete privacy, clinical governance, security testing, retention/deletion rules, audit logging, incident response, consent wording, and an Australian health-data hosting assessment. The rPPG panel remains simulated until the separately deployed measurement API is integrated and validated.
