/**
 * Video format: long (horizontal, the usual) or Short (vertical).
 *
 * 29/09/2026: the owner wants 2 prayer Shorts a day (morning and evening)
 * besides the 2 long videos. The format travels with each job in
 * `strategy.contentFormat`; VIDEO_ASPECT_RATIO in .env still rules the long
 * ones, so a Short never turns the rest of the channel vertical.
 */

const SHORT = 'short';
const LONG = 'long';

// YouTube accepts Shorts up to 3 min; 60-90 s is what gets watched to the end.
// 12/10/2026: SHORT_MAX_WORDS goes as a hard cap in the scriptwriter's prompt (the 13/10 Short came
// out with 220).
const SHORT_MAX_WORDS = 190;
const SHORT_LENGTH = `60-90 seconds (about 150-${SHORT_MAX_WORDS} spoken words in total)`;

function normalizaFormato(valor) {
  return String(valor || '').toLowerCase() === SHORT ? SHORT : LONG;
}

function esShort(strategyOrFormat) {
  const valor = typeof strategyOrFormat === 'string' ? strategyOrFormat : strategyOrFormat?.contentFormat;
  return normalizaFormato(valor) === SHORT;
}

/** Aspect ratio and render resolution for a format. */
function lienzo(formato, env = process.env) {
  if (esShort(formato)) return { aspectRatio: '9:16', resolution: '1080x1920' };
  return {
    aspectRatio: env.VIDEO_ASPECT_RATIO || '16:9',
    resolution: env.VIDEO_RESOLUTION === '720p' ? '1280x720' : '1920x1080'
  };
}

module.exports = { SHORT, LONG, SHORT_LENGTH, SHORT_MAX_WORDS, normalizaFormato, esShort, lienzo };
