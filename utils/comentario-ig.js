/**
 * Primer comentario en cada publicación nueva de Instagram (el autor, 05/10/2026).
 * La API de Instagram NO deja fijarlo: el sistema lo escribe y el autor toca la
 * chincheta. Texto según el tipo de publicación (opciones A/B/C acordadas),
 * siempre con Jesús de Nazaret como Rey y la invitación al «Amén». Sin 🕊️.
 *
 * Settings: ig_comentario_enabled ('false' lo apaga), ig_comentados (ids hechos).
 */
const GRAPH = 'https://graph.instagram.com/v25.0';
const MAX_HORAS = 48;

// Formato que eligió el autor (05/10/2026, su comentario fijado): invitación con
// Jesús Rey + 👑, ".\n." y dos líneas con icono. Editables en el panel (utils/textos-canal.js).
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

/** Comenta las publicaciones de las últimas 48 h que aún no tienen el comentario del canal. */
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
    logger?.info?.(`Comentario del canal en ${nuevos.length} publicación(es) de Instagram: falta fijarlo a mano 📌`);
  }
  return nuevos.length;
}

module.exports = { TEXTOS, textoPara, comentaNuevas };
