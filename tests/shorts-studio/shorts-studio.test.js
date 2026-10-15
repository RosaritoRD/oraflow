const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { EventEmitter } = require('events');
const { Readable, PassThrough } = require('stream');
const { ShortsStudioService, leerFicha } = require('../../utils/shorts-studio-service');

function raiz() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shorts-'));
  for (const d of ['entrada/fondos', 'entrada/musica', 'entrada/clipping', 'salida/clipping', 'scripts']) {
    fs.mkdirSync(path.join(dir, d), { recursive: true });
  }
  fs.writeFileSync(path.join(dir, 'entrada/lote.txt'), 'Salmos 3:4\n');
  return dir;
}

// Proceso falso: registra cómo se lanzó y termina cuando el test lo pide.
function spawnFalso() {
  const llamadas = [];
  const fn = (cmd, args, opts) => {
    const p = new EventEmitter();
    p.stdout = new PassThrough();
    p.stderr = new PassThrough();
    p.kill = () => { p.killed = true; p.emit('close', null, 'SIGTERM'); };
    llamadas.push({ cmd, args, opts, p });
    return p;
  };
  fn.llamadas = llamadas;
  return fn;
}

test('estado: lote, archivos por carpeta y atribución de la música', async () => {
  const dir = raiz();
  fs.writeFileSync(path.join(dir, 'entrada/fondos/playa.mp4'), 'x');
  fs.writeFileSync(path.join(dir, 'entrada/musica/piano.mp3'), 'xx');
  fs.writeFileSync(path.join(dir, 'entrada/musica/piano.txt'), 'Música: Piano (CC BY)');
  fs.writeFileSync(path.join(dir, 'entrada/fondos/.gitkeep'), '');
  const s = new ShortsStudioService({ root: dir });
  const st = await s.state();
  assert.equal(st.available, true);
  assert.equal(st.lote, 'Salmos 3:4\n');
  assert.deepEqual(st.files.fondos.map(f => f.name), ['playa.mp4']);
  assert.deepEqual(st.files.musica, [{ name: 'piano.mp3', size: 2, attribution: 'Música: Piano (CC BY)' }]);
});

test('estado sin la carpeta del proyecto: available=false, sin romper', async () => {
  const s = new ShortsStudioService({ root: path.join(os.tmpdir(), 'no-existe-' + Date.now()) });
  const st = await s.state();
  assert.equal(st.available, false);
});

test('salidas: cada short trae su ficha (título y descripción)', async () => {
  const dir = raiz();
  fs.writeFileSync(path.join(dir, 'salida/juan-3-16.mp4'), 'v');
  fs.writeFileSync(path.join(dir, 'salida/juan-3-16.txt'),
    'TÍTULO: Porque de tal manera | Juan 3:16\n\nDESCRIPCIÓN:\nPorque de tal manera amó Dios\n— Juan capítulo 3, versículo 16\n\n#shorts\n');
  fs.writeFileSync(path.join(dir, 'salida/clipping/predica.mp4'), 'c');
  const st = await new ShortsStudioService({ root: dir }).state();
  assert.equal(st.outputs.shorts.length, 1);
  assert.equal(st.outputs.shorts[0].name, 'juan-3-16.mp4');
  assert.equal(st.outputs.shorts[0].ficha.title, 'Porque de tal manera | Juan 3:16');
  assert.match(st.outputs.shorts[0].ficha.description, /^Porque de tal manera amó Dios\n— Juan/);
  assert.match(st.outputs.shorts[0].ficha.description, /#shorts$/);
  assert.deepEqual(st.outputs.clips.map(c => c.name), ['predica.mp4']);
});

test('leerFicha tolera un txt sin el formato esperado', () => {
  assert.deepEqual(leerFicha('cualquier cosa'), { title: '', description: 'cualquier cosa' });
});

test('guardar lote: texto y tope de tamaño', async () => {
  const dir = raiz();
  const s = new ShortsStudioService({ root: dir });
  await s.saveLote('Juan 3:16\n');
  assert.equal(fs.readFileSync(path.join(dir, 'entrada/lote.txt'), 'utf8'), 'Juan 3:16\n');
  await assert.rejects(s.saveLote('x'.repeat(50001)), { status: 400 });
  await assert.rejects(s.saveLote(42), { status: 400 });
});

test('nombres de archivo: sin rutas, sin caracteres raros, extensión permitida', () => {
  const s = new ShortsStudioService({ root: '/x' });
  assert.equal(s.safeName('fondos', '../../etc/Playa Bonita.MP4'), 'Playa Bonita.mp4');
  assert.equal(s.safeName('musica', 'Canción ñ (1).mp3'), 'Canción ñ (1).mp3');
  assert.throws(() => s.safeName('fondos', 'virus.sh'), { status: 400 });
  assert.throws(() => s.safeName('musica', 'video.mp4'), { status: 400 });
  assert.throws(() => s.safeName('nada', 'a.mp4'), { status: 400 });
  assert.throws(() => s.safeName('fondos', '.mp4'), { status: 400 });
});

test('subida por stream: se guarda entera; pasarse del tope no deja basura', async () => {
  const dir = raiz();
  const s = new ShortsStudioService({ root: dir, limits: { fondos: 10 } });
  const r = await s.saveUpload('fondos', 'a.mp4', Readable.from([Buffer.from('12345')]));
  assert.equal(r.name, 'a.mp4');
  assert.equal(fs.readFileSync(path.join(dir, 'entrada/fondos/a.mp4'), 'utf8'), '12345');
  await assert.rejects(s.saveUpload('fondos', 'b.mp4', Readable.from([Buffer.alloc(8), Buffer.alloc(8)])), { status: 413 });
  assert.deepEqual(fs.readdirSync(path.join(dir, 'entrada/fondos')).sort(), ['a.mp4']);
});

test('borrar: un short se lleva su ficha; una pista su atribución', async () => {
  const dir = raiz();
  for (const f of ['salida/x.mp4', 'salida/x.txt', 'entrada/musica/p.mp3', 'entrada/musica/p.txt']) {
    fs.writeFileSync(path.join(dir, f), '1');
  }
  const s = new ShortsStudioService({ root: dir });
  await s.remove('shorts', 'x.mp4');
  await s.remove('musica', 'p.mp3');
  assert.deepEqual(fs.readdirSync(path.join(dir, 'salida')), ['clipping']);
  assert.deepEqual(fs.readdirSync(path.join(dir, 'entrada/musica')), []);
  await assert.rejects(s.remove('shorts', '../entrada/lote.txt'), { status: 400 });
  await assert.rejects(s.remove('shorts', 'no-esta.mp4'), { status: 404 });
});

test('atribución: se guarda junto a la pista y vacía la borra', async () => {
  const dir = raiz();
  fs.writeFileSync(path.join(dir, 'entrada/musica/p.mp3'), '1');
  const s = new ShortsStudioService({ root: dir });
  await s.saveAttribution('p.mp3', 'Música: P');
  assert.equal(fs.readFileSync(path.join(dir, 'entrada/musica/p.txt'), 'utf8'), 'Música: P\n');
  await s.saveAttribution('p.mp3', '  ');
  assert.equal(fs.existsSync(path.join(dir, 'entrada/musica/p.txt')), false);
  await assert.rejects(s.saveAttribution('falta.mp3', 'x'), { status: 404 });
});

test('mediaPath solo resuelve dentro de las carpetas permitidas', async () => {
  const dir = raiz();
  fs.writeFileSync(path.join(dir, 'salida/x.mp4'), '1');
  const s = new ShortsStudioService({ root: dir });
  assert.equal(await s.mediaPath('shorts', 'x.mp4'), path.join(dir, 'salida/x.mp4'));
  await assert.rejects(s.mediaPath('shorts', '../entrada/lote.txt'), { status: 400 });
  await assert.rejects(s.mediaPath('raiz', 'x.mp4'), { status: 400 });
});

test('versículos: lanza el script sin shell y guarda el progreso', async () => {
  const dir = raiz();
  const spawnFn = spawnFalso();
  const s = new ShortsStudioService({ root: dir, spawnFn, python: 'py' });
  const job = await s.start('versiculos', { solo: 'juan-3-16' });
  assert.equal(job.status, 'running');
  const { cmd, args, opts, p } = spawnFn.llamadas[0];
  assert.equal(cmd, 'py');
  assert.deepEqual(args, [path.join(dir, 'scripts/hacer_versiculos.py'), '--solo', 'juan-3-16']);
  assert.equal(opts.shell, undefined);
  assert.equal(opts.env.SHORTS_DIR, dir);
  p.stdout.write('[1/1] juan-3-16\n      ✓ salida/juan-3-16.mp4 (15 s)\n');
  p.emit('close', 0);
  await new Promise(r => setImmediate(r));
  const fin = s.job();
  assert.equal(fin.status, 'done');
  assert.deepEqual(fin.log.slice(-2), ['[1/1] juan-3-16', '      ✓ salida/juan-3-16.mp4 (15 s)']);
});

test('un trabajo a la vez', async () => {
  const s = new ShortsStudioService({ root: raiz(), spawnFn: spawnFalso() });
  await s.start('versiculos');
  await assert.rejects(s.start('versiculos'), { status: 409 });
});

test('clipping: opciones validadas y pasadas como argumentos', async () => {
  const dir = raiz();
  fs.writeFileSync(path.join(dir, 'entrada/clipping/predica.mp4'), '1');
  const spawnFn = spawnFalso();
  const s = new ShortsStudioService({ root: dir, spawnFn, python: 'py' });
  await s.start('clipping', { video: 'predica.mp4', desde: '1:20', hasta: '2:05', ajuste: 'entero', modelo: 'small' });
  assert.deepEqual(spawnFn.llamadas[0].args, [
    path.join(dir, 'scripts/hacer_clipping.py'), '--ajuste', 'entero', '--modelo', 'small',
    'predica.mp4', '--desde', '1:20', '--hasta', '2:05']);
  spawnFn.llamadas[0].p.emit('close', 1);
  await new Promise(r => setImmediate(r));
  assert.equal(s.job().status, 'failed');
});

test('clipping rechaza opciones raras antes de lanzar nada', async () => {
  const dir = raiz();
  fs.writeFileSync(path.join(dir, 'entrada/clipping/a.mp4'), '1');
  const spawnFn = spawnFalso();
  const s = new ShortsStudioService({ root: dir, spawnFn });
  await assert.rejects(s.start('clipping', { video: 'a.mp4', desde: '1; rm -rf /' }), { status: 400 });
  await assert.rejects(s.start('clipping', { video: 'a.mp4', ajuste: 'gigante' }), { status: 400 });
  await assert.rejects(s.start('clipping', { video: 'a.mp4', modelo: 'large-v9' }), { status: 400 });
  await assert.rejects(s.start('clipping', { video: 'no.mp4' }), { status: 404 });
  await assert.rejects(s.start('clipping', { desde: '0:10' }), { status: 400 });
  await assert.rejects(s.start('otra', {}), { status: 400 });
  assert.equal(spawnFn.llamadas.length, 0);
});

test('cancelar detiene el proceso y el trabajo queda cancelado', async () => {
  const spawnFn = spawnFalso();
  const s = new ShortsStudioService({ root: raiz(), spawnFn });
  await s.start('versiculos');
  s.cancel();
  await new Promise(r => setImmediate(r));
  assert.equal(spawnFn.llamadas[0].p.killed, true);
  assert.equal(s.job().status, 'cancelled');
});

test('el registro guarda como mucho las últimas 300 líneas', async () => {
  const spawnFn = spawnFalso();
  const s = new ShortsStudioService({ root: raiz(), spawnFn });
  await s.start('versiculos');
  spawnFn.llamadas[0].p.stdout.write(Array.from({ length: 400 }, (_, i) => `l${i}`).join('\n') + '\n');
  await new Promise(r => setImmediate(r));
  assert.equal(s.job().log.length, 300);
  assert.equal(s.job().log.at(-1), 'l399');
});
