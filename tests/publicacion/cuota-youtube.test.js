// 06/10/2026: protect the daily YouTube quota for uploads.
const test = require('node:test');
const assert = require('node:assert/strict');
const c = require('../../utils/cuota-youtube');
const a = require('../../utils/amen-automatico');

test('renewal at California midnight', () => {
  assert.equal(c.proximaRenovacion(new Date('2026-10-06T01:24:00Z')).toISOString(), '2026-10-06T07:05:00.000Z'); // 18:24 PDT → 00:05 PDT
  assert.ok(c.esCuota(new Error('you have exceeded your quota')));
  assert.ok(!c.esCuota(new Error('forbidden')));
});

test('with the quota exhausted, YouTube isn\'t tried and the other networks carry on', async () => {
  const s = {};
  const db = { getSetting: async k => s[k] ?? null, setSetting: async (k, v) => { s[k] = v; } };
  const now = new Date('2026-10-06T01:30:00Z');
  let llamadas = 0;
  const yt = { nombre: 'youtube', comentarios: async () => { llamadas += 1; throw new Error('exceeded your quota'); }, responde: async () => {} };
  const ig = { nombre: 'instagram', comentarios: async () => [{ id: '1', texto: 'Amén', fecha: '2026-10-06T01:00:00Z' }], responde: async () => {} };
  await a.respondeAmenes({ db, redes: [yt, ig], now });
  assert.ok(await c.agotada(db, now));
  s.amen_proxima = null;
  await a.respondeAmenes({ db, redes: [yt], now: new Date('2026-10-06T02:30:00Z') });
  assert.equal(llamadas, 1);
});
