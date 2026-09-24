type RequestBody = { appointmentId?: string; role?: 'patient' | 'clinician'; invitationToken?: string };

const encoder = new TextEncoder();
const base64Url = (value: Uint8Array | string) => {
  const text = typeof value === 'string' ? value : String.fromCharCode(...value);
  return btoa(text).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
};

async function sign(payload: Record<string, unknown>, secret: string) {
  const encoded = base64Url(JSON.stringify(payload));
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(encoded)));
  return `${encoded}.${base64Url(signature)}`;
}

export default {
  async fetch(request: Request) {
    if (request.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 });
    try {
      const { appointmentId, role, invitationToken } = await request.json() as RequestBody;
      const secret = process.env.RPPG_TICKET_SECRET;
      const apiUrl = process.env.RPPG_API_URL;
      if (!appointmentId || !secret || !apiUrl || (role !== 'patient' && role !== 'clinician')) throw new Error('rPPG access is not configured.');
      if (!process.env.VITE_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('The clinical database is not configured yet.');
      const { database, requireClinician, tokenHash } = await import('./clinic');

      if (role === 'clinician') {
        const { db, clinician } = await requireClinician(request);
        const { data: appointment } = await db.from('appointments').select('id').eq('id', appointmentId).eq('clinician_id', clinician.id).maybeSingle();
        if (!appointment) throw new Error('You are not authorised for this measurement.');
      } else {
        if (!invitationToken || invitationToken.length < 32) throw new Error('A valid patient link is required.');
        const db = database();
        const { data: invite } = await db.from('patient_invites').select('expires_at, revoked_at, appointment_id').eq('token_hash', await tokenHash(invitationToken)).maybeSingle();
        if (!invite || invite.appointment_id !== appointmentId || invite.revoked_at || new Date(invite.expires_at) <= new Date()) throw new Error('This patient link is not authorised for measurement.');
      }

      const sessionId = `rppg-${crypto.randomUUID().replaceAll('-', '')}`;
      const ticket = await sign({ aud: 'pulsewindow-rppg', appointment_id: appointmentId, role, session_id: sessionId, exp: Math.floor(Date.now() / 1000) + 120, jti: crypto.randomUUID() }, secret);
      const websocketBase = apiUrl.replace(/^https:/, 'wss:').replace(/^http:/, 'ws:').replace(/\/$/, '');
      return Response.json({ websocketUrl: `${websocketBase}/api/v1/stream?session_id=${encodeURIComponent(sessionId)}&ticket=${encodeURIComponent(ticket)}&algorithm=POS&fps=15` }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
      return Response.json({ error: error instanceof Error ? error.message : 'Unable to start measurement.' }, { status: 403 });
    }
  },
};
