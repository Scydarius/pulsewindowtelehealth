export type ConsultationIdentity = {
  roomName: string;
  identity: string;
  displayName: string;
  role: 'patient' | 'clinician';
  invitationToken?: string;
};

export const liveKitUrl = import.meta.env.VITE_LIVEKIT_URL ?? '';
const tokenEndpoint = import.meta.env.VITE_LIVEKIT_TOKEN_ENDPOINT ?? '/api/livekit-token';

export const hasLiveKitConfiguration = Boolean(liveKitUrl && tokenEndpoint);

export async function fetchLiveKitToken(identity: ConsultationIdentity, accessToken?: string) {
  if (!tokenEndpoint) throw new Error('LiveKit token endpoint is not configured.');

  const response = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
    body: JSON.stringify(identity),
  });

  const body = await response.json().catch(() => ({ error: 'The video service is temporarily unavailable.' })) as { token?: string; error?: string };
  if (!response.ok || !body.token) throw new Error(body.error ?? 'Unable to join the consultation.');
  return body.token;
}
