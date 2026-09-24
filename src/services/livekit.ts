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

  if (!response.ok) throw new Error('Unable to join the consultation.');
  const body = (await response.json()) as { token: string };
  return body.token;
}
