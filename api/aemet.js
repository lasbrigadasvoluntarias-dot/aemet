// api/aemet.js
import { kv } from '@vercel/kv';
import { todayKey, buildPayload } from '../lib/build.js';

export default async function handler(req, res) {
  try {
    const key = todayKey();
    let data = await kv.get(key);
    if (!data) {
      // si aún no hay dato (por ejemplo, primera vez), construir on-demand
      data = await buildPayload();
      // guarda 6h y deja que el cron lo vaya refrescando
      await kv.set(key, data, { ex: 60 * 60 * 6 });
    }

    // cache CDN de Vercel (edge)
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=86400');
    // CORS por si llamas desde otros dominios
    res.setHeader('Access-Control-Allow-Origin', '*');

    res.status(200).json(data);
  } catch (e) {
    console.error(e);
    res.status(200).json({ lastUpdate: null, items: [] }); // respuesta segura
  }
}
