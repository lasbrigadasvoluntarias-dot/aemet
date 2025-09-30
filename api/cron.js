// api/cron.js
import { kv } from '@vercel/kv';
import { todayKey, buildPayload } from '../lib/build.js';

export const config = {
  runtime: 'nodejs18.x' // o 'nodejs20.x' si tu proyecto lo usa
};

export default async function handler(req, res) {
  try {
    // opcional: proteger con token
    const token = process.env.CRON_SECRET;
    if (token) {
      const provided = req.headers['authorization'] || '';
      if (!provided.endsWith(token)) return res.status(401).send('Unauthorized');
    }

    const key = todayKey();
    const payload = await buildPayload();
    await kv.set(key, payload, { ex: 60 * 60 * 6 });

    res.status(200).json({ ok: true, key, count: payload.items?.length || 0, lastUpdate: payload.lastUpdate });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false });
  }
}
