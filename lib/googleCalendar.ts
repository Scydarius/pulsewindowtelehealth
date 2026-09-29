import { type SupabaseClient } from '@supabase/supabase-js';

const GOOGLE_AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const GOOGLE_CALENDAR_API = 'https://www.googleapis.com/calendar/v3';
const GOOGLE_USERINFO_API = 'https://www.googleapis.com/oauth2/v2/userinfo';

const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.freebusy',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ');

const encoder = new TextEncoder();

function getGoogleClientId(): string {
  return (process.env.GOOGLE_CLIENT_ID ?? '').replace(/\s+/g, '').replace(/^["']|["']$/g, '');
}

function getGoogleClientSecret(): string {
  return (process.env.GOOGLE_CLIENT_SECRET ?? '').replace(/\s+/g, '').replace(/^["']|["']$/g, '');
}

function getGoogleRedirectUri(): string {
  return (process.env.GOOGLE_REDIRECT_URI ?? '').trim().replace(/^["']|["']$/g, '');
}

export function isGoogleCalendarConfigured(): boolean {
  return Boolean(getGoogleClientId() && getGoogleClientSecret());
}

function base64Url(value: Uint8Array | string) {
  const text = typeof value === 'string' ? value : String.fromCharCode(...value);
  return btoa(text).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function parseBase64Url(value: string) {
  let str = value.replaceAll('-', '+').replaceAll('_', '/');
  while (str.length % 4) str += '=';
  return atob(str);
}

async function signState(payload: Record<string, unknown>, secret: string): Promise<string> {
  const encoded = base64Url(JSON.stringify(payload));
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(encoded)));
  return `${encoded}.${base64Url(signature)}`;
}

export async function verifyOAuthState(state: string): Promise<{ clinicianId: string } | null> {
  try {
    const [encoded, signature] = state.split('.');
    if (!encoded || !signature) return null;
    const secret = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.RPPG_TICKET_SECRET || 'ventricura-calendar-secret';
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );
    const expectedSig = new Uint8Array(
      Array.from(parseBase64Url(signature), (char) => char.charCodeAt(0))
    );
    const valid = await crypto.subtle.verify('HMAC', key, expectedSig, encoder.encode(encoded));
    if (!valid) return null;
    const payload = JSON.parse(parseBase64Url(encoded)) as { clinicianId: string; timestamp: number };
    if (!payload.clinicianId || typeof payload.timestamp !== 'number') return null;
    // Expire state after 15 minutes
    if (Date.now() - payload.timestamp > 15 * 60 * 1000) return null;
    return { clinicianId: payload.clinicianId };
  } catch {
    return null;
  }
}

export function getCallbackUrl(origin: string): string {
  const configured = getGoogleRedirectUri();
  if (configured) return configured;
  return `${origin.replace(/\/$/, '')}/api/google-calendar-callback`;
}

export async function generateGoogleAuthUrl(origin: string, clinicianId: string): Promise<string> {
  const clientId = getGoogleClientId();
  if (!clientId) throw new Error('Google Calendar integration is not configured. Missing GOOGLE_CLIENT_ID.');
  const redirectUri = getCallbackUrl(origin);
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.RPPG_TICKET_SECRET || 'ventricura-calendar-secret';
  const state = await signState({ clinicianId, timestamp: Date.now() }, secret);

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  });

  return `${GOOGLE_AUTH_ENDPOINT}?${params.toString()}`;
}

export async function exchangeGoogleCode(code: string, redirectUri: string) {
  const clientId = getGoogleClientId();
  const clientSecret = getGoogleClientSecret();
  if (!clientId || !clientSecret) throw new Error('Google credentials are not configured.');

  const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });

  const data = await response.json() as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };

  if (!response.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || 'Failed to exchange authorization code with Google.');
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in ?? 3600,
  };
}

export async function fetchGoogleEmail(accessToken: string): Promise<string | null> {
  try {
    const res = await fetch(GOOGLE_USERINFO_API, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const json = await res.json() as { email?: string };
    return json.email ?? null;
  } catch {
    return null;
  }
}

export async function getValidGoogleAccessToken(db: SupabaseClient, clinicianId: string): Promise<string | null> {
  const { data: integration, error } = await db
    .from('clinician_calendar_integrations')
    .select('refresh_token, access_token, access_token_expires_at, sync_enabled')
    .eq('clinician_id', clinicianId)
    .maybeSingle();

  if (error || !integration || !integration.sync_enabled) return null;

  const now = Date.now();
  if (
    integration.access_token &&
    integration.access_token_expires_at &&
    new Date(integration.access_token_expires_at).valueOf() > now + 60_000
  ) {
    return integration.access_token;
  }

  // Need refresh
  const clientId = getGoogleClientId();
  const clientSecret = getGoogleClientSecret();
  if (!clientId || !clientSecret || !integration.refresh_token) return null;

  try {
    const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: integration.refresh_token,
        grant_type: 'refresh_token',
      }),
    });

    const data = await response.json() as { access_token?: string; expires_in?: number };
    if (!response.ok || !data.access_token) return null;

    const expiresAt = new Date(Date.now() + (data.expires_in ?? 3600) * 1000).toISOString();
    await db
      .from('clinician_calendar_integrations')
      .update({ access_token: data.access_token, access_token_expires_at: expiresAt, updated_at: new Date().toISOString() })
      .eq('clinician_id', clinicianId);

    return data.access_token;
  } catch {
    return null;
  }
}

export async function getGoogleFreeBusy(
  db: SupabaseClient,
  clinicianId: string,
  timeMin: string,
  timeMax: string,
  timeZone: string
): Promise<Array<{ start: number; end: number }>> {
  try {
    const accessToken = await getValidGoogleAccessToken(db, clinicianId);
    if (!accessToken) return [];

    const response = await fetch(`${GOOGLE_CALENDAR_API}/freeBusy`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        timeMin,
        timeMax,
        timeZone,
        items: [{ id: 'primary' }],
      }),
    });

    if (!response.ok) return [];

    const data = await response.json() as {
      calendars?: Record<string, { busy?: Array<{ start: string; end: string }> }>;
    };

    const busyList = data.calendars?.primary?.busy ?? [];
    return busyList.map((item) => ({
      start: new Date(item.start).valueOf(),
      end: new Date(item.end).valueOf(),
    }));
  } catch {
    return [];
  }
}

export async function createGoogleCalendarEvent(
  db: SupabaseClient,
  clinicianId: string,
  input: {
    summary: string;
    description: string;
    startIso: string;
    endIso: string;
    timeZone: string;
    patientEmail?: string;
  }
): Promise<string | null> {
  try {
    const accessToken = await getValidGoogleAccessToken(db, clinicianId);
    if (!accessToken) return null;

    const response = await fetch(`${GOOGLE_CALENDAR_API}/calendars/primary/events?sendUpdates=all`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        summary: input.summary,
        description: input.description,
        start: { dateTime: input.startIso, timeZone: input.timeZone },
        end: { dateTime: input.endIso, timeZone: input.timeZone },
        attendees: input.patientEmail ? [{ email: input.patientEmail }] : [],
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'popup', minutes: 15 },
            { method: 'email', minutes: 60 },
          ],
        },
      }),
    });

    if (!response.ok) return null;
    const created = await response.json() as { id?: string };
    return created.id ?? null;
  } catch {
    return null;
  }
}

export async function deleteGoogleCalendarEvent(
  db: SupabaseClient,
  clinicianId: string,
  eventId: string
): Promise<boolean> {
  try {
    const accessToken = await getValidGoogleAccessToken(db, clinicianId);
    if (!accessToken || !eventId) return false;

    const response = await fetch(`${GOOGLE_CALENDAR_API}/calendars/primary/events/${encodeURIComponent(eventId)}?sendUpdates=all`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    return response.ok || response.status === 404;
  } catch {
    return false;
  }
}
