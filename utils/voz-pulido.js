/**
 * A warmer, higher-quality voice (requested by the owner, 02/10/2026): the same
 * ElevenLabs voice, requested at 192 kbps and polished afterwards with ffmpeg. The
 * polish doesn't change the volume (it's measured before and after and compensated
 * with a fixed gain), so the mix with the piano stays as it was. It doesn't change
 * the duration either, so the caption timings still hold.
 *
 * Env: VOICE_OUTPUT_FORMAT (mp3_44100_192), VOICE_POLISH=0 turns it off.
 */
const fs = require('fs').promises;
const { runFFmpeg } = require('./ffmpeg');

function formatoSalida(env = process.env) {
  const f = String(env.VOICE_OUTPUT_FORMAT || '');
  return /^mp3_\d{5}_\d{2,3}$/.test(f) ? f : 'mp3_44100_192';
}

function pulidoActivo(env = process.env) {
  return env.VOICE_POLISH !== '0';
}

/** Body in the lows, fewer shrill «s» sounds, soft compression and a very light room. */
function cadenaPulido() {
  return [
    'highpass=f=70',
    'equalizer=f=180:t=q:w=0.9:g=2.5',
    'equalizer=f=3200:t=q:w=1.4:g=-1.8',
    'deesser=i=0.35',
    'acompressor=threshold=-21dB:ratio=2.2:attack=12:release=220',
    'aecho=1.0:0.95:35|60:0.06|0.04'
  ].join(',');
}

function gananciaCompensada(entrada, salida) {
  const g = Number(entrada) - Number(salida);
  if (!Number.isFinite(g)) return 0;
  return Math.round(Math.max(-12, Math.min(12, g)) * 100) / 100;
}

async function sonoridad(ruta) {
  const { stderr } = await runFFmpeg(['-hide_banner', '-nostats', '-i', ruta, '-af', 'ebur128', '-f', 'null', '-']);
  const m = [...String(stderr).matchAll(/^\s+I:\s+(-?[\d.]+) LUFS/gm)].pop();
  return m ? Number(m[1]) : NaN;
}

/** Polishes the mp3 in place. If anything fails it keeps the original voice and warns. */
async function pulirVoz(ruta, logger) {
  if (!pulidoActivo()) return false;
  const tmp = `${ruta}.pulido.mp3`;
  const fin = `${ruta}.final.mp3`;
  try {
    await runFFmpeg(['-y', '-v', 'error', '-i', ruta, '-af', cadenaPulido(), '-b:a', '192k', tmp]);
    const g = gananciaCompensada(await sonoridad(ruta), await sonoridad(tmp));
    await runFFmpeg(['-y', '-v', 'error', '-i', ruta, '-af', `${cadenaPulido()},volume=${g}dB,alimiter=limit=0.89`, '-b:a', '192k', fin]);
    await fs.rename(fin, ruta);
    logger?.info?.(`Voice polished (warm, gain ${g} dB)`);
    return true;
  } catch (error) {
    logger?.warn?.(`Voice polish not applied: ${error.message}`);
    return false;
  } finally {
    await Promise.all([fs.unlink(tmp).catch(() => {}), fs.unlink(fin).catch(() => {})]);
  }
}

module.exports = { formatoSalida, pulidoActivo, cadenaPulido, gananciaCompensada, pulirVoz };
