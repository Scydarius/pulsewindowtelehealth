import { createClient } from '@supabase/supabase-js';
import {
  exchangeGoogleCode,
  fetchGoogleEmail,
  generateGoogleAuthUrl,
  getCallbackUrl,
  isGoogleCalendarConfigured,
  verifyOAuthState,
} from '../lib/googleCalendar.js';

function database() {
  const url = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error('The clinical database is not configured.');
  return createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function requireClinician(request: Request) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) throw new Error('Sign in is required.');
  const db = database();
  const { data: userData, error: userError } = await db.auth.getUser(token);
  if (userError || !userData.user) throw new Error('Your sign-in session is invalid.');
  const { data: clinician, error: clinicianError } = await db
    .from('clinician_profiles')
    .select('id, display_name')
    .eq('id', userData.user.id)
    .maybeSingle();
  if (clinicianError || !clinician) throw new Error('This account is not an authorised clinician.');
  return { db, clinician };
}

export default {
  async fetch(request: Request) {
    const url = new URL(request.url);
    try {
      if (request.method === 'GET') {
        const action = url.searchParams.get('action');

        // Handle OAuth callback (redirect from Google)
        if (
          action === 'callback' ||
          url.pathname.includes('callback') ||
          (url.searchParams.has('code') && url.searchParams.has('state')) ||
          url.searchParams.has('error')
        ) {
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
        }

        if (action === 'status') {
          const configured = isGoogleCalendarConfigured();
          const { db, clinician } = await requireClinician(request);
          const { data } = await db
            .from('clinician_calendar_integrations')
            .select('calendar_email, sync_enabled, updated_at')
            .eq('clinician_id', clinician.id)
            .maybeSingle();

          return Response.json(
            {
              configured,
              connected: Boolean(data),
              email: data?.calendar_email ?? null,
              syncEnabled: data ? data.sync_enabled !== false : false,
            },
            { headers: { 'Cache-Control': 'no-store' } }
          );
        }

        if (action === 'auth-url') {
          const { clinician } = await requireClinician(request);
          const origin = process.env.APP_URL || url.origin;
          const authUrl = await generateGoogleAuthUrl(origin, clinician.id);
          return Response.json({ authUrl }, { headers: { 'Cache-Control': 'no-store' } });
        }

        return Response.json({ error: 'Unknown calendar action.' }, { status: 400 });
      }

      if (request.method === 'POST') {
        const { db, clinician } = await requireClinician(request);
        const body = (await request.json().catch(() => ({}))) as {
          action?: string;
          enabled?: boolean;
        };

        if (body.action === 'disconnect') {
          await db
            .from('clinician_calendar_integrations')
            .delete()
            .eq('clinician_id', clinician.id);
          return Response.json({ message: 'Google Calendar disconnected.' });
        }

        if (body.action === 'toggle-sync') {
          const syncEnabled = Boolean(body.enabled);
          await db
            .from('clinician_calendar_integrations')
            .update({ sync_enabled: syncEnabled, updated_at: new Date().toISOString() })
            .eq('clinician_id', clinician.id);
          return Response.json({ syncEnabled });
        }

        return Response.json({ error: 'Unknown calendar request.' }, { status: 400 });
      }

      return Response.json({ error: 'Method not allowed.' }, { status: 405 });
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : 'Unable to process calendar request.' },
        { status: 400 }
      );
    }
  },
};
