// Estudio de Shorts: puente entre el panel y el proyecto /ruta/a/shorts
// (scripts de Python que hacen los shorts de versículos y los clips con subtítulos).
// Aquí solo se gestionan archivos y se lanza un trabajo a la vez; el render vive en
// los scripts, que siguen funcionando igual desde la terminal.
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const { Transform } = require('stream');
const { pipeline } = require('stream/promises');
const { spawn } = require('child_process');

const EXT = {
  fondos: ['.mp4', '.mov', '.mkv', '.webm'],
  musica: ['.mp3', '.wav', '.m4a', '.ogg', '.aac'],
  clipping: ['.mp4', '.mov', '.mkv', '.webm']
};
const MB = 1024 * 1024;
const LIMITES = { fondos: 300 * MB, musica: 40 * MB, clipping: 1024 * MB };
const MAX_LOTE = 50000;
const MAX_LOG = 300;
const TIEMPO = /^\d{1,2}(:\d{1,2}){0,2}(\.\d{1,3})?$/;
const AJUSTES = ['recorte', 'entero'];
const MODELOS = ['tiny', 'base', 'small', 'medium'];

function fallo(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

/* La ficha .txt que escribe hacer_versiculos.py: "TÍTULO: ..." y, tras
   "DESCRIPCIÓN:", todo lo que se pega en YouTube. */
function leerFicha(texto) {
  const m = String(texto).match(/^TÍTULO:\s*(.*)\n[\s\S]*?DESCRIPCIÓN:\n([\s\S]*)$/);
  if (!m) return { title: '', description: String(texto).trim() };
  return { title: m[1].trim(), description: m[2].trim() };
}

class ShortsStudioService {
  constructor({ root, python = 'python3', pythonClipping, spawnFn = spawn, limits = {}, logger } = {}) {
    this.root = path.resolve(root || process.env.SHORTS_DIR || '/shorts');
    this.python = python;
    this.pythonClipping = pythonClipping || python;
    this.spawn = spawnFn;
    this.limits = { ...LIMITES, ...limits };
    this.logger = logger;
    this.current = null;
    this.proceso = null;
  }

  dirs() {
    const r = this.root;
    return {
      fondos: path.join(r, 'entrada', 'fondos'),
      musica: path.join(r, 'entrada', 'musica'),
      clipping: path.join(r, 'entrada', 'clipping'),
      shorts: path.join(r, 'salida'),
      clips: path.join(r, 'salida', 'clipping')
    };
  }

  /* Solo el nombre, sin rutas ni caracteres que confundan al sistema de archivos. */
  safeName(area, nombre) {
    const exts = area === 'shorts' || area === 'clips' ? ['.mp4'] : EXT[area];
    if (!exts) throw fallo(400, 'Área desconocida');
    const base = path.basename(String(nombre || '')).normalize('NFC');
    const ext = path.extname(base).toLowerCase();
    const cuerpo = base.slice(0, base.length - ext.length)
      .replace(/[^\p{L}\p{N} ._()-]+/gu, '').replace(/^[.\s]+/, '').trim().slice(0, 120);
    if (!cuerpo || !exts.includes(ext)) {
      throw fallo(400, `Archivo no válido. Se aceptan: ${exts.join(', ')}`);
    }
    return cuerpo + ext;
  }

  async listar(dir, exts) {
    let nombres;
    try { nombres = await fsp.readdir(dir); } catch { return []; }
    const out = [];
    for (const name of nombres.sort((a, b) => a.localeCompare(b, 'es'))) {
      if (!exts.includes(path.extname(name).toLowerCase())) continue;
      const st = await fsp.stat(path.join(dir, name)).catch(() => null);
      if (st?.isFile()) out.push({ name, size: st.size, mtime: st.mtime.toISOString() });
    }
    return out;
  }

  async state() {
    const d = this.dirs();
    const available = await fsp.stat(path.join(this.root, 'entrada')).then(s => s.isDirectory(), () => false);
    if (!available) return { available: false, root: this.root, job: this.job() };

    const lote = await fsp.readFile(path.join(this.root, 'entrada', 'lote.txt'), 'utf8').catch(() => '');
    const sinFecha = ({ name, size }) => ({ name, size });
    const musica = [];
    for (const f of await this.listar(d.musica, EXT.musica)) {
      const txt = path.join(d.musica, f.name.replace(/\.[^.]+$/, '.txt'));
      const attribution = (await fsp.readFile(txt, 'utf8').catch(() => '')).trim();
      musica.push({ ...sinFecha(f), attribution });
    }
    const shorts = [];
    for (const f of (await this.listar(d.shorts, ['.mp4'])).sort((a, b) => b.mtime.localeCompare(a.mtime))) {
      const txt = await fsp.readFile(path.join(d.shorts, f.name.replace(/\.mp4$/i, '.txt')), 'utf8').catch(() => null);
      shorts.push({ ...f, ficha: txt === null ? null : leerFicha(txt) });
    }
    const clips = (await this.listar(d.clips, ['.mp4'])).sort((a, b) => b.mtime.localeCompare(a.mtime));
    return {
      available: true,
      lote,
      files: {
        fondos: (await this.listar(d.fondos, EXT.fondos)).map(sinFecha),
        musica,
        clipping: (await this.listar(d.clipping, EXT.clipping)).map(sinFecha)
      },
      outputs: { shorts, clips },
      job: this.job()
    };
  }

  async saveLote(texto) {
    if (typeof texto !== 'string' || texto.length > MAX_LOTE) {
      throw fallo(400, `El lote debe ser texto de hasta ${MAX_LOTE} caracteres`);
    }
    const destino = path.join(this.root, 'entrada', 'lote.txt');
    const tmp = `${destino}.${crypto.randomBytes(4).toString('hex')}.tmp`;
    await fsp.writeFile(tmp, texto.replace(/\r\n/g, '\n'), 'utf8');
    await fsp.rename(tmp, destino);
    return { saved: true };
  }

  async saveUpload(area, nombre, stream) {
    if (!EXT[area]) throw fallo(400, 'Área desconocida');
    const name = this.safeName(area, nombre);
    const dir = this.dirs()[area];
    await fsp.mkdir(dir, { recursive: true });
    const tmp = path.join(dir, `.${name}.${crypto.randomBytes(4).toString('hex')}.part`);
    const tope = this.limits[area];
    let total = 0;
    const contador = new Transform({
      transform(chunk, _enc, cb) {
        total += chunk.length;
        if (total > tope) return cb(fallo(413, `El archivo supera ${Math.round(tope / MB)} MB`));
        cb(null, chunk);
      }
    });
    try {
      await pipeline(stream, contador, fs.createWriteStream(tmp));
      if (!total) throw fallo(400, 'El archivo está vacío');
      await fsp.rename(tmp, path.join(dir, name));
    } catch (error) {
      await fsp.unlink(tmp).catch(() => {});
      throw error.status ? error : fallo(400, 'No se pudo guardar el archivo');
    }
    return { name, size: total };
  }

  async saveAttribution(nombre, texto) {
    const name = this.safeName('musica', nombre);
    const pista = path.join(this.dirs().musica, name);
    if (!fs.existsSync(pista)) throw fallo(404, 'No existe esa pista');
    const txt = pista.replace(/\.[^.]+$/, '.txt');
    const limpio = String(texto ?? '').trim().slice(0, 2000);
    if (!limpio) {
      await fsp.unlink(txt).catch(() => {});
      return { attribution: '' };
    }
    await fsp.writeFile(txt, limpio + '\n', 'utf8');
    return { attribution: limpio };
  }

  async mediaPath(area, nombre) {
    const dir = this.dirs()[area];
    if (!dir || !['fondos', 'musica', 'clipping', 'shorts', 'clips'].includes(area)) {
      throw fallo(400, 'Área desconocida');
    }
    const name = path.basename(String(nombre || ''));
    if (name !== nombre) throw fallo(400, 'Nombre no válido');
    this.safeName(area, name);
    const full = path.join(dir, name);
    if (!fs.existsSync(full)) throw fallo(404, 'No existe');
    return full;
  }

  async remove(area, nombre) {
    const full = await this.mediaPath(area, nombre);
    await fsp.unlink(full);
    // La ficha del short y la atribución de la pista viven al lado con el mismo nombre.
    if (area === 'shorts' || area === 'musica') {
      await fsp.unlink(full.replace(/\.[^.]+$/, '.txt')).catch(() => {});
    }
    return { removed: path.basename(full) };
  }

  job() {
    if (!this.current) return null;
    const { proceso: _p, ...publico } = this.current;
    return { ...publico, log: [...publico.log] };
  }

  argumentos(kind, opciones = {}) {
    const scripts = path.join(this.root, 'scripts');
    if (kind === 'versiculos') {
      const args = [path.join(scripts, 'hacer_versiculos.py')];
      if (opciones.solo) {
        const solo = String(opciones.solo);
        if (!/^[a-z0-9-]{1,120}$/.test(solo)) throw fallo(400, 'Nombre de short no válido');
        args.push('--solo', solo);
      }
      return { cmd: this.python, args };
    }
    if (kind === 'clipping') {
      const ajuste = opciones.ajuste || 'recorte';
      const modelo = opciones.modelo || 'small';
      if (!AJUSTES.includes(ajuste)) throw fallo(400, 'Ajuste no válido');
      if (!MODELOS.includes(modelo)) throw fallo(400, 'Modelo no válido');
      for (const k of ['desde', 'hasta']) {
        if (opciones[k] && !TIEMPO.test(String(opciones[k]))) throw fallo(400, `"${k}" debe ser como 1:20 o 75`);
      }
      const args = [path.join(scripts, 'hacer_clipping.py'), '--ajuste', ajuste, '--modelo', modelo];
      if (opciones.video) {
        const video = this.safeName('clipping', opciones.video);
        if (!fs.existsSync(path.join(this.dirs().clipping, video))) throw fallo(404, 'No existe ese video');
        args.push(video);
      } else if (opciones.desde || opciones.hasta) {
        throw fallo(400, 'Desde/hasta es para un solo video');
      }
      if (opciones.desde) args.push('--desde', String(opciones.desde));
      if (opciones.hasta) args.push('--hasta', String(opciones.hasta));
      return { cmd: this.pythonClipping, args };
    }
    throw fallo(400, 'Tipo de trabajo desconocido');
  }

  async start(kind, opciones = {}) {
    if (this.current?.status === 'running') throw fallo(409, 'Ya hay un trabajo en marcha; espera a que termine');
    const { cmd, args } = this.argumentos(kind, opciones);
    const job = {
      id: crypto.randomUUID(),
      kind,
      options: opciones,
      status: 'running',
      startedAt: new Date().toISOString(),
      finishedAt: null,
      exitCode: null,
      log: []
    };
    const proceso = this.spawn(cmd, args, {
      cwd: this.root,
      env: { ...process.env, SHORTS_DIR: this.root, PYTHONUNBUFFERED: '1' },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    this.current = job;
    this.proceso = proceso;

    const agregar = linea => {
      // Los avisos internos de las librerías no le dicen nada al operador.
      if (!linea.trim() || /Warning|warnings\.warn/.test(linea)) return;
      job.log.push(linea.replace(/\s+$/, ''));
      if (job.log.length > MAX_LOG) job.log.splice(0, job.log.length - MAX_LOG);
    };
    for (const salida of [proceso.stdout, proceso.stderr]) {
      let resto = '';
      salida?.on('data', chunk => {
        const partes = (resto + chunk.toString('utf8')).split(/\r?\n/);
        resto = partes.pop();
        partes.forEach(agregar);
      });
      salida?.on('end', () => { if (resto) agregar(resto); resto = ''; });
    }
    proceso.on('error', error => {
      agregar(`✗ No se pudo iniciar: ${error.message}`);
      this.terminar(job, 'failed', null);
    });
    proceso.on('close', (code, signal) => {
      if (job.status !== 'running') return;
      this.terminar(job, job.cancelado || signal ? 'cancelled' : code === 0 ? 'done' : 'failed', code);
    });
    this.logger?.info?.(`Shorts: ${kind} iniciado`);
    return this.job();
  }

  terminar(job, status, code) {
    job.status = status;
    job.exitCode = code;
    job.finishedAt = new Date().toISOString();
    if (this.current === job) this.proceso = null;
  }

  cancel() {
    if (this.current?.status !== 'running' || !this.proceso) throw fallo(409, 'No hay ningún trabajo en marcha');
    this.current.cancelado = true;
    this.proceso.kill('SIGTERM');
    return this.job();
  }
}

module.exports = { ShortsStudioService, leerFicha };
