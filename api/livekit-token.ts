import { AccessToken } from 'livekit-server-sdk';
import { createClient } from '@supabase/supabase-js';

type TokenRequest = {
  roomName?: string;
  identity?: string;
  displayName?: string;
  role?: 'patient' | 'clinician';
  invitationToken?: string;
};

const safeIdentifier = /^[a-zA-Z0-9_-]{1,80}$/;
const encoder = new TextEncoder();
const database = () => {
  const url = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error('The clinical database is not configured.');
  return createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
};
const tokenHash = async (token: string) => {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
};
async function requireClinician(request: Request) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) throw new Error('Sign in is required.');
  const db = database();
  const { data: userData, error: userError } = await db.auth.getUser(token);
  if (userError || !userData.user) throw new Error('Your sign-in session is invalid.');
  const { data: clinician, error } = await db.from('clinician_profiles').select('id').eq('id', userData.user.id).maybeSingle();
  if (error || !clinician) throw new Error('This account is not an authorised clinician.');
  return { db, clinician };
}

export default {
  async fetch(request: Request) {
    if (request.method !== 'POST') {
      return Response.json({ error: 'Method not allowed' }, { status: 405 });
    }

    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;

    if (!apiKey || !apiSecret) {
      return Response.json({ error: 'Video service is not configured' }, { status: 503 });
    }

    try {
      const body = await request.json() as TokenRequest;
      const { roomName, identity, displayName, role, invitationToken } = body;

      if (
        !roomName || !safeIdentifier.test(roomName)
        || !identity || !safeIdentifier.test(identity)
        || !displayName || displayName.length > 80
        || (role !== 'patient' && role !== 'clinician')
      ) {
        return Response.json({ error: 'Invalid consultation request' }, { status: 400 });
      }

      let liveKitRoomName = roomName;
      // When the clinical database is configured, a LiveKit room can only be
      // joined by its clinician or by a holder of the matching patient link.
      if (process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.VITE_SUPABASE_URL) {
        if (role === 'clinician') {
          const { db, clinician } = await requireClinician(request);
          const { data: appointment } = await db.from('appointments').select('id, room_name').eq('id', roomName).eq('clinician_id', clinician.id).maybeSingle();
          if (!appointment) return Response.json({ error: 'You are not authorised for this consultation.' }, { status: 403 });
          liveKitRoomName = appointment.room_name;
        } else {
          if (!invitationToken || invitationToken.length < 32) return Response.json({ error: 'A valid patient link is required.' }, { status: 403 });
          const db = database();
          const { data: invite } = await db.from('patient_invites').select('expires_at, revoked_at, appointment:appointments(id, room_name)').eq('token_hash', await tokenHash(invitationToken)).maybeSingle();
          const appointment = invite?.appointment as unknown as { id: string; room_name: string } | null;
          if (!invite || invite.revoked_at || new Date(invite.expires_at) <= new Date() || appointment?.id !== roomName) {
            return Response.json({ error: 'This patient link is not authorised for this consultation.' }, { status: 403 });
          }
          liveKitRoomName = appointment.room_name;
        }
      }

      const token = new AccessToken(apiKey, apiSecret, {
        identity,
        name: displayName,
        ttl: '15m',
        metadata: JSON.stringify({ role }),
      });

      token.addGrant({
        room: liveKitRoomName,
        roomJoin: true,
        canPublish: true,
        canSubscribe: true,
      });

      return Response.json({ token: await token.toJwt() }, {
        headers: { 'Cache-Control': 'no-store' },
      });
    } catch {
      return Response.json({ error: 'Unable to create call credentials' }, { status: 400 });
    }
  },
};
