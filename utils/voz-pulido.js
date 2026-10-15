/**
 * Voz más cálida y con más calidad (pedido del autor, 02/10/2026): misma voz de
 * ElevenLabs, pedida a 192 kbps y pulida después con ffmpeg. El pulido no cambia
 * el volumen (se mide antes y después y se compensa con una ganancia fija), así
 * la mezcla con el piano queda como estaba. Tampoco cambia la duración, así que
 * los tiempos de los subtítulos siguen valiendo.
 *
 * Env: VOICE_OUTPUT_FORMAT (mp3_44100_192), VOICE_POLISH=0 lo apaga.
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

/** Cuerpo en graves, menos «s» chillonas, compresión suave y una sala muy leve. */
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

/** Pule el mp3 en su sitio. Si algo falla deja la voz original y avisa. */
async function pulirVoz(ruta, logger) {
  if (!pulidoActivo()) return false;
  const tmp = `${ruta}.pulido.mp3`;
  const fin = `${ruta}.final.mp3`;
  try {
    await runFFmpeg(['-y', '-v', 'error', '-i', ruta, '-af', cadenaPulido(), '-b:a', '192k', tmp]);
    const g = gananciaCompensada(await sonoridad(ruta), await sonoridad(tmp));
    await runFFmpeg(['-y', '-v', 'error', '-i', ruta, '-af', `${cadenaPulido()},volume=${g}dB,alimiter=limit=0.89`, '-b:a', '192k', fin]);
    await fs.rename(fin, ruta);
    logger?.info?.(`Voz pulida (cálida, ganancia ${g} dB)`);
    return true;
  } catch (error) {
    logger?.warn?.(`Pulido de voz no aplicado: ${error.message}`);
    return false;
  } finally {
    await Promise.all([fs.unlink(tmp).catch(() => {}), fs.unlink(fin).catch(() => {})]);
  }
}

module.exports = { formatoSalida, pulidoActivo, cadenaPulido, gananciaCompensada, pulirVoz };
