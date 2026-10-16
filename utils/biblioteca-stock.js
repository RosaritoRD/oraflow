/**
 * Library of reusable clips (30/09/2026).
 *
 * Every clip downloaded from Pexels is stored with a record next to it (`<clip>.json`:
 * title, tags, size, duration, URL and uses). With it, the next videos look here first
 * before downloading anything, and when they reuse a clip they pass it through another
 * VARIANT (another part of the clip, mirror, tone, motion, speed) so it never looks
 * the same twice.
 *
 * Clips without a record (downloaded before this) can't be found by topic: they're the
 * first ones the disk cleanup deletes (utils/limpieza-disco.js).
 */
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { tokens, orientationMatches } = require('./stock-adapters/media');

const EXT_FICHA = '.json';
const MAX_USOS = 20;
const RECIENTE_MS = 2 * 86400000;   // used less than 2 days ago → to the back

const rutaFicha = (media) => `${media}${EXT_FICHA}`;

function fichaDe(asset, usos = []) {
  return {
    source: asset.source, id: String(asset.id), type: asset.type,
    title: asset.title || '', keywords: (asset.keywords || []).map(k => (typeof k === 'string' ? k : k?.name || '')).filter(Boolean),
    width: asset.width || null, height: asset.height || null, durationSec: asset.durationSec || null,
    url: asset.url || null, license: asset.license || null,
    guardada: new Date().toISOString(), usos
  };
}

async function leeJSON(ruta) {
  try { return JSON.parse(await fs.readFile(ruta, 'utf8')); } catch { return null; }
}

/** Writes (or refreshes) a clip's record without losing its uses. */
async function guardaFicha(media, asset) {
  const previa = await leeJSON(rutaFicha(media));
  const ficha = fichaDe(asset, previa?.usos || []);
  const tmp = `${rutaFicha(media)}.${crypto.randomUUID()}.part`;
  await fs.writeFile(tmp, JSON.stringify(ficha));
  await fs.rename(tmp, rutaFicha(media));
  return ficha;
}

/** Every record whose clip is still on disk. */
async function leeFichas(dir) {
  const nombres = await fs.readdir(dir).catch(() => []);
  const out = [];
  for (const nombre of nombres) {
    if (!nombre.endsWith(EXT_FICHA)) continue;
    const media = path.join(dir, nombre.slice(0, -EXT_FICHA.length));
    const ficha = await leeJSON(path.join(dir, nombre));
    if (!ficha?.id || !ficha.url) continue;
    if (!(await fs.stat(media).then(st => st.isFile() && st.size > 0).catch(() => false))) continue;
    out.push({ ruta: media, ficha });
  }
  return out;
}

/** Library clips that fit the scene, best first. They must share at least one word. */
function busca(fichas, { queries = [], tipo = 'video', orientacion = 'landscape', minDuracion = 0, excluir = new Set(), limite = 12, ahora = Date.now() } = {}) {
  const buscadas = tokens(queries.join(' '));
  return fichas
    .filter(({ ficha: f }) => !excluir.has(f.id) && orientationMatches(f.width, f.height, orientacion)
      && (f.type !== 'video' || (f.durationSec || 0) >= minDuracion))
    .map(({ ficha: f }) => {
      const propias = tokens(`${f.title} ${f.keywords.join(' ')}`);
      const coinciden = [...buscadas].filter(t => propias.has(t)).length;
      const ultimo = Math.max(0, ...f.usos.map(u => Date.parse(u.en) || 0));
      const puntos = coinciden * 10 + (f.type === tipo ? 3 : 0) - (ahora - ultimo < RECIENTE_MS ? 8 : 0) - f.usos.length;
      return { f, coinciden, puntos };
    })
    .filter(x => x.coinciden > 0)
    .sort((a, b) => b.puntos - a.puntos)
    .slice(0, limite)
    .map(({ f }) => ({
      source: f.source, id: f.id, type: f.type, title: f.title, keywords: f.keywords, url: f.url,
      width: f.width, height: f.height, durationSec: f.durationSec, license: f.license,
      downloadable: true, desdeBiblioteca: true, usos: f.usos.length
    }));
}

/** Notes that a production used the clip (and marks it as used for the cleanup). */
async function registraUso(media, produccion, en = new Date()) {
  const ficha = await leeJSON(rutaFicha(media));
  if (ficha) {
    ficha.usos = [...(ficha.usos || []), { produccion, en: en.toISOString() }].slice(-MAX_USOS);
    await fs.writeFile(rutaFicha(media), JSON.stringify(ficha));
  }
  await fs.utimes(media, en, en).catch(() => {});
}

const TONOS = ['neutro', 'calido', 'frio', 'suave'];
const MOVIMIENTOS = ['zoom-in', 'zoom-out', 'pan-left', 'pan-right'];

/**
 * Variant for use number `usosPrevios` of a clip (0 = first time → as is).
 * Deterministic by `semilla`: re-editing the same video gives the same variant and
 * the shot cache still works.
 */
function elegirVariante(usosPrevios, semilla = '') {
  if (!(usosPrevios > 0)) return null;
  const h = parseInt(crypto.createHash('sha1').update(String(semilla)).digest('hex').slice(0, 8), 16);
  const n = h + usosPrevios;
  return {
    espejo: n % 2 === 1,
    tono: TONOS[Math.floor(n / 2) % TONOS.length],
    // Only half get motion: zoompan multiplies the shot's editing time by 5.
    movimiento: ((h >>> 3) + usosPrevios) % 2 === 0 ? MOVIMIENTOS[(h + usosPrevios * 3) % MOVIMIENTOS.length] : 'none',
    velocidad: (h + usosPrevios) % 3 === 2 ? 0.8 : 1,
    inicio: ((h >>> 5) + usosPrevios * 37) % 60 / 100
  };
}

module.exports = { fichaDe, guardaFicha, leeFichas, busca, registraUso, elegirVariante, rutaFicha, TONOS, MOVIMIENTOS };
