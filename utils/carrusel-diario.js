/**
 * Un carrusel de oración al día en Instagram y Facebook (04/10/2026).
 *
 * Cada vuelta de la cola (15 min) mira si ya toca: hora en
 * `instagram_carousel_time` (por defecto 12:00, hora del canal) y uno por día.
 * Se apaga/enciende con `instagram_carousel_enabled` ('true' para activarlo:
 * arranca APAGADO hasta que el autor apruebe el diseño).
 * Estado en settings: instagram_carousel_last (JSON del último) y
 * instagram_carousel_temas (últimos temas, para no repetir).
 */
const path = require('path');
const fs = require('fs');
const { localDateKey, parseClock, zonedToUtc, DEFAULT_TZ } = require('./daily-slot');
const carrusel = require('./carrusel-oracion');
const video = require('./carrusel-video');
const { preparaCarruselIG, preparaReelIG, estadoIG, publicaIG, tokenInstagram } = require('./instagram-reels');
const { facebookConfig, publicaReel } = require('./facebook-reels');
const { enlacePublicoConfig, publicaCopia, borraCopia } = require('./enlace-publico');

const HORA_DEFECTO = '12:00';
const MAX_INTENTOS_DIA = 3;
const espera = ms => new Promise(ok => setTimeout(ok, ms));

/** ¿Toca publicar? Devuelve la fecha local (YYYY-MM-DD) o null. */
async function tocaHoy({ db, now = new Date() }) {
  if (await db.getSetting('instagram_carousel_enabled') !== 'true') return null;
  const tz = await db.getSetting('channel_timezone') || DEFAULT_TZ;
  const hoy = localDateKey(now, tz);
  const ultimo = JSON.parse(await db.getSetting('instagram_carousel_last') || '{}');
  if (ultimo.fecha === hoy && (ultimo.status === 'published' || (ultimo.intentos || 0) >= MAX_INTENTOS_DIA)) return null;
  const reloj = parseClock(await db.getSetting('instagram_carousel_time') || HORA_DEFECTO) || parseClock(HORA_DEFECTO);
  const [year, month, day] = hoy.split('-').map(Number);
  const hora = zonedToUtc({ year, month, day, ...reloj }, tz);
  return now.getTime() >= hora ? hoy : null;
}

/**
 * Publica el carrusel del día en cada red disponible:
 * - Instagram (`instagram_carousel_format`): 'carrusel' (imágenes, por
 *   defecto), 'reel' (vídeo con música) o 'ambos'. Necesita token + enlace público.
 * - Facebook (`facebook_carousel_reel`, 'true' por defecto): el vídeo con
 *   música como Reel de la Página (la API tampoco pone música a fotos).
 * Cada red se apunta por separado: un reintento no repite la que ya salió.
 */
async function publicaCarruselDelDia({
  db, ai, logger, env = process.env, now = new Date(), dirBase = path.join(process.cwd(), 'temp', 'carruseles'),
  deps = {}
}) {
  const hoy = await tocaHoy({ db, now });
  if (!hoy) return null;
  const enlace = deps.enlace || enlacePublicoConfig(env);
  const token = enlace ? await tokenInstagram(db, env) : null;
  const fb = facebookConfig(env);
  const formatoIG = ['carrusel', 'reel', 'ambos'].includes(await db.getSetting('instagram_carousel_format'))
    ? await db.getSetting('instagram_carousel_format') : 'carrusel';
  const quiereFB = fb && await db.getSetting('facebook_carousel_reel') !== 'false';
  if (!token && !quiereFB) return null;

  const d = {
    generaContenido: carrusel.generaContenido, renderiza: carrusel.renderiza, hazVideo: video.hazVideo,
    publicaCopia, borraCopia, preparaCarruselIG, preparaReelIG, estadoIG, publicaIG, publicaReel, espera, ...deps
  };
  const anterior = JSON.parse(await db.getSetting('instagram_carousel_last') || '{}');
  const mismoDia = anterior.fecha === hoy;
  const intentos = (mismoDia ? anterior.intentos || 0 : 0) + 1;
  const usados = JSON.parse(await db.getSetting('instagram_carousel_temas') || '[]');
  const tema = mismoDia && anterior.tema ? anterior.tema : carrusel.temaDelDia(now, usados);
  const redes = mismoDia ? { ...(anterior.redes || {}) } : {};
  const pendiente = clave => !redes[clave] || redes[clave].status !== 'published';
  const tareas = [];
  if (token && formatoIG !== 'reel' && pendiente('instagram_carrusel')) tareas.push('instagram_carrusel');
  if (token && formatoIG !== 'carrusel' && pendiente('instagram_reel')) tareas.push('instagram_reel');
  if (quiereFB && pendiente('facebook_reel')) tareas.push('facebook_reel');
  if (!tareas.length) return null;

  const copias = [];
  const carpeta = path.join(dirBase, hoy);
  // Espera a que Instagram procese el contenedor y lo publica.
  const publicaContenedor = async ({ containerId, igUserId }, intentosMax = 20) => {
    let estado = 'IN_PROGRESS';
    for (let i = 0; i < intentosMax && estado === 'IN_PROGRESS'; i += 1) {
      ({ status: estado } = await d.estadoIG({ token, containerId }));
      if (estado === 'IN_PROGRESS') await d.espera(15000);
    }
    if (estado !== 'FINISHED') throw new Error(`Instagram: contenedor ${estado}`);
    return d.publicaIG({ token, igUserId, containerId });
  };
  try {
    const datos = await d.generaContenido({ ai, tema });
    const texto = carrusel.textoCarrusel(datos);
    let reel = null;
    if (tareas.some(t => t.endsWith('_reel'))) {
      const fotos = await d.renderiza(datos, path.join(carpeta, 'video'), { video: true });
      reel = await d.hazVideo({ imagenes: fotos, datos, salida: path.join(carpeta, 'carrusel.mp4'), semilla: now.getTime() });
    }
    const conCredito = reel?.credito ? `${texto}\n\n${reel.credito}` : texto;

    for (const tarea of tareas) {
      try {
        if (tarea === 'instagram_carrusel') {
          const imagenes = await d.renderiza(datos, path.join(carpeta, 'imagenes'));
          const urls = [];
          for (const img of imagenes) { const c = await d.publicaCopia(img, enlace); copias.push(c); urls.push(c.url); }
          const r = await publicaContenedor(await d.preparaCarruselIG({ token, imageUrls: urls, caption: texto }));
          redes[tarea] = { status: 'published', mediaId: r.mediaId, url: r.permalink };
        } else if (tarea === 'instagram_reel') {
          const c = await d.publicaCopia(reel.ruta, enlace);
          copias.push(c);
          const r = await publicaContenedor(await d.preparaReelIG({ token, videoUrl: c.url, caption: conCredito }), 40);
          redes[tarea] = { status: 'published', mediaId: r.mediaId, url: r.permalink };
        } else if (tarea === 'facebook_reel') {
          const r = await d.publicaReel({ config: fb, videoPath: reel.ruta, description: conCredito, now });
          redes[tarea] = { status: 'published', reelId: r.videoId, url: `https://www.facebook.com/reel/${r.videoId}` };
        }
        logger?.success?.(`Carrusel del día (${tema}) → ${tarea}: ${redes[tarea].url || 'ok'}`);
      } catch (error) {
        redes[tarea] = { status: 'failed', error: error.message };
        logger?.warn?.(`Carrusel del día → ${tarea} falló (intento ${intentos}): ${error.message}`);
      }
    }
  } catch (error) {
    for (const t of tareas) if (pendiente(t)) redes[t] = { status: 'failed', error: error.message };
    logger?.warn?.(`Carrusel del día falló (intento ${intentos}): ${error.message}`);
  } finally {
    for (const c of copias) await d.borraCopia(c.nombre, enlace);
    await fs.promises.rm(carpeta, { recursive: true, force: true }).catch(() => {});
  }

  const todas = tareas.every(t => redes[t]?.status === 'published');
  const registro = { fecha: hoy, tema, status: todas ? 'published' : 'failed', redes, intentos, at: now.toISOString() };
  await db.setSetting('instagram_carousel_last', JSON.stringify(registro));
  if (Object.values(redes).some(r => r.status === 'published') && !usados.includes(tema)) {
    await db.setSetting('instagram_carousel_temas', JSON.stringify([tema, ...usados].slice(0, 8)));
  }
  return registro;
}

module.exports = { tocaHoy, publicaCarruselDelDia };
