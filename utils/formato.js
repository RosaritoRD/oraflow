/**
 * Formato del vídeo: largo (horizontal, el de siempre) o Short (vertical).
 *
 * 29/09/2026: el autor quiere 2 Shorts de oración al día (mañana y noche) además
 * de los 2 vídeos largos. El formato viaja con cada encargo en
 * `strategy.contentFormat`; VIDEO_ASPECT_RATIO del .env sigue mandando para
 * los largos, así que un Short nunca vuelve vertical al resto del canal.
 */

const SHORT = 'short';
const LONG = 'long';

// YouTube acepta Shorts de hasta 3 min; 60-90 s es lo que se termina de ver.
// 12/10/2026: SHORT_MAX_WORDS va como tope duro en el prompt del guionista (el Short del 13/10 salió con 220).
const SHORT_MAX_WORDS = 190;
const SHORT_LENGTH = `60-90 seconds (about 150-${SHORT_MAX_WORDS} spoken words in total)`;

function normalizaFormato(valor) {
  return String(valor || '').toLowerCase() === SHORT ? SHORT : LONG;
}

function esShort(strategyOrFormat) {
  const valor = typeof strategyOrFormat === 'string' ? strategyOrFormat : strategyOrFormat?.contentFormat;
  return normalizaFormato(valor) === SHORT;
}

/** Relación de aspecto y resolución del render para un formato. */
function lienzo(formato, env = process.env) {
  if (esShort(formato)) return { aspectRatio: '9:16', resolution: '1080x1920' };
  return {
    aspectRatio: env.VIDEO_ASPECT_RATIO || '16:9',
    resolution: env.VIDEO_RESOLUTION === '720p' ? '1280x720' : '1920x1080'
  };
}

module.exports = { SHORT, LONG, SHORT_LENGTH, SHORT_MAX_WORDS, normalizaFormato, esShort, lienzo };
