/**
 * Volumen final del vídeo a -14 LUFS (06/10/2026). YouTube baja los vídeos que
 * suenan más fuerte que -14 pero NO sube los flojos: los Shorts salían a -30 LUFS
 * y los largos a -18, muy por debajo de lo que suena el resto del feed.
 * Se mide la sonoridad integrada del vídeo ya mezclado (voz + música + intro), se
 * aplica la ganancia que falta y un limitador a -1,5 dBTP para que no recorte.
 * Solo se recodifica el audio (-c:v copy): segundos, no minutos.
 * Env: TARGET_LUFS (-14), LOUDNORM=0 lo apaga.
 */
const fs = require('fs').promises;
const { runFFmpeg } = require('./ffmpeg');

const objetivo = (env = process.env) => {
  const n = Number(env.TARGET_LUFS);
  return Number.isFinite(n) && n < -5 && n > -30 ? n : -14;
};

async function mideLufs(ruta) {
  const { stderr } = await runFFmpeg(['-hide_banner', '-nostats', '-i', ruta, '-vn', '-af', 'ebur128', '-f', 'null', '-']);
  const m = [...String(stderr).matchAll(/^\s+I:\s+(-?[\d.]+) LUFS/gm)].pop();
  return m ? Number(m[1]) : NaN;
}

/** Ganancia a aplicar (dB): la que falta hasta el objetivo, como mucho +20 dB y -10 dB. */
function ganancia(medido, meta = objetivo()) {
  if (!Number.isFinite(medido) || medido < -70) return 0; // silencio: no inventar volumen
  const g = meta - medido;
  return Math.round(Math.max(-10, Math.min(20, g)) * 10) / 10;
}

/** Normaliza el audio del MP4 en su sitio. Devuelve { antes, despues, ganancia } o null si no hizo falta. */
async function normalizaVideo(ruta, { logger, env = process.env, mide = mideLufs, ejecuta = runFFmpeg } = {}) {
  if (env.LOUDNORM === '0') return null;
  const antes = await mide(ruta);
  const g = ganancia(antes, objetivo(env));
  if (Math.abs(g) < 0.5) return { antes, despues: antes, ganancia: 0 };
  const tmp = ruta.replace(/\.mp4$/i, '_lufs.mp4');
  try {
    await ejecuta(['-y', '-v', 'error', '-i', ruta, '-map', '0', '-c:v', 'copy',
      '-af', `volume=${g}dB,alimiter=limit=0.84:level=false`, '-c:a', 'aac', '-b:a', '192k', '-ar', '44100', '-movflags', '+faststart', tmp]);
    await fs.rename(tmp, ruta);
    const despues = await mide(ruta);
    logger?.info?.(`Volumen del vídeo: ${antes} → ${despues} LUFS (${g > 0 ? '+' : ''}${g} dB)`);
    return { antes, despues, ganancia: g };
  } catch (error) {
    await fs.unlink(tmp).catch(() => {});
    logger?.warn?.(`Volumen no normalizado (${error.message}); se deja como estaba`);
    return null;
  }
}

module.exports = { objetivo, ganancia, mideLufs, normalizaVideo };
