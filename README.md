# PulseWindow Telehealth

Standalone frontend for PulseWindow's patient portal, clinician portal and video consultations.

The frontend is intentionally separated from the Python rPPG engine. It communicates with the measurement service only through the versioned API described in `src/services/rppgClient.ts`.

## Run locally

```bash
npm install
cp .env.example .env.local
npm run dev
```

The application uses simulated measurements unless `VITE_USE_MOCK_RPPG=false` is configured.

## Routes

- `/` — portal selection
- `/patient` — patient dashboard
- `/clinician` — clinician dashboard
- `/consultation/:appointmentId` — video consultation and measurement workspace

## LiveKit

Set `VITE_LIVEKIT_URL` and `VITE_LIVEKIT_TOKEN_ENDPOINT` to enable real calls. The token endpoint must generate short-lived room tokens on a trusted server. Never place the LiveKit API secret in this repository.

Without those settings, the consultation page uses a local camera preview so the interface can be developed safely.

## rPPG API

Development defaults to:

```text
http://localhost:8000/api/v1
```

Production should use:

```text
https://api.pulsewindow.me/api/v1
```

The frontend should not import or depend on Python algorithm code. Algorithm changes and deployments remain independent of this application.
