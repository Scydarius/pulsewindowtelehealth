import { AccessToken } from 'livekit-server-sdk';

type TokenRequest = {
  roomName?: string;
  identity?: string;
  displayName?: string;
  role?: 'patient' | 'clinician';
};

const safeIdentifier = /^[a-zA-Z0-9_-]{1,80}$/;

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
      const { roomName, identity, displayName, role } = body;

      if (
        !roomName || !safeIdentifier.test(roomName)
        || !identity || !safeIdentifier.test(identity)
        || !displayName || displayName.length > 80
        || (role !== 'patient' && role !== 'clinician')
      ) {
        return Response.json({ error: 'Invalid consultation request' }, { status: 400 });
      }

      const token = new AccessToken(apiKey, apiSecret, {
        identity,
        name: displayName,
        ttl: '15m',
        metadata: JSON.stringify({ role }),
      });

      token.addGrant({
        room: roomName,
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
