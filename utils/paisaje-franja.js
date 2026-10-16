/**
 * Landscapes by time of day (02/10/2026, the owner: «more landscapes, and related
 * to whether it's night or day»). Used by storyboard-pipeline's clip picking: one
 * of each scene's searches is a landscape for the time of day, and the score
 * boosts landscapes and sinks what clashes with the time.
 */
const { franjaDelContenido } = require('./franja');

const PAISAJES = {
  manana: [
    'sunrise over mountains landscape', 'morning mist over calm lake', 'sunlight through forest trees morning',
    'golden sunrise over calm sea', 'morning light over green fields', 'river at dawn',
    'sunrise over rolling hills', 'waterfall in morning sunlight'
  ],
  tarde: [
    'golden hour countryside landscape', 'sunset over mountains', 'warm afternoon light over fields',
    'calm lake at golden hour', 'sunset clouds over the sea', 'forest path at golden hour'
  ],
  noche: [
    'starry night sky over mountains', 'moonlight over the ocean', 'calm lake at night with stars',
    'milky way night sky over landscape', 'night sky over quiet meadow', 'full moon behind clouds at night',
    'forest under starry sky', 'moonlit river at night'
  ]
};

const PAISAJE = /\b(mountains?|lakes?|seas?|ocean|forests?|trees|fields?|meadows?|rivers?|waterfalls?|sky|clouds?|sunrise|sunset|dawn|landscape|hills?|valley|beach|nature|stars|starry|moon|moonlight|milky way|horizon|countryside|mist)\b/;
const DE_DIA = /\b(sunrise|morning|sunny|daylight|daytime|noon|blue sky|dawn)\b/;
const DE_NOCHE = /\b(night|nighttime|stars|starry|moon|moonlight|moonlit|milky way|midnight|dark sky)\b/;

/** 'manana' | 'tarde' | 'noche' from the content (script) or the slot; morning by default. */
function momentoDe(production = {}) {
  const f = franjaDelContenido(production.script || {}, production.strategy || {});
  return { 'MAÑANA': 'manana', TARDE: 'tarde', NOCHE: 'noche' }[f] || 'manana';
}

/** Landscape search for scene `i` (rotates so the same place doesn't repeat). */
function consultaPaisaje(momento, i = 0) {
  const lista = PAISAJES[momento] || PAISAJES.manana;
  return lista[((i % lista.length) + lista.length) % lista.length];
}

function texto(asset = {}) {
  const claves = (asset.keywords || []).map(k => (typeof k === 'string' ? k : k?.name || '')).join(' ');
  return `${asset.title || ''} ${asset.description || ''} ${claves}`.toLowerCase();
}

/** Score adjustment: + landscape, + right time of day, −− opposite time of day. */
function ajustePaisaje(asset, momento) {
  const t = texto(asset);
  let ajuste = PAISAJE.test(t) ? 8 : 0;
  const dia = DE_DIA.test(t);
  const noche = DE_NOCHE.test(t);
  if (momento === 'noche') ajuste += (noche ? 6 : 0) - (dia && !noche ? 25 : 0);
  else if (momento === 'manana') ajuste += (dia ? 6 : 0) - (noche && !dia ? 25 : 0);
  else ajuste -= noche && !dia ? 12 : 0;   // afternoon: golden hour; full night is out of place
  return ajuste;
}

module.exports = { momentoDe, consultaPaisaje, ajustePaisaje, PAISAJES };
