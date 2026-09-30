# Ventricura pre-pilot release checklist

Run this before each pilot release and record the result, browser/device, tester and date.

| Check | Expected result |
| --- | --- |
| Approved clinician sign-in | Approved clinician enters workspace; unapproved account is denied. |
| Admin-only tools | Non-admin cannot open `/admin` or manage clinicians/patients. |
| Patient invite email | Email arrives from `noreply@ventricura.com`; link opens only its matching appointment. |
| Link expiry | An expired link shows unavailable and cannot join video, request an rPPG ticket, or save a measurement. |
| Link revocation | A revoked link immediately loses the same three permissions. |
| Link regeneration | Old link fails; new link works; a replacement email is received. |
| URL tampering | Changing the appointment ID in a patient call URL is denied. |
| Patient isolation | A patient link cannot reveal a different patient’s appointment, notes, or measurements. |
| Camera denied | Video/measurement UI explains how to enable camera; no broken screen or accidental recording. |
| Slow/no network | Video and measurement failure state is clear; no endless spinner; clinician can continue/retry. |
| rPPG API unavailable | Camera check reports a recoverable failure and saved records are not corrupted. |
| Booking email failure | Appointment is created safely; clinician sees an email-delivery warning and can regenerate the link. |
| Appointment deletion | Appointment and linked notes/measurements/invites are removed; patient record is retained. |
| Patient deletion (admin) | Patient and linked platform records are removed only by an administrator. |
| PDF/CSV export | Correct patient/appointment selected; values and timestamps match the visible record. |

Do not enable the pilot until every required check has a recorded pass or an approved workaround.
