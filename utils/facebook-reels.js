/**
 * Reels on the Facebook Page (04/10/2026).
 *
 * Every Short published on YouTube is also uploaded as a Reel to the Page
 * "Oraciones en Presencia de Yeshua". Meta's API only publishes to Pages (never
 * personal profiles) and takes 3 steps: start → upload to rupload → finish. Docs:
 * developers.facebook.com/docs/video-api/guides/reels-publishing
 *
 * ⚠ Facebook only accepts Reels of 3 to 90 s and the Shorts come out at 92-99 s.
 * Instead of cutting the end (that's where the "Amén" is) the Facebook copy is
 * sped up to 89.5 s, capped at ×1.12 so the voice doesn't sound rushed.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { runFFmpeg } = require('./ffmpeg');

const execFileAsync = promisify(execFile);

const DEFAULT_VERSION = 'v25.0';
const OBJETIVO_SEGUNDOS = 89.5;
const MIN_SEGUNDOS = 3;
const VELOCIDAD_MAXIMA = 1.12;
// Meta: scheduled = more than 10 min and less than 29 days ahead.
const MIN_PROGRAMAR_MS = 11 * 60000;
const MAX_PROGRAMAR_MS = 28 * 24 * 3600000;

function facebookConfig(env = process.env) {
  if (String(env.FACEBOOK_REELS || '').toLowerCase() === 'off') return null;
  const pageId = String(env.FACEBOOK_PAGE_ID || '').trim();
  const token = String(env.FACEBOOK_PAGE_TOKEN || '').trim();
  if (!pageId || !token) return null;
  return { pageId, token, version: String(env.FACEBOOK_GRAPH_VERSION || DEFAULT_VERSION).trim() };
}

// An error that retrying won't fix (the video's duration isn't going to change).
function permanente(mensaje) {
  const error = new Error(mensaje);
  error.permanent = true;
  return error;
}

function planDeVelocidad(duracion) {
  if (!(duracion >= MIN_SEGUNDOS)) throw permanente(`El Reel dura ${duracion}s; Facebook pide al menos ${MIN_SEGUNDOS}s`);
  if (duracion <= OBJETIVO_SEGUNDOS) return { speed: 1 };
  const speed = Math.ceil((duracion / OBJETIVO_SEGUNDOS) * 1000) / 1000;
  if (speed > VELOCIDAD_MAXIMA) {
    const error = permanente(`El Short dura ${duracion.toFixed(1)}s: acelerarlo a 90s pasaría de ×${VELOCIDAD_MAXIMA}`);
    error.code = 'reel_demasiado_largo'; // the caller uploads it as a normal Page video
    throw error;
  }
  return { speed };
}

function modoDePublicacion(publishAt, now = new Date()) {
  const t = publishAt ? Date.parse(publishAt) : NaN;
  const delta = t - now.getTime();
  if (Number.isFinite(t) && delta > MIN_PROGRAMAR_MS && delta < MAX_PROGRAMAR_MS) {
    return { video_state: 'SCHEDULED', scheduled_publish_time: String(Math.floor(t / 1000)) };
  }
  return { video_state: 'PUBLISHED' };
}

async function duracionConFfprobe(videoPath) {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', videoPath
  ]);
  return Number(stdout.trim());
}

async function acelera(videoPath, speed) {
  const salida = path.join(os.tmpdir(), `fbreel-${process.pid}-${Date.now()}.mp4`);
  await runFFmpeg([
    '-y', '-i', videoPath,
    '-filter_complex', `[0:v]setpts=PTS/${speed}[v];[0:a]atempo=${speed}[a]`,
    '-map', '[v]', '-map', '[a]',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-r', '30', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-ar', '48000', '-b:a', '192k', '-movflags', '+faststart',
    salida
  ]);
  return salida;
}

async function leeRespuesta(res, paso) {
  let body = {};
  try { body = await res.json(); } catch (_e) { body = {}; }
  if (!res.ok || body.error) {
    const msg = body.error?.message || `HTTP ${res.status}`;
    throw new Error(`Facebook (${paso}): ${msg}`);
  }
  return body;
}

/**
 * Uploads an MP4 as a Reel. Returns { videoId, state, speed }.
 * `fetchImpl`, `duracionDe` and `acelerar` are injected in the tests.
 */
async function publicaReel({
  config, videoPath, description = '', publishAt = null, now = new Date(),
  fetchImpl = fetch, duracionDe = duracionConFfprobe, acelerar = acelera
}) {
  const { speed } = planDeVelocidad(await duracionDe(videoPath));
  const archivo = speed === 1 ? videoPath : await acelerar(videoPath, speed);
  try {
    const base = `https://graph.facebook.com/${config.version}/${config.pageId}/video_reels`;
    const graph = params => `${base}?${new URLSearchParams({ ...params, access_token: config.token })}`;

    const inicio = await leeRespuesta(await fetchImpl(graph({ upload_phase: 'start' }), { method: 'POST' }), 'start');
    const videoId = inicio.video_id;
    if (!videoId) throw new Error('Facebook (start): returned no video_id');

    const datos = await fs.promises.readFile(archivo);
    await leeRespuesta(await fetchImpl(
      inicio.upload_url || `https://rupload.facebook.com/video-upload/${config.version}/${videoId}`,
      {
        method: 'POST',
        headers: { Authorization: `OAuth ${config.token}`, offset: '0', file_size: String(datos.length) },
        body: datos
      }
    ), 'subida');

    const modo = modoDePublicacion(publishAt, now);
    await leeRespuesta(await fetchImpl(graph({
      upload_phase: 'finish', video_id: videoId, ...modo, description
    }), { method: 'POST' }), 'finish');

    return { videoId, state: modo.video_state, speed };
  } finally {
    if (archivo !== videoPath) fs.promises.unlink(archivo).catch(() => {});
  }
}

/**
 * Chunked upload to the Page (graph-video, start/transfer/finish phases).
 * ⚠ The single-shot upload gives 413 with 330 MB (tested 04/10/2026), so every
 * Page video goes through here. Returns the video id.
 */
async function subeVideoPorTrozos({ config, videoPath, campos = {}, fetchImpl = fetch }) {
  const url = `https://graph-video.facebook.com/${config.version}/${config.pageId}/videos`;
  const post = async (datos, paso) => {
    const form = new FormData();
    form.append('access_token', config.token);
    for (const [k, v] of Object.entries(datos)) form.append(k, v);
    return leeRespuesta(await fetchImpl(url, { method: 'POST', body: form }), paso);
  };
  const { size } = await fs.promises.stat(videoPath);
  const inicio = await post({ upload_phase: 'start', file_size: String(size) }, 'inicio');
  const sesion = inicio.upload_session_id;
  let desde = Number(inicio.start_offset);
  let hasta = Number(inicio.end_offset);
  const fd = await fs.promises.open(videoPath, 'r');
  try {
    while (desde < hasta) {
      const trozo = Buffer.alloc(hasta - desde);
      await fd.read(trozo, 0, trozo.length, desde);
      const r = await post({
        upload_phase: 'transfer', upload_session_id: sesion, start_offset: String(desde),
        video_file_chunk: new Blob([trozo], { type: 'application/octet-stream' })
      }, 'trozo');
      desde = Number(r.start_offset);
      hasta = Number(r.end_offset);
    }
  } finally {
    await fd.close();
  }
  await post({ upload_phase: 'finish', upload_session_id: sesion, ...campos }, 'fin');
  return inicio.video_id;
}

/**
 * Long video (horizontal, 6-7 min) on the Page, with its thumbnail and scheduled
 * at the YouTube time. ≥3 min = eligible for in-video ads.
 */
async function publicaVideoLargo({
  config, videoPath, title = '', description = '', thumbPath = null, publishAt = null,
  now = new Date(), fetchImpl = fetch
}) {
  const modo = modoDePublicacion(publishAt, now);
  const campos = { title: String(title).slice(0, 250), description };
  if (modo.video_state === 'SCHEDULED') {
    campos.published = 'false';
    campos.scheduled_publish_time = modo.scheduled_publish_time;
  }
  const videoId = await subeVideoPorTrozos({ config, videoPath, campos, fetchImpl });
  if (thumbPath && fs.existsSync(thumbPath)) {
    try {
      const form = new FormData();
      form.append('access_token', config.token);
      form.append('is_preferred', 'true');
      form.append('source', new Blob([await fs.promises.readFile(thumbPath)], { type: 'image/jpeg' }), path.basename(thumbPath));
      await leeRespuesta(await fetchImpl(`https://graph.facebook.com/${config.version}/${videoId}/thumbnails`, { method: 'POST', body: form }), 'miniatura');
    } catch (_e) { /* the video is already there; without a thumbnail Facebook picks a frame */ }
  }
  return { videoId, state: modo.video_state };
}

async function borraVideo({ config, videoId, fetchImpl = fetch }) {
  return leeRespuesta(await fetchImpl(
    `https://graph.facebook.com/${config.version}/${videoId}?${new URLSearchParams({ access_token: config.token })}`,
    { method: 'DELETE' }
  ), 'borrar');
}

/** Photo on the Page (the image is downloaded from a public URL). Returns the post id. */
async function publicaFoto({ config, imageUrl, message = '', fetchImpl = fetch }) {
  const res = await leeRespuesta(await fetchImpl(`https://graph.facebook.com/${config.version}/${config.pageId}/photos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ url: imageUrl, message, published: 'true', access_token: config.token }).toString()
  }), 'foto');
  if (!res.id) throw new Error('Facebook (photo): returned no id');
  return { photoId: res.id, postId: res.post_id || res.id };
}

/** Page story: unpublished photo + photo_stories. Returns the story id. */
async function publicaHistoriaFB({ config, imageUrl, fetchImpl = fetch }) {
  const base = `https://graph.facebook.com/${config.version}/${config.pageId}`;
  const post = (ruta, campos, paso) => fetchImpl(`${base}/${ruta}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ ...campos, access_token: config.token }).toString()
  }).then(res => leeRespuesta(res, paso));
  const foto = await post('photos', { url: imageUrl, published: 'false' }, 'foto de la historia');
  if (!foto.id) throw new Error('Facebook (story): the photo returned no id');
  const historia = await post('photo_stories', { photo_id: foto.id }, 'historia');
  return { postId: historia.post_id || historia.id || foto.id };
}

module.exports = { publicaHistoriaFB, publicaFoto, facebookConfig, planDeVelocidad, publicaVideoLargo, subeVideoPorTrozos, borraVideo, modoDePublicacion, publicaReel };
