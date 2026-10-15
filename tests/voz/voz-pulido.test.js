// 02/10/2026: el autor pidió la misma voz «más cálida, familiar y con más calidad».
// La narración se pide a 192 kbps y se pule (cuerpo en graves, menos sibilancia,
// compresión suave y sala muy leve) SIN cambiar su volumen: si subiera, el piano
// quedaría proporcionalmente más bajo.
const test = require('node:test');
const assert = require('node:assert');
const { formatoSalida, pulidoActivo, cadenaPulido, gananciaCompensada } = require('../../utils/voz-pulido');

test('pide 192 kbps por defecto y respeta VOICE_OUTPUT_FORMAT', () => {
  assert.strictEqual(formatoSalida({}), 'mp3_44100_192');
  assert.strictEqual(formatoSalida({ VOICE_OUTPUT_FORMAT: 'mp3_44100_128' }), 'mp3_44100_128');
});

test('un formato raro no llega a la URL', () => {
  assert.strictEqual(formatoSalida({ VOICE_OUTPUT_FORMAT: 'mp3&x=1' }), 'mp3_44100_192');
});

test('el pulido está activo salvo VOICE_POLISH=0', () => {
  assert.strictEqual(pulidoActivo({}), true);
  assert.strictEqual(pulidoActivo({ VOICE_POLISH: '0' }), false);
});

test('la cadena da cuerpo, quita sibilancia y no normaliza el volumen', () => {
  const c = cadenaPulido();
  assert.match(c, /highpass/);
  assert.match(c, /equalizer=f=180/);
  assert.match(c, /deesser/);
  assert.match(c, /acompressor/);
  assert.doesNotMatch(c, /loudnorm/);
});

test('la ganancia devuelve la voz a su volumen de entrada, con tope', () => {
  assert.strictEqual(gananciaCompensada(-20.2, -25.3), 5.1);
  assert.strictEqual(gananciaCompensada(-20, -40), 12);
  assert.strictEqual(gananciaCompensada(-20, NaN), 0);
});
