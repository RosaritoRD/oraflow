/**
 * First comment on every new Instagram post (05/10/2026).
 * The Instagram API does NOT allow pinning it: the system writes it and the owner
 * taps the pin. Text depending on the post type (agreed options A/B/C), always with
 * Jesus of Nazareth as King and the invitation to «Amén». No 🕊️.
 *
 * Settings: ig_comentario_enabled ('false' turns it off), ig_comentados (ids done).
 */
const GRAPH = 'https://graph.instagram.com/v25.0';
const MAX_HORAS = 48;

// The format the owner chose (05/10/2026, their pinned comment): an invitation with Jesus as King
// + 👑, ".\n." and two lines with an icon. Editable in the panel (utils/textos-canal.js).
const textos = require('./textos-canal');
const TEXTOS = Object.defineProperties({}, {
  general: { get: () => textos.texto('comentario_general'), enumerable: true },
  reel: { get: () => textos.texto('comentario_reel'), enumerable: true },
  fecha: { get: () => textos.texto('comentario_fecha'), enumerable: true }
});

function textoPara(media) {
  if (/^Feliz y bendecido/i.test(media.caption || '')) return TEXTOS.fecha;
  if (media.media_type === 'VIDEO' || media.media_product_type === 'REELS') return TEXTOS.reel;
  return TEXTOS.general;
}

async function leeJson(res) {
  let body = {};
  try { body = await res.json(); } catch (_e) { body = {}; }
  if (!res.ok || body.error) throw new Error(`Instagram: ${body.error?.message || `HTTP ${res.status}`}`);
  return body;
}

/** Comments on posts from the last 48 h that don't have the channel's comment yet. */
async function comentaNuevas({ db, token, logger, now = new Date(), fetchImpl = fetch }) {
  if (!token || await db.getSetting('ig_comentario_enabled') === 'false') return 0;
  const hechos = JSON.parse(await db.getSetting('ig_comentados') || '[]');
  const ya = new Set(hechos);
  const q = new URLSearchParams({ fields: 'id,caption,media_type,media_product_type,timestamp', limit: '15', access_token: token });
  const medios = (await leeJson(await fetchImpl(`${GRAPH}/me/media?${q}`))).data || [];
  const nuevos = [];
  for (const m of medios) {
    if (ya.has(m.id) || now.getTime() - Date.parse(m.timestamp) > MAX_HORAS * 3600000) continue;
    if (m.media_product_type === 'STORY') continue;
    try {
      await leeJson(await fetchImpl(`${GRAPH}/${m.id}/comments`, {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ message: textoPara(m), access_token: token }).toString()
      }));
      nuevos.push(m.id);
    } catch (error) {
      logger?.warn?.(`Comentario fijo de Instagram (${m.id}): ${error.message}`);
      break;
    }
  }
  if (nuevos.length) {
    await db.setSetting('ig_comentados', JSON.stringify([...nuevos, ...hechos].slice(0, 300)));
    logger?.info?.(`Channel comment on ${nuevos.length} Instagram post(s): pin it by hand 📌`);
  }
  return nuevos.length;
}

module.exports = { TEXTOS, textoPara, comentaNuevas };
