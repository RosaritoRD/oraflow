/**
 * Reels en Instagram (@tu_cuenta) con la API de "inicio de sesión con
 * Instagram" (graph.instagram.com), 04/10/2026.
 *
 * Instagram no deja programar por API, pero el contenedor aguanta 24 h sin
 * publicar. Por eso: al subir el Short a YouTube (≈12 h antes) se crea el
 * contenedor; a la hora exacta solo falta `media_publish`.
 * Instagram admite Reels de hasta 15 min: va el Short original, sin acelerar.
 *
 * El token dura 60 días y se renueva cada semana; el renovado se guarda en
 * `settings` (instagram_token). Si se pega otro a mano en el .env, manda ese.
 */
const crypto = require('crypto');

const VERSION = 'v25.0';
const GRAPH = 'https://graph.instagram.com';
const RENOVAR_CADA_MS = 7 * 24 * 3600000;

const huella = token => crypto.createHash('sha256').update(String(token)).digest('hex').slice(0, 16);

async function leeRespuesta(res, paso) {
  let body = {};
  try { body = await res.json(); } catch (_e) { body = {}; }
  if (!res.ok || body.error) {
    throw new Error(`Instagram (${paso}): ${body.error?.message || `HTTP ${res.status}`}`);
  }
  return body;
}

function tokenDelEnv(env = process.env) {
  if (String(env.INSTAGRAM_REELS || '').toLowerCase() === 'off') return null;
  return String(env.INSTAGRAM_TOKEN || '').trim() || null;
}

/** Token en uso: el renovado (BD) si salió del mismo token del .env; si no, el del .env. */
async function tokenInstagram(db, env = process.env) {
  const delEnv = tokenDelEnv(env);
  if (!delEnv) return null;
  const guardado = await db?.getSetting?.('instagram_token');
  const origen = await db?.getSetting?.('instagram_token_origin');
  return guardado && origen === huella(delEnv) ? guardado : delEnv;
}

async function renuevaTokenSiToca({ db, env = process.env, now = new Date(), fetchImpl = fetch }) {
  const delEnv = tokenDelEnv(env);
  if (!delEnv || !db?.getSetting) return false;
  const origen = huella(delEnv);
  const ultima = Date.parse(await db.getSetting('instagram_token_refreshed_at') || '');
  if (await db.getSetting('instagram_token_origin') !== origen || !Number.isFinite(ultima)) {
    // Token nuevo (o primera vez): se apunta y se renueva dentro de una semana.
    await db.setSetting('instagram_token_origin', origen);
    await db.setSetting('instagram_token', delEnv);
    await db.setSetting('instagram_token_refreshed_at', now.toISOString());
    return false;
  }
  if (now.getTime() - ultima < RENOVAR_CADA_MS) return false;
  const actual = await tokenInstagram(db, env);
  const url = `${GRAPH}/refresh_access_token?${new URLSearchParams({ grant_type: 'ig_refresh_token', access_token: actual })}`;
  const body = await leeRespuesta(await fetchImpl(url), 'renovar token');
  if (!body.access_token) throw new Error('Instagram (renovar token): respuesta sin access_token');
  await db.setSetting('instagram_token', body.access_token);
  await db.setSetting('instagram_token_refreshed_at', now.toISOString());
  return true;
}

/**
 * Crea el contenedor REELS a partir de un enlace público (`videoUrl`).
 * ⚠ upload_type=resumable responde "video_url is required" con este tipo de
 * token (probado en v21/v23/v25, 04/10/2026), y los enlaces de Facebook
 * (fbcdn) los rechaza: el enlace lo da utils/enlace-publico.js.
 * `coverUrl` (11/10/2026): la portada del Reel. Solo se puede poner AQUÍ, al
 * crear el contenedor: un Reel ya creado o publicado no cambia de portada por
 * la API. Probado ese día con el token de "inicio de sesión con Instagram".
 */
async function preparaReelIG({ token, videoUrl, coverUrl = null, caption = '', version = VERSION, fetchImpl = fetch }) {
  const me = await leeRespuesta(await fetchImpl(
    `${GRAPH}/${version}/me?${new URLSearchParams({ fields: 'user_id,username', access_token: token })}`
  ), 'cuenta');
  const igUserId = me.user_id || me.id;
  const contenedor = await leeRespuesta(await fetchImpl(`${GRAPH}/${version}/${igUserId}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      media_type: 'REELS', video_url: videoUrl, ...(coverUrl ? { cover_url: coverUrl } : {}),
      share_to_feed: 'true', caption, access_token: token
    }).toString()
  }), 'contenedor');
  if (!contenedor.id) throw new Error('Instagram (contenedor): no devolvió id');
  return { containerId: contenedor.id, igUserId };
}

/** IN_PROGRESS | FINISHED | PUBLISHED | ERROR | EXPIRED */
async function estadoIG({ token, containerId, version = VERSION, fetchImpl = fetch }) {
  const body = await leeRespuesta(await fetchImpl(
    `${GRAPH}/${version}/${containerId}?${new URLSearchParams({ fields: 'status_code,status', access_token: token })}`
  ), 'estado');
  return { status: body.status_code, detail: body.status || null };
}

async function publicaIG({ token, igUserId, containerId, version = VERSION, fetchImpl = fetch }) {
  const pub = await leeRespuesta(await fetchImpl(`${GRAPH}/${version}/${igUserId}/media_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ creation_id: containerId, access_token: token }).toString()
  }), 'publicar');
  let permalink = null;
  try {
    const info = await leeRespuesta(await fetchImpl(
      `${GRAPH}/${version}/${pub.id}?${new URLSearchParams({ fields: 'permalink', access_token: token })}`
    ), 'enlace');
    permalink = info.permalink || null;
  } catch (_e) { /* publicado igual; el enlace es un extra */ }
  return { mediaId: pub.id, permalink };
}

/**
 * Carrusel de imágenes (2-10 JPG con enlace público). Crea un contenedor por
 * imagen, el contenedor CAROUSEL con todas y devuelve su id; la publicación
 * se hace con publicaIG() cuando el estado es FINISHED.
 */
async function preparaCarruselIG({ token, imageUrls, caption = '', version = VERSION, fetchImpl = fetch }) {
  if (!Array.isArray(imageUrls) || imageUrls.length < 2 || imageUrls.length > 10) {
    throw new Error('Instagram (carrusel): hacen falta entre 2 y 10 imágenes');
  }
  const me = await leeRespuesta(await fetchImpl(
    `${GRAPH}/${version}/me?${new URLSearchParams({ fields: 'user_id,username', access_token: token })}`
  ), 'cuenta');
  const igUserId = me.user_id || me.id;
  const crea = async (campos, paso) => leeRespuesta(await fetchImpl(`${GRAPH}/${version}/${igUserId}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ ...campos, access_token: token }).toString()
  }), paso);
  const hijos = [];
  for (const url of imageUrls) {
    const hijo = await crea({ image_url: url, is_carousel_item: 'true' }, 'imagen del carrusel');
    hijos.push(hijo.id);
  }
  const carrusel = await crea({ media_type: 'CAROUSEL', children: hijos.join(','), caption }, 'carrusel');
  if (!carrusel.id) throw new Error('Instagram (carrusel): no devolvió id');
  return { containerId: carrusel.id, igUserId };
}

/** Una sola imagen (JPG con enlace público) para el feed; se publica con publicaIG() cuando esté FINISHED. */
async function preparaImagenIG({ token, imageUrl, caption = '', version = VERSION, fetchImpl = fetch }) {
  if (!imageUrl) throw new Error('Instagram (imagen): falta la URL pública');
  const me = await leeRespuesta(await fetchImpl(
    `${GRAPH}/${version}/me?${new URLSearchParams({ fields: 'user_id,username', access_token: token })}`
  ), 'cuenta');
  const igUserId = me.user_id || me.id;
  const imagen = await leeRespuesta(await fetchImpl(`${GRAPH}/${version}/${igUserId}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ image_url: imageUrl, caption, access_token: token }).toString()
  }), 'imagen');
  if (!imagen.id) throw new Error('Instagram (imagen): no devolvió id');
  return { containerId: imagen.id, igUserId };
}

/** Historia (imagen 9:16 con enlace público). ⚠ La API no admite stickers de enlace. */
async function preparaHistoriaIG({ token, imageUrl, version = VERSION, fetchImpl = fetch }) {
  if (!imageUrl) throw new Error('Instagram (historia): falta la URL pública');
  const me = await leeRespuesta(await fetchImpl(
    `${GRAPH}/${version}/me?${new URLSearchParams({ fields: 'user_id,username', access_token: token })}`
  ), 'cuenta');
  const igUserId = me.user_id || me.id;
  const historia = await leeRespuesta(await fetchImpl(`${GRAPH}/${version}/${igUserId}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ image_url: imageUrl, media_type: 'STORIES', access_token: token }).toString()
  }), 'historia');
  if (!historia.id) throw new Error('Instagram (historia): no devolvió id');
  return { containerId: historia.id, igUserId };
}

module.exports = { preparaHistoriaIG, preparaReelIG, preparaCarruselIG, preparaImagenIG, estadoIG, publicaIG, tokenInstagram, renuevaTokenSiToca };
