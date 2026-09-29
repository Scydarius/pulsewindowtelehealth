import { createClient } from '@supabase/supabase-js';
import {
  exchangeGoogleCode,
  fetchGoogleEmail,
  getCallbackUrl,
  verifyOAuthState,
} from '../lib/googleCalendar';

function database() {
  const url = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error('The clinical database is not configured.');
  return createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

export default {
  async fetch(request: Request) {
    const url = new URL(request.url);
    const origin = process.env.APP_URL || url.origin;
    const baseRedirect = `${origin.replace(/\/$/, '')}/clinician?view=availability`;

    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const googleError = url.searchParams.get('error');

    if (googleError) {
      return Response.redirect(`${baseRedirect}&calendar_error=${encodeURIComponent(googleError)}`, 302);
    }

    if (!code || !state) {
      return Response.redirect(`${baseRedirect}&calendar_error=MissingAuthorizationCode`, 302);
    }

    try {
      const verified = await verifyOAuthState(state);
      if (!verified) {
        return Response.redirect(`${baseRedirect}&calendar_error=SessionExpiredOrInvalid`, 302);
      }

      const redirectUri = getCallbackUrl(origin);
      const tokens = await exchangeGoogleCode(code, redirectUri);
      const email = await fetchGoogleEmail(tokens.accessToken);

      const db = database();
      const expiresAt = new Date(Date.now() + tokens.expiresIn * 1000).toISOString();

      const { error: upsertError } = await db.from('clinician_calendar_integrations').upsert(
        {
          clinician_id: verified.clinicianId,
          provider: 'google',
          refresh_token: tokens.refreshToken,
          access_token: tokens.accessToken,
          access_token_expires_at: expiresAt,
          calendar_email: email,
          calendar_id: 'primary',
          sync_enabled: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'clinician_id' }
      );

      if (upsertError) {
        throw new Error('Failed to save calendar integration.');
      }

      return Response.redirect(`${baseRedirect}&calendar=connected`, 302);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'UnknownError';
      return Response.redirect(`${baseRedirect}&calendar_error=${encodeURIComponent(message)}`, 302);
    }
  },
};
