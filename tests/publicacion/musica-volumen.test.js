// 02/10/2026 (el autor): el piano «un poquito más fuerte» en las oraciones, y en los
// Shorts «en algunos, no en todos». Volumen por formato, decidido por el vídeo.
const test = require('node:test');
const assert = require('node:assert/strict');
const { musicGainFor } = require('../../utils/prayer-theme');

const env = { BACKGROUND_MUSIC_DB: '-14' };

test('los largos llevan el piano más alto que la base (por defecto 3 dB)', () => {
  assert.equal(musicGainFor({ formato: 'long', semilla: 'x', env }), -11);
  assert.equal(musicGainFor({ formato: 'long', semilla: 'x', env: { ...env, BACKGROUND_MUSIC_DB_LONG: '-9' } }), -9);
});

test('Shorts: algunos más altos, la mayoría a la base, y siempre igual para el mismo vídeo', () => {
  const ids = Array.from({ length: 400 }, (_, i) => `prod_${i}`);
  const altos = ids.filter(id => musicGainFor({ formato: 'short', semilla: id, env }) === -11).length;
  const base = ids.filter(id => musicGainFor({ formato: 'short', semilla: id, env }) === -14).length;
  assert.equal(altos + base, 400);
  assert.ok(altos > 120 && altos < 200, `~40 % altos, salieron ${altos}`);
  for (const id of ids.slice(0, 20)) {
    assert.equal(musicGainFor({ formato: 'short', semilla: id, env }), musicGainFor({ formato: 'short', semilla: id, env }));
  }
});

test('el porcentaje de Shorts altos se ajusta (0 = ninguno, 100 = todos)', () => {
  assert.equal(musicGainFor({ formato: 'short', semilla: 'a', env: { ...env, SHORT_MUSIC_LOUD_PCT: '0' } }), -14);
  assert.equal(musicGainFor({ formato: 'short', semilla: 'a', env: { ...env, SHORT_MUSIC_LOUD_PCT: '100' } }), -11);
});

test('nunca pasa de 0 dB ni baja de -40', () => {
  assert.equal(musicGainFor({ formato: 'long', semilla: 'x', env: { BACKGROUND_MUSIC_DB_LONG: '6' } }), 0);
  assert.equal(musicGainFor({ formato: 'long', semilla: 'x', env: { BACKGROUND_MUSIC_DB_LONG: '-90' } }), -40);
});

test('sin formato (llamadas antiguas): la base de siempre', () => {
  assert.equal(musicGainFor({ env }), -14);
});
