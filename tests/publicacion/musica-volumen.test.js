// 02/10/2026: the piano «a little louder» on the prayers, and on the Shorts «on some,
// not all». Volume per format, decided per video.
const test = require('node:test');
const assert = require('node:assert/strict');
const { musicGainFor } = require('../../utils/prayer-theme');

const env = { BACKGROUND_MUSIC_DB: '-14' };

test('long videos carry the piano louder than the base (3 dB by default)', () => {
  assert.equal(musicGainFor({ formato: 'long', semilla: 'x', env }), -11);
  assert.equal(musicGainFor({ formato: 'long', semilla: 'x', env: { ...env, BACKGROUND_MUSIC_DB_LONG: '-9' } }), -9);
});

test('Shorts: some louder, most at the base, and always the same for the same video', () => {
  const ids = Array.from({ length: 400 }, (_, i) => `prod_${i}`);
  const altos = ids.filter(id => musicGainFor({ formato: 'short', semilla: id, env }) === -11).length;
  const base = ids.filter(id => musicGainFor({ formato: 'short', semilla: id, env }) === -14).length;
  assert.equal(altos + base, 400);
  assert.ok(altos > 120 && altos < 200, `~40 % altos, salieron ${altos}`);
  for (const id of ids.slice(0, 20)) {
    assert.equal(musicGainFor({ formato: 'short', semilla: id, env }), musicGainFor({ formato: 'short', semilla: id, env }));
  }
});

test('the percentage of loud Shorts is adjustable (0 = none, 100 = all)', () => {
  assert.equal(musicGainFor({ formato: 'short', semilla: 'a', env: { ...env, SHORT_MUSIC_LOUD_PCT: '0' } }), -14);
  assert.equal(musicGainFor({ formato: 'short', semilla: 'a', env: { ...env, SHORT_MUSIC_LOUD_PCT: '100' } }), -11);
});

test('never goes above 0 dB or below -40', () => {
  assert.equal(musicGainFor({ formato: 'long', semilla: 'x', env: { BACKGROUND_MUSIC_DB_LONG: '6' } }), 0);
  assert.equal(musicGainFor({ formato: 'long', semilla: 'x', env: { BACKGROUND_MUSIC_DB_LONG: '-90' } }), -40);
});

test('without a format (old calls): the usual base', () => {
  assert.equal(musicGainFor({ env }), -14);
});
