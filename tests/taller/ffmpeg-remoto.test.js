// 07/10/2026: el autor quiere que los vídeos se hagan en su PC y que la VPS solo
// trabaje si el PC falla. Todo el ffmpeg de Oraflow pasa por runFFmpeg: el
// cliente remoto sube las entradas (por sha256, una sola vez), el taller del PC
// ejecuta y la salida vuelve al mismo sitio. Aquí el taller es uno falso con el
// mismo contrato que C:\taller\taller.py y el ffmpeg de esta máquina.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync, execFile } = require('node:child_process');

const { ClienteTaller, preparaTrabajo } = require('../../utils/ffmpeg-remoto');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'taller-'));
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const tono = (ruta, seg = 1, f = 440) => execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', `sine=frequency=${f}:duration=${seg}`, ruta]);

/** Taller falso: mismo contrato que taller.py, con el ffmpeg local. */
function tallerFalso({ falla = false, lento = 0 } = {}) {
  const cache = fs.mkdtempSync(path.join(os.tmpdir(), 'taller-cache-'));
  const trabajos = {};
  const vistos = { subidas: 0, trabajos: [] };
  const server = http.createServer(async (req, res) => {
    const m = req.url.match(/^\/api\/archivos\/([0-9a-f]{64})$/);
    if (req.url === '/api/salud') return res.end(JSON.stringify({ ok: true }));
    if (m && req.method === 'HEAD') { res.statusCode = fs.existsSync(path.join(cache, m[1])) ? 200 : 404; return res.end(); }
    if (m && req.method === 'GET') return fs.createReadStream(path.join(cache, m[1])).pipe(res);
    if (m && req.method === 'PUT') {
      const partes = []; for await (const p of req) partes.push(p);
      const datos = Buffer.concat(partes);
      if (sha(datos) !== m[1]) { res.statusCode = 400; return res.end('{}'); }
      vistos.subidas += 1; fs.writeFileSync(path.join(cache, m[1]), datos); return res.end('{"ok":true}');
    }
    if (req.url === '/api/trabajos' && req.method === 'POST') {
      const partes = []; for await (const p of req) partes.push(p);
      const t = JSON.parse(Buffer.concat(partes));
      vistos.trabajos.push(t);
      if (t.args.some(a => /^\/|[=':,]\/[A-Za-z]/.test(a))) { res.statusCode = 400; return res.end('{}'); }
      const id = String(Object.keys(trabajos).length + 1);
      trabajos[id] = { estado: 'trabajando' };
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'taller-job-'));
      for (const [rel, s] of Object.entries(t.entradas)) { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.copyFileSync(path.join(cache, s), path.join(dir, rel)); }
      for (const rel of t.salidas) fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
      setTimeout(() => execFile('ffmpeg', ['-nostdin', ...t.args], { cwd: dir }, (err, stdout, stderr) => {
        if (err || falla) { trabajos[id] = { estado: 'error', error: 'falló', stderr }; return; }
        const salidas = {};
        for (const rel of t.salidas) { const d = fs.readFileSync(path.join(dir, rel)); fs.writeFileSync(path.join(cache, sha(d)), d); salidas[rel] = { sha: sha(d), bytes: d.length }; }
        trabajos[id] = { estado: 'listo', salidas, stdout, stderr };
      }), lento);
      return res.end(JSON.stringify({ id, estado: 'en_cola' }));
    }
    const j = req.url.match(/^\/api\/trabajos\/(\d+)$/);
    if (j) return res.end(JSON.stringify({ id: j[1], ...trabajos[j[1]] }));
    res.statusCode = 404; res.end('{}');
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r({ url: `http://127.0.0.1:${server.address().port}`, vistos, cierra: () => new Promise(c => server.close(c)) })));
}

test('prepara: rutas absolutas → relativas; la salida es la última', async () => {
  const a = path.join(tmp, 'a.wav'); tono(a);
  const p = await preparaTrabajo(['-y', '-i', a, '-af', 'volume=0.5', path.join(tmp, 'b.mp3')]);
  assert.deepEqual(p.args, ['-y', '-i', 'e/0.wav', '-af', 'volume=0.5', 's/0.mp3']);
  assert.equal(p.entradas.length, 1);
  assert.equal(p.salida.rel, 's/0.mp3');
});

test('prepara: se queda en la VPS lo que no se puede llevar (tuberías, null, patrones de salida, rutas que no existen)', async () => {
  const a = path.join(tmp, 'a.wav'); tono(a);
  assert.equal(await preparaTrabajo(['-i', a, '-f', 'null', '-']), null);
  assert.equal(await preparaTrabajo(['-i', a, 'pipe:1']), null);
  assert.equal(await preparaTrabajo(['-i', a, path.join(tmp, 'img_%03d.png')]), null);
  assert.equal(await preparaTrabajo(['-i', path.join(tmp, 'no-existe.wav'), path.join(tmp, 'x.mp3')]), null);
  assert.equal(await preparaTrabajo(['-i', a, path.join(tmp, 'no-existe-dir', 'x.mp3')]), null);
});

test('prepara: rutas dentro de filtros, carpeta de fuentes y subtítulos sin fontsdir', async () => {
  const ass = path.join(tmp, 'sub.ass'); fs.writeFileSync(ass, '[Script Info]\n');
  const fuentes = path.join(tmp, 'fuentes'); fs.mkdirSync(fuentes, { recursive: true }); fs.writeFileSync(path.join(fuentes, 'Cinzel.ttf'), 'x');
  const a = path.join(tmp, 'a.wav'); tono(a);
  const p = await preparaTrabajo(['-i', a, '-vf', `subtitles='${ass}'`, path.join(tmp, 'v.mp4')], { fuentes });
  assert.equal(p.args[3], "subtitles='e/1.ass':fontsdir='e/d0'");
  assert.ok(p.entradas.some(e => e.rel === 'e/d0/Cinzel.ttf'));
  const q = await preparaTrabajo(['-i', a, '-vf', `subtitles='${ass}':fontsdir='${fuentes}'`, path.join(tmp, 'v.mp4')], { fuentes });
  assert.equal(q.args[3], "subtitles='e/1.ass':fontsdir='e/d0'");
});

test('prepara: secuencias de imágenes y listas de concatenación', async () => {
  const seq = path.join(tmp, 'seq'); fs.mkdirSync(seq, { recursive: true });
  for (let i = 1; i <= 3; i++) fs.writeFileSync(path.join(seq, `f_${String(i).padStart(3, '0')}.png`), `png${i}`);
  const a = path.join(tmp, 'a.wav'); tono(a);
  const b = path.join(tmp, "c'b.wav"); tono(b, 1, 220);
  const lista = path.join(tmp, 'lista.txt');
  const esc = r => `file '${r.replace(/'/g, "'\\''")}'`;
  fs.writeFileSync(lista, `${esc(a)}\n${esc(b)}\n`);
  const p = await preparaTrabajo(['-framerate', '30', '-i', path.join(seq, 'f_%03d.png'), '-f', 'concat', '-safe', '0', '-i', lista, path.join(tmp, 'o.mp4')]);
  assert.equal(p.args[3], 'e/q0/f_%03d.png');
  assert.deepEqual(p.entradas.filter(e => e.rel.startsWith('e/q0/')).map(e => e.rel), ['e/q0/f_001.png', 'e/q0/f_002.png', 'e/q0/f_003.png']);
  const lst = p.entradas.find(e => e.rel === p.args[9]);
  // ffmpeg resuelve las rutas de una lista de concat RELATIVAS A LA LISTA (e/e/0.wav si pusiera e/0.wav)
  assert.match(lst.contenido.toString(), /^file '\d+\.wav'\nfile '\d+\.wav'\n$/);
  for (const linea of lst.contenido.toString().trim().split('\n')) {
    const nombre = linea.match(/'(.+)'/)[1];
    assert.ok(p.entradas.some(e => e.rel === path.posix.join(path.posix.dirname(lst.rel), nombre)), `${nombre} no está junto a la lista`);
  }
});

test('de punta a punta: el taller hace el trabajo y la salida llega a su ruta', async () => {
  const t = await tallerFalso();
  const c = new ClienteTaller({ url: t.url, pausaSondeoMs: 20 });
  const a = path.join(tmp, 'e2e.wav'); tono(a, 1);
  const salida = path.join(tmp, 'e2e.mp3'); fs.rmSync(salida, { force: true });
  const r = await c.ejecuta(['-y', '-v', 'error', '-i', a, '-c:a', 'libmp3lame', salida]);
  assert.ok(r, 'se hizo en el taller');
  assert.ok(fs.statSync(salida).size > 1000);
  // La segunda vez la entrada ya está allí: no se vuelve a subir.
  await c.ejecuta(['-y', '-v', 'error', '-i', a, '-c:a', 'libmp3lame', salida]);
  assert.equal(t.vistos.subidas, 1);
  await t.cierra();
});

test('runFFmpeg: con el taller caído o fallando, lo hace la VPS', async () => {
  const { runFFmpeg, _taller } = require('../../utils/ffmpeg');
  const a = path.join(tmp, 'f.wav'); tono(a, 1);
  const salida = path.join(tmp, 'f.mp3');

  _taller.configura({ url: 'http://127.0.0.1:9', pausaSondeoMs: 20 });
  fs.rmSync(salida, { force: true });
  await runFFmpeg(['-y', '-v', 'error', '-i', a, salida]);
  assert.ok(fs.statSync(salida).size > 1000, 'PC apagado: salió en local');

  const t = await tallerFalso({ falla: true });
  _taller.configura({ url: t.url, pausaSondeoMs: 20 });
  fs.rmSync(salida, { force: true });
  await runFFmpeg(['-y', '-v', 'error', '-i', a, salida]);
  assert.ok(fs.statSync(salida).size > 1000, 'error en el taller: salió en local');
  await t.cierra();

  const bien = await tallerFalso();
  _taller.configura({ url: bien.url, pausaSondeoMs: 20 });
  fs.rmSync(salida, { force: true });
  await runFFmpeg(['-y', '-v', 'error', '-i', a, salida]);
  assert.equal(bien.vistos.trabajos.length, 1, 'con el taller sano, lo hace el taller');
  assert.ok(_taller.estado().remotos >= 1);
  await bien.cierra();
  _taller.configura({ url: '' });
});

test('sin FFMPEG_REMOTO_URL todo sigue en local', async () => {
  const { _taller } = require('../../utils/ffmpeg');
  _taller.configura({ url: '' });
  assert.equal(_taller.activo(), false);
});
