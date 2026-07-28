/**
 * pages/api/livekit-token.ts
 * Next.js API route — proxies token requests to the Express server
 * OR generates directly if LIVEKIT_* env vars are set on the Next.js side.
 */
import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { name, room = 'pixel-campus' } = req.query;

  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'name param required' });
  }

  // Try to generate token directly from Next.js if keys are available
  const apiKey    = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const url       = process.env.LIVEKIT_URL;

  if (apiKey && apiSecret && url) {
    try {
      const { AccessToken } = await import('livekit-server-sdk');
      const at = new AccessToken(apiKey, apiSecret, { identity: name, ttl: '8h' });
      at.addGrant({ roomJoin: true, room: String(room), canPublish: true, canSubscribe: true });
      const token = await at.toJwt();
      return res.json({ token, livekitUrl: url, voiceEnabled: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  }

  // Fall back: proxy to the Express server
  try {
    const serverUrl = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3001';
    const upstream  = await fetch(
      `${serverUrl}/api/livekit-token?name=${encodeURIComponent(name)}&room=${room}`
    );
    const data = await upstream.json();
    return res.status(upstream.status).json(data);
  } catch {
    return res.json({ token: null, livekitUrl: null, voiceEnabled: false });
  }
}
