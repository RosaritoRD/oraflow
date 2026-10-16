// 05/10/2026: public pages /libro and /enlaces.
const test = require('node:test');
const assert = require('node:assert/strict');
const libro = require('../../utils/pagina-libro');
const enlaces = require('../../utils/pagina-enlaces');

test('book: without a checkout URL the button goes nowhere; with a URL, to Hotmart', () => {
  assert.match(libro.paginaLibro({}), /Disponible muy pronto/);
  const html = libro.paginaLibro({ checkoutUrl: 'https://pay.hotmart.com/X123' });
  assert.match(html, /href="\/libro\/comprar"/);
  assert.match(html, /988/);
});

test('links: buttons with a counter, known destinations and no ads', async () => {
  const html = enlaces.paginaEnlaces();
  for (const e of enlaces.ENLACES) assert.match(html, new RegExp(`/enlaces/ir/${e.id}`));
  assert.equal(enlaces.destino('hoy'), '/hoy');
  assert.equal(enlaces.destino('nada'), null);
  const s = {};
  const db = { getSetting: async k => s[k] ?? null, setSetting: async (k, v) => { s[k] = v; } };
  await enlaces.cuentaClic(db, 'libro', new Date('2026-10-05T12:00:00Z'));
  await enlaces.cuentaClic(db, 'libro', new Date('2026-10-05T13:00:00Z'));
  assert.equal(JSON.parse(s.enlaces_clics)['2026-10-05'].libro, 2);
});

test('counter: counts people, not robots; summary for today and the week', async () => {
  const c = require('../../utils/contador');
  const s = {};
  const db = { getSetting: async k => s[k] ?? null, setSetting: async (k, v) => { s[k] = v; } };
  const now = new Date('2026-10-05T16:00:00Z');
  assert.equal(await c.cuenta(db, 'libro_visita', { userAgent: 'Mozilla/5.0 (iPhone)', now }), true);
  assert.equal(await c.cuenta(db, 'libro_visita', { userAgent: 'facebookexternalhit/1.1', now }), false);
  assert.equal(await c.cuenta(db, 'libro_visita', { userAgent: '', now }), false);
  await c.cuenta(db, 'libro_visita', { userAgent: 'Mozilla', now: new Date('2026-10-02T16:00:00Z') });
  const r = await c.resumen(db, now);
  assert.equal(r.hoy.libro_visita, 1);
  assert.equal(r.semana.libro_visita, 2);
});
