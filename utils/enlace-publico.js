/**
 * A temporary public link so Instagram can download a Short or a carousel's images
 * (04/10/2026).
 *
 * Instagram (Instagram login) only accepts `video_url`, and Meta rejects its own
 * links (fbcdn: "First-party URLs are restricted").
 * The dashboard's login (oauth2-proxy) serves WITHOUT login only `GET /ig-media/<48
 * hex>.mp4|.jpg` from this folder (upstream file://, mounted read-only): Oraflow
 * isn't exposed and a name can't be guessed.
 * Each copy is deleted once Instagram has fetched it, and those older than 26 h
 * always.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const NOMBRE = /^[a-f0-9]{48}\.(mp4|jpg)$/;
const CADUCA_MS = 26 * 3600000;

function enlacePublicoConfig(env = process.env) {
  const dir = String(env.IG_MEDIA_DIR || '').trim();
  const base = String(env.IG_MEDIA_BASE_URL || '').trim().replace(/\/+$/, '');
  return dir && /^https:\/\//.test(base) ? { dir, base } : null;
}

async function publicaCopia(videoPath, config) {
  const extension = /\.jpe?g$/i.test(videoPath) ? 'jpg' : 'mp4';
  const nombre = `${crypto.randomBytes(24).toString('hex')}.${extension}`;
  await fs.promises.mkdir(config.dir, { recursive: true });
  const destino = path.join(config.dir, nombre);
  await fs.promises.copyFile(videoPath, destino);
  await fs.promises.chmod(destino, 0o644);
  return { nombre, url: `${config.base}/${nombre}` };
}

async function borraCopia(nombre, config) {
  if (!config || !NOMBRE.test(String(nombre || ''))) return false;
  await fs.promises.unlink(path.join(config.dir, nombre)).catch(() => {});
  return true;
}

async function limpiaCopiasViejas(config, now = Date.now()) {
  if (!config) return 0;
  let borradas = 0;
  for (const nombre of await fs.promises.readdir(config.dir).catch(() => [])) {
    if (!NOMBRE.test(nombre)) continue;
    const ruta = path.join(config.dir, nombre);
    const { mtimeMs } = await fs.promises.stat(ruta).catch(() => ({ mtimeMs: now }));
    if (now - mtimeMs > CADUCA_MS) {
      await fs.promises.unlink(ruta).catch(() => {});
      borradas += 1;
    }
  }
  return borradas;
}

module.exports = { enlacePublicoConfig, publicaCopia, borraCopia, limpiaCopiasViejas };
