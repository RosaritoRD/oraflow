// 11/10/2026: covers are set by hand from /portadas.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { listaPortadas, rutaSegura, paginaPortadas } = require('../../utils/portadas-panel');

const raiz = path.join(__dirname, '..', '..');
const db = (filas) => ({ getAllRows: async () => filas });

test('a Short uses its vertical cover and a long video its thumbnail', async () => {
  const items = await listaPortadas(db([
    { id: 's1', title: 'Corto', publish_time: '2026-10-12T09:00:00.000Z', youtube_url: null,
      metadata: JSON.stringify({ contentFormat: 'short' }),
      assets: JSON.stringify({ shortCover: { path: '/app/data/videos/s1_portada.jpg' }, thumbnail: null }) },
    { id: 'l1', title: 'Largo', publish_time: '2026-10-12T08:00:00.000Z', youtube_url: 'https://youtu.be/x',
      metadata: JSON.stringify({ contentFormat: 'long' }),
      assets: JSON.stringify({ thumbnail: { path: '/app/uploads/thumbnails/l1.jpg', variants: [
        { letra: 'A', path: '/app/uploads/thumbnails/l1.jpg' }, { letra: 'B', path: '/app/uploads/thumbnails/l1_B.jpg' }, { letra: 'X', path: '/x' }] } }) },
    { id: 'roto', title: 'Sin datos', publish_time: 'x', youtube_url: null, metadata: '{', assets: null }
  ]));
  assert.deepEqual(items.map(i => [i.id, i.formato, i.imagen]), [
    ['s1', 'short', '/app/data/videos/s1_portada.jpg'],
    ['l1', 'largo', '/app/uploads/thumbnails/l1.jpg'],
    ['roto', 'largo', null]
  ]);
  assert.deepEqual(items[1].variantes.map(v => v.letra), ['A', 'B']);
  assert.deepEqual(items[0].variantes, []);
});

test('only serves files from data/ or uploads/', () => {
  assert.ok(rutaSegura(path.join(raiz, 'data', 'videos', 'a.jpg')));
  assert.ok(rutaSegura(path.join(raiz, 'uploads', 'thumbnails', 'a.jpg')));
  assert.equal(rutaSegura(path.join(raiz, 'data', '..', '.env')), null);
  assert.equal(rutaSegura('/etc/passwd'), null);
  assert.equal(rutaSegura(path.join(raiz, 'database-data-x', 'a.jpg')), null);
  assert.equal(rutaSegura(null), null);
});

test('the page escapes the title and links the image by id', () => {
  const html = paginaPortadas([{ id: 'p<1>', titulo: '<b>Hola</b>', cuando: '2026-10-12T09:00:00.000Z', formato: 'short', youtube: null, imagen: '/x.jpg' }]);
  assert.ok(html.includes('&lt;b&gt;Hola&lt;/b&gt;'));
  assert.ok(html.includes('/portadas/img/p%3C1%3E.jpg'));
  assert.ok(!html.includes('<b>Hola</b>'));
  assert.ok(paginaPortadas([]).includes('Todavía no hay publicaciones'));
});

test('the long video\'s B and C variants come out for Test and compare', () => {
  const html = paginaPortadas([{ id: 'l1', titulo: 'Largo', cuando: '2026-10-12T08:00:00.000Z', formato: 'largo', youtube: null, imagen: '/a.jpg',
    variantes: [{ letra: 'A', path: '/a.jpg' }, { letra: 'B', path: '/b.jpg' }, { letra: 'C', path: '/c.jpg' }] }]);
  assert.ok(html.includes('/portadas/img/l1.jpg?v=B'));
  assert.ok(html.includes('/portadas/img/l1.jpg?v=C'));
  assert.ok(!html.includes('?v=A'));
  assert.ok(html.includes('Probar y comparar'));
});
