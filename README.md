# PulseWindow Telehealth

Standalone frontend for PulseWindow's patient portal, clinician portal and video consultations.

The frontend is intentionally separated from the Python rPPG engine. It communicates with the measurement service only through the versioned API described in `src/services/rppgClient.ts`.

## Run locally

```bash
npm install
cp .env.example .env.local
npm run dev
```

The application uses simulated measurements unless `VITE_USE_MOCK_RPPG=false` is configured. Local WebRTC calling is enabled by default.

## Test a local video consultation

1. Open the patient portal and join the next appointment.
2. Open the clinician portal in a second tab and start Claire's appointment.
3. Allow camera and microphone access in both tabs.
4. Use headphones to prevent feedback when both tabs are on the same computer.

The two tabs exchange camera and microphone streams using WebRTC. Local mode uses the browser only and is intended for development on one computer. It does not send video through the rPPG service.

## Routes

- `/` — portal selection
- `/patient` — patient dashboard
- `/clinician` — clinician dashboard
- `/consultation/:appointmentId` — video consultation and measurement workspace

## LiveKit

Set `VITE_LIVEKIT_URL` and `VITE_LIVEKIT_TOKEN_ENDPOINT` to enable real calls. The token endpoint must generate short-lived room tokens on a trusted server. Never place the LiveKit API secret in this repository.

For a deployed multi-device call, create a LiveKit Cloud project and add these environment variables to the Vercel project:

```text
VITE_VIDEO_PROVIDER=livekit
VITE_LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=your-key
LIVEKIT_API_SECRET=your-secret
```

The frontend calls the included `/api/livekit-token` Vercel Function. `LIVEKIT_API_SECRET` is server-only and must never be prefixed with `VITE_`. You may override the endpoint with `VITE_LIVEKIT_TOKEN_ENDPOINT`; otherwise the same-origin function is used automatically.

The current token endpoint is suitable for a closed prototype. Add authenticated user sessions and appointment authorization before allowing public or clinical use.

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

## Clinician-created patient links

The portal now includes clinician sign-in, clinician-created patient links and database access rules for appointments and measurements. Follow [the clinical prototype setup guide](docs/clinical-setup.md) before enabling it. Until that setup is complete, the existing sample data and simulated rPPG values remain a demonstration only.
