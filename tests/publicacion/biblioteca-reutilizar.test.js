const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const path = require('path');
const fs = require('fs').promises;
const { fichaDe, guardaFicha, leeFichas, busca, registraUso, elegirVariante } = require('../../utils/biblioteca-stock');
const { filtroVariante, claveDePlano } = require('../../utils/timeline-renderer');

// 30/09: cada vídeo descargaba clips nuevos de Pexels y la carpeta llegó a 16 GB.
// Ahora los clips descargados llevan ficha y se reutilizan con otra "variante".

const clip = (id, extra = {}) => ({
  source: 'pexels', id, type: 'video', title: `sunrise over calm beach ${id}`, keywords: ['sea', 'dawn'],
  width: 1920, height: 1080, durationSec: 20, url: `https://videos.pexels.com/${id}.mp4`, license: 'Pexels', ...extra
});

test('la ficha guarda lo necesario para volver a encontrar el clip', () => {
  const f = fichaDe(clip('1'));
  assert.equal(f.id, '1');
  assert.equal(f.url, 'https://videos.pexels.com/1.mp4');
  assert.deepEqual(f.usos, []);
});

test('busca por palabras, orientación y duración, y excluye los ya usados', () => {
  const fichas = [
    { ruta: '/s/a.mp4', ficha: fichaDe(clip('a')) },
    { ruta: '/s/b.mp4', ficha: fichaDe(clip('b', { title: 'city traffic night', keywords: [] })) },  // no casa
    { ruta: '/s/c.mp4', ficha: fichaDe(clip('c', { width: 1080, height: 1920 })) },                 // vertical
    { ruta: '/s/d.mp4', ficha: fichaDe(clip('d', { durationSec: 3 })) },                            // corto
    { ruta: '/s/e.mp4', ficha: fichaDe(clip('e')) }
  ];
  const r = busca(fichas, { queries: ['calm beach at sunrise'], orientacion: 'landscape', minDuracion: 8, excluir: new Set(['e']) });
  assert.deepEqual(r.map(a => a.id), ['a']);
  assert.equal(r[0].desdeBiblioteca, true);
  assert.equal(r[0].downloadable, true);
});

test('un clip usado hace poco queda detrás de uno que descansa', () => {
  const ahora = Date.parse('2026-09-30T12:00:00Z');
  const reciente = fichaDe(clip('r')); reciente.usos = [{ produccion: 'p1', en: '2026-09-30T08:00:00Z' }];
  const r = busca([{ ruta: '/s/r.mp4', ficha: reciente }, { ruta: '/s/l.mp4', ficha: fichaDe(clip('l')) }],
    { queries: ['beach'], orientacion: 'landscape', minDuracion: 5, ahora });
  assert.deepEqual(r.map(a => a.id), ['l', 'r']);
  assert.equal(r[1].usos, 1);
});

test('guarda la ficha junto al clip, conserva los usos y los registra', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'biblio-'));
  const media = path.join(dir, 'x.mp4');
  await fs.writeFile(media, 'video');
  await guardaFicha(media, clip('x'));
  await registraUso(media, 'prod_1', new Date('2026-09-29T10:00:00Z'));
  await guardaFicha(media, clip('x', { title: 'otro título' }));        // re-descarga: no pierde usos
  const [{ ruta, ficha }] = await leeFichas(dir);
  assert.equal(ruta, media);
  assert.equal(ficha.title, 'otro título');
  assert.equal(ficha.usos.length, 1);
  await fs.rm(dir, { recursive: true });
});

test('la primera vez el clip va tal cual; después, cada uso con otra variante', () => {
  assert.equal(elegirVariante(0, 'a'), null);
  const v1 = elegirVariante(1, 'a');
  const v2 = elegirVariante(2, 'a');
  assert.ok(v1 && v2);
  assert.notDeepEqual(v1, v2);
  assert.deepEqual(elegirVariante(1, 'a'), v1);                         // determinista: caché de planos estable
  for (const v of [v1, v2]) {
    assert.ok(v.inicio >= 0 && v.inicio < 0.6);
    assert.ok(['neutro', 'calido', 'frio', 'suave'].includes(v.tono));
    assert.ok([1, 0.8].includes(v.velocidad));
  }
});

test('el filtro de la variante: espejo, tono, velocidad y movimiento', () => {
  const f = filtroVariante({ espejo: true, tono: 'calido', movimiento: 'pan-right', velocidad: 0.8, inicio: 0.2 },
    { width: 1920, height: 1080, fps: 30, frames: 300 });
  assert.match(f, /setpts=PTS\/0\.8/);
  assert.match(f, /hflip/);
  assert.match(f, /colorbalance/);
  assert.match(f, /zoompan=/);
  assert.equal(filtroVariante(null, { width: 1920, height: 1080, fps: 30, frames: 300 }),
    'scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,fps=30');
});

test('la variante cambia la clave de la caché de planos', () => {
  const base = { duration: 5, selectedAsset: { localPath: '/no/existe.mp4' } };
  const dim = { width: 1920, height: 1080, fps: 30 };
  assert.notEqual(claveDePlano(base, 0, dim), claveDePlano({ ...base, variante: { espejo: true } }, 0, dim));
});
