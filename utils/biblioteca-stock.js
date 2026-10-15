/**
 * Biblioteca de clips reutilizables (30/09/2026).
 *
 * Cada clip descargado de Pexels se guarda con una ficha al lado
 * (`<clip>.json`: título, etiquetas, tamaño, duración, URL y usos). Con ella,
 * los vídeos siguientes buscan primero aquí antes de descargar nada, y al
 * reutilizar un clip lo pasan con otra VARIANTE (otra parte del clip, espejo,
 * tono, movimiento, velocidad) para que no se vea dos veces igual.
 *
 * Los clips sin ficha (descargados antes de esto) no se pueden encontrar por
 * tema: son los primeros que borra la limpieza del disco (utils/limpieza-disco.js).
 */
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { tokens, orientationMatches } = require('./stock-adapters/media');

const EXT_FICHA = '.json';
const MAX_USOS = 20;
const RECIENTE_MS = 2 * 86400000;   // usado hace menos de 2 días → detrás

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

/** Escribe (o refresca) la ficha de un clip sin perder sus usos. */
async function guardaFicha(media, asset) {
  const previa = await leeJSON(rutaFicha(media));
  const ficha = fichaDe(asset, previa?.usos || []);
  const tmp = `${rutaFicha(media)}.${crypto.randomUUID()}.part`;
  await fs.writeFile(tmp, JSON.stringify(ficha));
  await fs.rename(tmp, rutaFicha(media));
  return ficha;
}

/** Todas las fichas cuyo clip sigue en disco. */
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

/** Clips de la biblioteca que encajan con la escena, mejor primero. Deben compartir al menos una palabra. */
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

/** Apunta que una producción usó el clip (y lo marca como usado para la limpieza). */
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
 * Variante para el uso nº `usosPrevios` de un clip (0 = primera vez → tal cual).
 * Determinista por `semilla`: volver a montar el mismo vídeo da la misma variante
 * y la caché de planos sigue sirviendo.
 */
function elegirVariante(usosPrevios, semilla = '') {
  if (!(usosPrevios > 0)) return null;
  const h = parseInt(crypto.createHash('sha1').update(String(semilla)).digest('hex').slice(0, 8), 16);
  const n = h + usosPrevios;
  return {
    espejo: n % 2 === 1,
    tono: TONOS[Math.floor(n / 2) % TONOS.length],
    // Solo la mitad lleva movimiento: el zoompan multiplica x5 el tiempo de montaje del plano.
    movimiento: ((h >>> 3) + usosPrevios) % 2 === 0 ? MOVIMIENTOS[(h + usosPrevios * 3) % MOVIMIENTOS.length] : 'none',
    velocidad: (h + usosPrevios) % 3 === 2 ? 0.8 : 1,
    inicio: ((h >>> 5) + usosPrevios * 37) % 60 / 100
  };
}

module.exports = { fichaDe, guardaFicha, leeFichas, busca, registraUso, elegirVariante, rutaFicha, TONOS, MOVIMIENTOS };
