// 07/10/2026: en Conexiones se ve si el PC está haciendo los vídeos o si la VPS lo cubre.
const test = require('node:test');
const assert = require('node:assert/strict');
const { pc } = require('../../utils/conexiones');

const responde = mapa => async (url) => {
  const r = Object.entries(mapa).find(([k]) => url.includes(k));
  if (!r || r[1] === 'caido') throw new Error('ECONNREFUSED');
  return { ok: true, status: 200, json: async () => r[1] };
};
const ENV = { FFMPEG_REMOTO_URL: 'http://pc:8096', LOCAL_LLM_URL: 'http://pc:11434', LOCAL_VOZ_URL: 'http://pc:8095' };

test('PC sano: taller, voz e IA local', async () => {
  const e = await pc({ env: ENV, fetchImpl: responde({ ':8096': { ok: true, nucleos: 24 }, ':8095': { ok: true }, ':11434': { models: [{ name: 'qwen3:8b' }] } }),
    taller: { remotos: 12, locales: 1, fallos: 0 } });
  assert.equal(e.estado, 'verified');
  assert.match(e.detalle, /24 núcleos/);
  assert.match(e.detalle, /12 en el PC/);
  assert.match(e.detalle, /voz/i);
});

test('PC apagado: la VPS cubre y se dice', async () => {
  const e = await pc({ env: ENV, fetchImpl: responde({ ':8096': 'caido', ':8095': 'caido', ':11434': 'caido' }), taller: { remotos: 0, locales: 5, fallos: 2 } });
  assert.equal(e.estado, 'partial');
  assert.match(e.detalle, /VPS/);
});

test('sin configurar', async () => {
  const e = await pc({ env: {}, fetchImpl: responde({}) });
  assert.equal(e.estado, 'not_configured');
});
