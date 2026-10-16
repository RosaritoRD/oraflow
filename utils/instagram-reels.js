/**
 * Reels on Instagram (@your_account) with the "Instagram login" API
 * (graph.instagram.com), 04/10/2026.
 *
 * Instagram doesn't allow scheduling through the API, but the container survives
 * 24 h unpublished. So: when the Short is uploaded to YouTube (≈12 h before) the
 * container is created; at the exact time only `media_publish` is left.
 * Instagram accepts Reels up to 15 min: the original Short goes, not sped up.
 *
 * The token lasts 60 days and is renewed every week; the renewed one is stored
 * in `settings` (instagram_token). If another one is pasted by hand into .env,
 * that one rules.
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

/** Token in use: the renewed one (DB) if it came from the same .env token; otherwise, the .env one. */
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
    // New token (or first time): it's noted down and renewed in a week.
    await db.setSetting('instagram_token_origin', origen);
    await db.setSetting('instagram_token', delEnv);
    await db.setSetting('instagram_token_refreshed_at', now.toISOString());
    return false;
  }
  if (now.getTime() - ultima < RENOVAR_CADA_MS) return false;
  const actual = await tokenInstagram(db, env);
  const url = `${GRAPH}/refresh_access_token?${new URLSearchParams({ grant_type: 'ig_refresh_token', access_token: actual })}`;
  const body = await leeRespuesta(await fetchImpl(url), 'renovar token');
  if (!body.access_token) throw new Error('Instagram (renew token): response without access_token');
  await db.setSetting('instagram_token', body.access_token);
  await db.setSetting('instagram_token_refreshed_at', now.toISOString());
  return true;
}

/**
 * Creates the REELS container from a public link (`videoUrl`).
 * ⚠ upload_type=resumable answers "video_url is required" with this kind of
 * token (tested on v21/v23/v25, 04/10/2026), and Facebook links (fbcdn) are
 * rejected: the link comes from utils/enlace-publico.js.
 * `coverUrl` (11/10/2026): the Reel's cover. It can only be set HERE, when
 * creating the container: a Reel already created or published doesn't change its
 * cover through the API. Tested that day with the "Instagram login" token.
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
  if (!contenedor.id) throw new Error('Instagram (container): returned no id');
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
  } catch (_e) { /* published anyway; the link is an extra */ }
  return { mediaId: pub.id, permalink };
}

/**
 * Image carousel (2-10 JPGs with a public link). Creates one container per
 * image, the CAROUSEL container with all of them and returns its id; publishing
 * is done with publicaIG() when the status is FINISHED.
 */
async function preparaCarruselIG({ token, imageUrls, caption = '', version = VERSION, fetchImpl = fetch }) {
  if (!Array.isArray(imageUrls) || imageUrls.length < 2 || imageUrls.length > 10) {
    throw new Error('Instagram (carousel): between 2 and 10 images are needed');
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
  if (!carrusel.id) throw new Error('Instagram (carousel): returned no id');
  return { containerId: carrusel.id, igUserId };
}

/** A single image (JPG with a public link) for the feed; published with publicaIG() when it's FINISHED. */
async function preparaImagenIG({ token, imageUrl, caption = '', version = VERSION, fetchImpl = fetch }) {
  if (!imageUrl) throw new Error('Instagram (image): missing the public URL');
  const me = await leeRespuesta(await fetchImpl(
    `${GRAPH}/${version}/me?${new URLSearchParams({ fields: 'user_id,username', access_token: token })}`
  ), 'cuenta');
  const igUserId = me.user_id || me.id;
  const imagen = await leeRespuesta(await fetchImpl(`${GRAPH}/${version}/${igUserId}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ image_url: imageUrl, caption, access_token: token }).toString()
  }), 'imagen');
  if (!imagen.id) throw new Error('Instagram (image): returned no id');
  return { containerId: imagen.id, igUserId };
}

/** Story (9:16 image with a public link). ⚠ The API doesn't support link stickers. */
async function preparaHistoriaIG({ token, imageUrl, version = VERSION, fetchImpl = fetch }) {
  if (!imageUrl) throw new Error('Instagram (story): missing the public URL');
  const me = await leeRespuesta(await fetchImpl(
    `${GRAPH}/${version}/me?${new URLSearchParams({ fields: 'user_id,username', access_token: token })}`
  ), 'cuenta');
  const igUserId = me.user_id || me.id;
  const historia = await leeRespuesta(await fetchImpl(`${GRAPH}/${version}/${igUserId}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ image_url: imageUrl, media_type: 'STORIES', access_token: token }).toString()
  }), 'historia');
  if (!historia.id) throw new Error('Instagram (story): returned no id');
  return { containerId: historia.id, igUserId };
}

module.exports = { preparaHistoriaIG, preparaReelIG, preparaCarruselIG, preparaImagenIG, estadoIG, publicaIG, tokenInstagram, renuevaTokenSiToca };
