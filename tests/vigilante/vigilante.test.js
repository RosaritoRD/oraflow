// 07/10/2026: el vigilante también avisa de los privados de Instagram y del acceso que caduca.
const test = require('node:test');
const assert = require('node:assert/strict');
const v = require('../../scripts/vigilante');

const db = s => ({ getSetting: async k => s[k] ?? null });

test('miraPrivado: avisa si el último intento falló después del último envío, y solo si está encendido', async () => {
  const now = new Date('2026-10-08T12:00:00Z');
  const fallo = { dm_amen_enabled: 'true', dm_amen_estado: JSON.stringify({ ultimoEnvio: '2026-10-07T10:00:00Z', ultimoError: { mensaje: '(#10) sin permiso', at: '2026-10-08T11:00:00Z' } }) };
  const p = await v.miraPrivado(db(fallo), now);
  assert.equal(p.length, 1);
  assert.equal(p[0].clave, 'privado');
  assert.match(p[0].mensaje, /privado/);
  assert.deepEqual(await v.miraPrivado(db({ ...fallo, dm_amen_enabled: 'false' }), now), []);
  const resuelto = { dm_amen_enabled: 'true', dm_amen_estado: JSON.stringify({ ultimoEnvio: '2026-10-08T11:30:00Z', ultimoError: { mensaje: 'x', at: '2026-10-08T11:00:00Z' } }) };
  assert.deepEqual(await v.miraPrivado(db(resuelto), now), []);
  const viejo = { dm_amen_enabled: 'true', dm_amen_estado: JSON.stringify({ ultimoError: { mensaje: 'x', at: '2026-10-01T11:00:00Z' } }) };
  assert.deepEqual(await v.miraPrivado(db(viejo), now), []); // más de 24 h: ya no es "ahora"
});

test('miraTokenInstagram: avisa cuando lleva más de 14 días sin renovarse', async () => {
  const now = new Date('2026-10-30T12:00:00Z');
  assert.deepEqual(await v.miraTokenInstagram(db({ instagram_token_refreshed_at: '2026-10-25T12:00:00Z' }), now), []);
  const p = await v.miraTokenInstagram(db({ instagram_token_refreshed_at: '2026-10-01T12:00:00Z' }), now);
  assert.equal(p[0].clave, 'instagram-token');
  assert.match(p[0].mensaje, /29 días/);
  assert.deepEqual(await v.miraTokenInstagram(db({}), now), []);
});
