/**
 * ffmpeg en el PC del autor (07/10/2026): "haz los vídeos en mi PC; solo si
 * falla, en la VPS". Todo el ffmpeg de Oraflow pasa por runFFmpeg
 * (utils/ffmpeg.js), que primero prueba aquí.
 *
 * El taller (C:\taller\taller.py, puerto 8096, solo acepta a la VPS) guarda
 * los archivos por su sha256: cada entrada se sube una vez y lo que el taller
 * produce ya está allí para el paso siguiente. Las rutas absolutas de la VPS se
 * cambian por relativas (e/0.mp4, e/d0/, e/q0/f_%03d.png) y la salida vuelve a
 * su ruta original. Lo que no se puede llevar (tuberías, `-f null -`, salidas
 * con patrón, rutas que no existen) se queda en la VPS: preparaTrabajo → null.
 *
 * Cualquier fallo del taller (PC apagado, red, error de ffmpeg) lo resuelve
 * runFFmpeg haciéndolo en local: nunca se pierde un render por esto.
 */
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

// Rutas absolutas de la VPS/contenedor dentro de un argumento (sueltas o en un filtro).
const PATRON_RUTA = /\/(?:app|tmp|shorts|usr|data|root|home|opt|var)\/[A-Za-z0-9_.\/@+%'-]*[A-Za-z0-9_%]/g;
const HAY_RUTA = new RegExp(PATRON_RUTA.source); // sin /g: .test() sin estado
const NOMBRE_SEGURO = /^[A-Za-z0-9_.%-]{1,100}$/;
const SALIDA_LOCAL = /^(-|pipe:.*|\/dev\/null)$/;
const MAX_ARCHIVOS_CARPETA = 300;
const FUENTES_POR_DEFECTO = path.join(__dirname, '..', 'data', 'assets', 'fuentes');

const espera = ms => new Promise(r => setTimeout(r, ms));

// sha256 por (ruta, tamaño, fecha): no se vuelve a leer un archivo que no cambió.
const shas = new Map();
async function sha256DeArchivo(ruta) {
  const st = await fsp.stat(ruta);
  const clave = `${ruta}|${st.size}|${st.mtimeMs}`;
  if (shas.has(clave)) return shas.get(clave);
  const h = crypto.createHash('sha256');
  await new Promise((res, rej) => fs.createReadStream(ruta).on('data', d => h.update(d)).on('end', res).on('error', rej));
  const sha = h.digest('hex');
  if (shas.size > 5000) shas.clear();
  shas.set(clave, sha);
  return sha;
}

const existe = async ruta => fsp.stat(ruta).catch(() => null);

/** Lista de concat ("file '/ruta'"): rutas que nombra, o null si no lo es. */
function rutasDeLista(texto) {
  const lineas = String(texto).split(/\r?\n/).filter(l => l.trim() && !l.trim().startsWith('#'));
  if (!lineas.length) return null;
  const rutas = [];
  for (const l of lineas) {
    const m = l.match(/^\s*file\s+'((?:[^']|'\\'')*)'\s*$/);
    if (!m) return null;
    rutas.push(m[1].replace(/'\\''/g, "'"));
  }
  return rutas;
}

/**
 * args de ffmpeg con rutas de la VPS → trabajo para el taller, o null si se
 * queda en local. { args, entradas: [{ rel, ruta?|contenido? }], salida: { rel, ruta } }
 */
async function preparaTrabajo(args, { fuentes = FUENTES_POR_DEFECTO } = {}) {
  if (!Array.isArray(args) || args.length < 2) return null;
  const rutaSalida = String(args[args.length - 1]);
  if (SALIDA_LOCAL.test(rutaSalida) || !rutaSalida.startsWith('/') || rutaSalida.includes('%')) return null;
  const stSalida = await existe(rutaSalida);
  if (stSalida?.isDirectory() || !(await existe(path.dirname(rutaSalida)))?.isDirectory()) return null;

  const entradas = [];
  const mapa = new Map(); // ruta absoluta → relativa
  let nArchivo = 0; let nCarpeta = 0; let nSecuencia = 0;

  const archivo = (ruta, contenido = null) => {
    if (mapa.has(ruta)) return mapa.get(ruta);
    const rel = `e/${nArchivo++}${path.extname(ruta).toLowerCase().replace(/[^.a-z0-9]/g, '')}`;
    mapa.set(ruta, rel);
    entradas.push(contenido ? { rel, contenido } : { rel, ruta });
    return rel;
  };

  const carpeta = async (ruta) => {
    if (mapa.has(ruta)) return mapa.get(ruta);
    const nombres = (await fsp.readdir(ruta, { withFileTypes: true })).filter(d => d.isFile()).map(d => d.name);
    if (nombres.length > MAX_ARCHIVOS_CARPETA || nombres.some(n => !NOMBRE_SEGURO.test(n))) return null;
    const rel = `e/d${nCarpeta++}`;
    mapa.set(ruta, rel);
    for (const n of nombres.sort()) entradas.push({ rel: `${rel}/${n}`, ruta: path.join(ruta, n) });
    return rel;
  };

  const secuencia = async (ruta) => {
    if (mapa.has(ruta)) return mapa.get(ruta);
    const dir = path.dirname(ruta);
    const patron = path.basename(ruta);
    const m = patron.match(/^(.*?)%(0?\d*)d(.*)$/);
    if (!m || !NOMBRE_SEGURO.test(patron) || !(await existe(dir))?.isDirectory()) return null;
    const re = new RegExp(`^${m[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\d+${m[3].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
    const nombres = (await fsp.readdir(dir)).filter(n => re.test(n)).sort();
    if (!nombres.length || nombres.length > 5000 || nombres.some(n => !NOMBRE_SEGURO.test(n))) return null;
    const rel = `e/q${nSecuencia++}`;
    mapa.set(ruta, `${rel}/${patron}`);
    for (const n of nombres) entradas.push({ rel: `${rel}/${n}`, ruta: path.join(dir, n) });
    return `${rel}/${patron}`;
  };

  // Cada ruta que aparece en las entradas: archivo, carpeta, secuencia o lista de concat.
  const resuelve = async (ruta) => {
    if (ruta === rutaSalida) return null;
    if (ruta.includes('%')) return secuencia(ruta);
    const st = await existe(ruta);
    if (!st) return null;
    if (st.isDirectory()) return carpeta(ruta);
    if (/\.(txt|ffconcat)$/i.test(ruta) && st.size < 1024 * 1024) {
      const lista = rutasDeLista(await fsp.readFile(ruta, 'utf8'));
      if (lista) {
        const lineas = [];
        for (const r of lista) {
          if (!r.startsWith('/') || !(await existe(r))?.isFile()) return null;
          // ffmpeg resuelve cada línea relativa a la propia lista, que también va a e/:
          // 'e/0.mp4' sería e/e/0.mp4 (así fallaban los concat en el taller).
          lineas.push(`file '${path.posix.relative('e', archivo(r))}'`);
        }
        return archivo(ruta, Buffer.from(`${lineas.join('\n')}\n`));
      }
    }
    return archivo(ruta);
  };

  const nuevos = [];
  for (let i = 0; i < args.length - 1; i++) {
    let a = String(args[i]);
    const encontradas = [...new Set(a.match(PATRON_RUTA) || [])].sort((x, y) => y.length - x.length);
    for (const crudo of encontradas) {
      const ruta = crudo.replace(/'+$/, '');
      const rel = await resuelve(ruta);
      if (!rel) return null;
      a = a.split(ruta).join(rel);
    }
    nuevos.push(a);
  }

  // Subtítulos sin carpeta de fuentes: en Windows no están Cinzel/Oswald/Bebas.
  const stFuentes = fuentes && await existe(fuentes);
  for (let i = 0; i < nuevos.length; i++) {
    if (!/(^|[,;\]])\s*(subtitles|ass)=/.test(nuevos[i]) || /fontsdir=/.test(nuevos[i])) continue;
    if (!stFuentes?.isDirectory()) continue;
    const relFuentes = await carpeta(fuentes);
    if (!relFuentes) return null;
    nuevos[i] = nuevos[i].replace(/((?:^|[,;\]])\s*(?:subtitles|ass)=(?:'[^']*'|[^:,;[\]']+))/g, `$1:fontsdir='${relFuentes}'`);
  }

  // Si queda alguna ruta de la VPS sin traducir, el taller no la tendría.
  if (nuevos.some(a => HAY_RUTA.test(a))) return null;
  const relSalida = `s/0${path.extname(rutaSalida).toLowerCase().replace(/[^.a-z0-9]/g, '')}`;
  return { args: [...nuevos, relSalida], entradas, salida: { rel: relSalida, ruta: rutaSalida } };
}

class ClienteTaller {
  constructor({ url = '', pausaSondeoMs = 1000, limiteMs = 6 * 3600000, sinRedMaxMs = 90000, logger = console } = {}) {
    this.configura({ url, pausaSondeoMs, limiteMs, sinRedMaxMs, logger });
  }

  configura({ url = '', pausaSondeoMs = 1000, limiteMs = 6 * 3600000, sinRedMaxMs = 90000, logger = console } = {}) {
    this.url = String(url || '').replace(/\/+$/, '');
    Object.assign(this, { pausaSondeoMs, limiteMs, sinRedMaxMs, logger });
    this.caidoHasta = 0;
    this.saludHasta = 0;
    this.stats = { remotos: 0, locales: 0, fallos: 0, ultimoError: null, ultimoRemoto: null };
  }

  activo() { return Boolean(this.url); }
  estado() { return { url: this.url || null, caidoHasta: this.caidoHasta ? new Date(this.caidoHasta).toISOString() : null, ...this.stats }; }

  async pide(ruta, opciones = {}, ms = 30000) {
    const r = await fetch(`${this.url}${ruta}`, { ...opciones, signal: AbortSignal.timeout(ms) });
    return r;
  }

  async disponible() {
    if (!this.activo() || Date.now() < this.caidoHasta) return false;
    if (Date.now() < this.saludHasta) return true;
    try {
      const r = await this.pide('/api/salud', {}, 4000);
      if (!r.ok) throw new Error(`salud ${r.status}`);
      this.saludHasta = Date.now() + 30000;
      return true;
    } catch (error) {
      this.marcaCaido(error);
      return false;
    }
  }

  marcaCaido(error, ms = 3 * 60000) {
    this.caidoHasta = Date.now() + ms;
    this.saludHasta = 0;
    this.stats.fallos += 1;
    this.stats.ultimoError = String(error?.message || error).slice(0, 300);
  }

  async sube({ ruta, contenido }) {
    const sha = contenido ? crypto.createHash('sha256').update(contenido).digest('hex') : await sha256DeArchivo(ruta);
    const head = await this.pide(`/api/archivos/${sha}`, { method: 'HEAD' });
    if (head.status === 200) return sha;
    const cuerpo = contenido || fs.createReadStream(ruta);
    const put = await this.pide(`/api/archivos/${sha}`, { method: 'PUT', body: cuerpo, duplex: 'half', headers: { 'content-type': 'application/octet-stream' } }, 30 * 60000);
    if (!put.ok) throw new Error(`subir ${path.basename(ruta || 'lista')}: HTTP ${put.status}`);
    return sha;
  }

  async baja(sha, destino) {
    const r = await this.pide(`/api/archivos/${sha}`, {}, 30 * 60000);
    if (!r.ok || !r.body) throw new Error(`bajar la salida: HTTP ${r.status}`);
    const tmp = `${destino}.taller-${process.pid}-${Date.now()}`;
    try {
      const { Readable } = require('stream');
      const { pipeline } = require('stream/promises');
      await pipeline(Readable.fromWeb(r.body), fs.createWriteStream(tmp));
      const bajado = await sha256DeArchivo(tmp);
      if (bajado !== sha) throw new Error('la salida llegó dañada');
      await fsp.rename(tmp, destino);
    } finally {
      await fsp.rm(tmp, { force: true });
    }
  }

  /** Hace el trabajo en el taller. null = no se puede llevar (se hace en local); lanza si el taller falla. */
  async ejecuta(args) {
    const trabajo = await preparaTrabajo(args);
    if (!trabajo) return null;
    if (!await this.disponible()) throw new Error('el taller no responde');
    const t0 = Date.now();
    const entradas = {};
    for (const e of trabajo.entradas) entradas[e.rel] = await this.sube(e);
    const r = await this.pide('/api/trabajos', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ args: trabajo.args, entradas, salidas: [trabajo.salida.rel], limite_s: Math.round(this.limiteMs / 1000) })
    });
    if (!r.ok) throw new Error(`el taller rechazó el trabajo: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
    const { id } = await r.json();

    let sinRedDesde = 0;
    let pausa = Math.min(300, this.pausaSondeoMs);
    for (;;) {
      if (Date.now() - t0 > this.limiteMs) throw new Error('el taller tardó demasiado');
      await espera(pausa);
      pausa = this.pausaSondeoMs;
      let estado;
      try {
        const s = await this.pide(`/api/trabajos/${id}`, {}, 15000);
        if (!s.ok) throw new Error(`HTTP ${s.status}`);
        estado = await s.json();
        sinRedDesde = 0;
      } catch (error) {
        sinRedDesde = sinRedDesde || Date.now();
        if (Date.now() - sinRedDesde > this.sinRedMaxMs) throw new Error(`se perdió el taller a mitad de trabajo: ${error.message}`);
        continue;
      }
      if (estado.estado === 'error') {
        const error = new Error(`ffmpeg falló en el taller: ${estado.error} ${String(estado.stderr || '').slice(-300)}`);
        error.enTaller = true;
        throw error;
      }
      if (estado.estado !== 'listo') continue;
      await this.baja(estado.salidas[trabajo.salida.rel].sha, trabajo.salida.ruta);
      this.stats.remotos += 1;
      this.stats.ultimoRemoto = { at: new Date().toISOString(), segundos: Math.round((Date.now() - t0) / 1000) };
      return { stdout: estado.stdout || '', stderr: estado.stderr || '' };
    }
  }
}

module.exports = { ClienteTaller, preparaTrabajo, rutasDeLista };
