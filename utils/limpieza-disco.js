/**
 * Daily disk cleanup (30/09/2026, the VPS disk reached 97%).
 * Rules agreed with the owner:
 *   · temp/timeline/prod_*  editing leftovers: removed once they've sat idle for 6 h
 *                           (the shot cache, shot-cache, has its own pruning)
 *   · videos/ and audio/    final video and narration: removed 3 days after being
 *                           published on YouTube; if the production was never
 *                           scheduled (failed or discarded), after 7 days
 *   · assets/stock          clip library with a cap (8 GB): the ones without a
 *                           record go first, then the least used;
 *                           never what was used in the last 24 h
 * It doesn't run while a video is being generated.
 */
const fs = require('fs').promises;
const path = require('path');
const { rutaFicha } = require('./biblioteca-stock');

const HORA = 3600000;
const DIA = 24 * HORA;
const GB = 1024 ** 3;

function produccionDe(nombre) {
  const m = path.basename(String(nombre)).match(/^(prod_\d+_[a-z0-9]+_[a-z0-9]+)_/i);
  return m ? m[1] : null;
}

/** Decides what to delete. Pure: doesn't touch the disk. */
function planLimpieza({ ahora = Date.now(), dias = 3, diasHuerfanos = 7, topeStock = 8 * GB,
  temporales = [], producciones = new Map(), finales = [], stock = [] } = {}) {
  const borrar = [];
  let bytes = 0;
  const fuera = (ruta, size = 0) => { borrar.push(ruta); bytes += size; };

  for (const t of temporales) {
    if (/^prod_/.test(path.basename(t.ruta)) && ahora - t.mtimeMs > 6 * HORA) fuera(t.ruta, t.size || 0);
  }

  for (const f of finales) {
    const id = produccionDe(f.ruta);
    if (!id) continue;
    const p = producciones.get(id);
    if (p?.pendiente) continue;
    const caduca = p?.publicadoMs ? ahora - p.publicadoMs > dias * DIA : (!p && ahora - f.mtimeMs > diasHuerfanos * DIA);
    if (caduca) fuera(f.ruta, f.size);
  }

  let total = stock.reduce((n, s) => n + s.size, 0);
  const candidatos = stock
    .filter(s => ahora - s.usadoMs > DIA)
    .sort((a, b) => (a.conFicha === b.conFicha ? a.usadoMs - b.usadoMs : a.conFicha ? 1 : -1));
  for (const s of candidatos) {
    if (total <= topeStock) break;
    fuera(s.ruta, s.size);
    if (s.conFicha && s.fichaRuta) borrar.push(s.fichaRuta);
    total -= s.size;
  }
  return { borrar, bytes };
}

async function lista(dir) {
  const nombres = await fs.readdir(dir).catch(() => []);
  const out = [];
  for (const nombre of nombres) {
    const ruta = path.join(dir, nombre);
    const st = await fs.stat(ruta).catch(() => null);
    if (st) out.push({ ruta, nombre, size: st.size, mtimeMs: st.mtimeMs, esDir: st.isDirectory() });
  }
  return out;
}

async function tamanoDir(dir) {
  let n = 0;
  for (const e of await lista(dir)) n += e.esDir ? await tamanoDir(e.ruta) : e.size;
  return n;
}

/** Gathers the real state, plans and deletes (or only reports with `simular`). */
async function limpiaDisco({ db, dataRoot, ahora = Date.now(), logger = console, simular = false,
  topeStock = (Number(process.env.STOCK_LIBRARY_GB) || 8) * GB } = {}) {
  const enCurso = await db.getRow("SELECT COUNT(*) AS n FROM generation_jobs WHERE status IN ('queued', 'running')");
  if (Number(enCurso?.n || 0) > 0) {
    logger.info('Disk cleanup: a video is being generated, leaving it for next time');
    return { borrar: [], bytes: 0, aplazada: true };
  }

  const producciones = new Map();
  const filas = await db.getAllRows("SELECT production_id, publish_time, youtube_id, status FROM publish_schedule WHERE status NOT IN ('failed', 'cancelled')");
  for (const f of filas) {
    const publicado = f.youtube_id && Date.parse(f.publish_time) <= ahora;
    const previo = producciones.get(f.production_id);
    if (!publicado) producciones.set(f.production_id, { pendiente: true });
    else if (!previo?.pendiente) producciones.set(f.production_id, { publicadoMs: Math.max(previo?.publicadoMs || 0, Date.parse(f.publish_time)) });
  }

  const temporales = [];
  for (const t of await lista(path.join(dataRoot, 'temp', 'timeline'))) {
    if (t.esDir && t.nombre.startsWith('prod_')) temporales.push({ ...t, size: await tamanoDir(t.ruta) });
  }
  const finales = [...await lista(path.join(dataRoot, 'videos')), ...await lista(path.join(dataRoot, 'audio'))].filter(f => !f.esDir);

  const dirStock = path.join(dataRoot, 'assets', 'stock');
  const enStock = await lista(dirStock);
  const fichas = new Set(enStock.filter(e => e.nombre.endsWith('.json')).map(e => e.ruta));
  const stock = enStock
    .filter(e => !e.esDir && !e.nombre.endsWith('.json') && !e.nombre.endsWith('.part'))
    .map(e => ({ ruta: e.ruta, size: e.size, usadoMs: e.mtimeMs, conFicha: fichas.has(rutaFicha(e.ruta)), fichaRuta: rutaFicha(e.ruta) }));

  const plan = planLimpieza({ ahora, producciones, temporales, finales, stock, topeStock });
  if (!simular) {
    for (const ruta of plan.borrar) await fs.rm(ruta, { recursive: true, force: true }).catch(e => logger.warn(`Could not delete ${ruta}: ${e.message}`));
  }
  logger.info(`Limpieza de disco${simular ? ' (simulada)' : ''}: ${plan.borrar.length} archivos, ${(plan.bytes / GB).toFixed(2)} GB`);
  return plan;
}

module.exports = { planLimpieza, limpiaDisco, produccionDe };
