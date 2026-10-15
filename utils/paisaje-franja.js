/**
 * Paisajes según la hora del día (02/10/2026, el autor: «que sean más paisajes y
 * relacionados si es de noche o de día»). Lo usa la selección de clips de
 * storyboard-pipeline: una de las búsquedas de cada escena es un paisaje de la
 * franja, y la puntuación sube los paisajes y hunde lo que choca con la hora.
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

/** 'manana' | 'tarde' | 'noche' del contenido (guion) o del hueco; por defecto mañana. */
function momentoDe(production = {}) {
  const f = franjaDelContenido(production.script || {}, production.strategy || {});
  return { 'MAÑANA': 'manana', TARDE: 'tarde', NOCHE: 'noche' }[f] || 'manana';
}

/** Búsqueda de paisaje para la escena `i` (rota para no repetir el mismo sitio). */
function consultaPaisaje(momento, i = 0) {
  const lista = PAISAJES[momento] || PAISAJES.manana;
  return lista[((i % lista.length) + lista.length) % lista.length];
}

function texto(asset = {}) {
  const claves = (asset.keywords || []).map(k => (typeof k === 'string' ? k : k?.name || '')).join(' ');
  return `${asset.title || ''} ${asset.description || ''} ${claves}`.toLowerCase();
}

/** Ajuste de puntuación: + paisaje, + franja correcta, −− franja contraria. */
function ajustePaisaje(asset, momento) {
  const t = texto(asset);
  let ajuste = PAISAJE.test(t) ? 8 : 0;
  const dia = DE_DIA.test(t);
  const noche = DE_NOCHE.test(t);
  if (momento === 'noche') ajuste += (noche ? 6 : 0) - (dia && !noche ? 25 : 0);
  else if (momento === 'manana') ajuste += (dia ? 6 : 0) - (noche && !dia ? 25 : 0);
  else ajuste -= noche && !dia ? 12 : 0;   // tarde: hora dorada; la noche cerrada desentona
  return ajuste;
}

module.exports = { momentoDe, consultaPaisaje, ajustePaisaje, PAISAJES };
