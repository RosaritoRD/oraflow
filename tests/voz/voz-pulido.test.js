// 02/10/2026: the owner asked for the same voice «warmer, more familiar and higher
// quality». The narration is requested at 192 kbps and polished (body in the lows,
// less sibilance, gentle compression and a very light room) WITHOUT changing its
// volume: if it went up, the piano would end up proportionally quieter.
const test = require('node:test');
const assert = require('node:assert');
const { formatoSalida, pulidoActivo, cadenaPulido, gananciaCompensada } = require('../../utils/voz-pulido');

test('requests 192 kbps by default and respects VOICE_OUTPUT_FORMAT', () => {
  assert.strictEqual(formatoSalida({}), 'mp3_44100_192');
  assert.strictEqual(formatoSalida({ VOICE_OUTPUT_FORMAT: 'mp3_44100_128' }), 'mp3_44100_128');
});

test('an odd format never reaches the URL', () => {
  assert.strictEqual(formatoSalida({ VOICE_OUTPUT_FORMAT: 'mp3&x=1' }), 'mp3_44100_192');
});

test('polishing is on unless VOICE_POLISH=0', () => {
  assert.strictEqual(pulidoActivo({}), true);
  assert.strictEqual(pulidoActivo({ VOICE_POLISH: '0' }), false);
});

test('the chain adds body, removes sibilance and doesn\'t normalize volume', () => {
  const c = cadenaPulido();
  assert.match(c, /highpass/);
  assert.match(c, /equalizer=f=180/);
  assert.match(c, /deesser/);
  assert.match(c, /acompressor/);
  assert.doesNotMatch(c, /loudnorm/);
});

test('the gain brings the voice back to its input volume, capped', () => {
  assert.strictEqual(gananciaCompensada(-20.2, -25.3), 5.1);
  assert.strictEqual(gananciaCompensada(-20, -40), 12);
  assert.strictEqual(gananciaCompensada(-20, NaN), 0);
});
