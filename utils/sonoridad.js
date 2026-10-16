/**
 * The video's final loudness at -14 LUFS (06/10/2026). YouTube turns down videos
 * louder than -14 but does NOT turn up quiet ones: Shorts came out at -30 LUFS and
 * long videos at -18, far below the rest of the feed.
 * The integrated loudness of the already mixed video (voice + music + intro) is
 * measured, the missing gain is applied and a limiter at -1.5 dBTP so it doesn't
 * clip.
 * Only the audio is re-encoded (-c:v copy): seconds, not minutes.
 * Env: TARGET_LUFS (-14), LOUDNORM=0 turns it off.
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

/** Gain to apply (dB): what's missing to reach the target, at most +20 dB and -10 dB. */
function ganancia(medido, meta = objetivo()) {
  if (!Number.isFinite(medido) || medido < -70) return 0; // silence: don't invent volume
  const g = meta - medido;
  return Math.round(Math.max(-10, Math.min(20, g)) * 10) / 10;
}

/** Normalizes the MP4's audio in place. Returns { antes, despues, ganancia } or null if it wasn't needed. */
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
    logger?.info?.(`Video loudness: ${antes} → ${despues} LUFS (${g > 0 ? '+' : ''}${g} dB)`);
    return { antes, despues, ganancia: g };
  } catch (error) {
    await fs.unlink(tmp).catch(() => {});
    logger?.warn?.(`Loudness not normalized (${error.message}); left as it was`);
    return null;
  }
}

module.exports = { objetivo, ganancia, mideLufs, normalizaVideo };
