// 12/10/2026: at the same `speed` (0.84), eleven_flash_v2_5 speaks ~30 % slower than
// eleven_multilingual_v2 with the channel's main voice: measured with the same text, 8.8 vs 11.2
// characters per second. Since the Shorts moved to flash (06/10) they last ~2 min instead of ~1:30
// and get half the views in 24 h. ELEVENLABS_SPEED_SHORT corrects the speed ONLY when narrating
// with the Shorts model; without it, everything as before.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const pedidos = [];
const rutaAxios = require.resolve('axios');
require.cache[rutaAxios] = {
  id: rutaAxios, filename: rutaAxios, loaded: true,
  exports: async (cfg) => { pedidos.push(cfg); return { data: { audio_base64: Buffer.from('x').toString('base64'), alignment: null } }; }
};
const { AIVideoGenerator } = require('../../utils/ai-video-generator');

const salida = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'velocidad-')), 'voz.mp3');
function generador() {
  const g = new AIVideoGenerator({ elevenLabs: { apiKey: 'k', voiceId: 'v' } });
  g.elevenLabsModel = 'eleven_multilingual_v2';
  g.elevenLabsModelCorto = 'eleven_flash_v2_5';
  return g;
}
const velocidad = () => pedidos.at(-1).data.voice_settings.speed;

test('with the Shorts model ELEVENLABS_SPEED_SHORT is used; with the long-video one, VOICE_SPEED', async (t) => {
  t.after(() => { delete process.env.ELEVENLABS_SPEED_SHORT; delete process.env.VOICE_SPEED; });
  process.env.VOICE_SPEED = '0.84';
  process.env.ELEVENLABS_SPEED_SHORT = '1.08';
  const g = generador();
  g.modeloActual = 'eleven_flash_v2_5';
  await g.requestElevenLabsTTS('Señor, gracias por este día.', salida);
  assert.equal(velocidad(), 1.08);
  assert.equal(pedidos.at(-1).data.model_id, 'eleven_flash_v2_5');
  g.modeloActual = 'eleven_multilingual_v2';
  await g.requestElevenLabsTTS('Señor, gracias por este día.', salida);
  assert.equal(velocidad(), 0.84);
});

test('without ELEVENLABS_SPEED_SHORT, Shorts keep VOICE_SPEED (as before)', async (t) => {
  t.after(() => { delete process.env.VOICE_SPEED; });
  process.env.VOICE_SPEED = '0.84';
  const g = generador();
  g.modeloActual = 'eleven_flash_v2_5';
  await g.requestElevenLabsTTS('Hola', salida);
  assert.equal(velocidad(), 0.84);
});

test('without a Shorts model of its own, the Shorts speed isn\'t applied', async (t) => {
  t.after(() => { delete process.env.ELEVENLABS_SPEED_SHORT; delete process.env.VOICE_SPEED; });
  process.env.VOICE_SPEED = '0.84';
  process.env.ELEVENLABS_SPEED_SHORT = '1.08';
  const g = generador();
  g.elevenLabsModelCorto = '';
  g.modeloActual = 'eleven_multilingual_v2';
  await g.requestElevenLabsTTS('Hola', salida);
  assert.equal(velocidad(), 0.84);
});

test('an out-of-range value is clipped to ElevenLabs\' maximum (1.2)', async (t) => {
  t.after(() => { delete process.env.ELEVENLABS_SPEED_SHORT; });
  process.env.ELEVENLABS_SPEED_SHORT = '3';
  const g = generador();
  g.modeloActual = 'eleven_flash_v2_5';
  await g.requestElevenLabsTTS('Hola', salida);
  assert.equal(velocidad(), 1.2);
});

const { ajusteCorto, LIMITE_CORTO } = require('../../utils/voice-pacing');

test('a Short\'s narration cache changes if its model or speed changes (and the long videos\' doesn\'t)', () => {
  const env = { ELEVENLABS_TTS_MODEL_SHORT: 'eleven_flash_v2_5', ELEVENLABS_SPEED_SHORT: '1.08' };
  assert.equal(ajusteCorto('a'.repeat(1000), env), 'eleven_flash_v2_5@1.08');
  assert.notEqual(ajusteCorto('a'.repeat(1000), env), ajusteCorto('a'.repeat(1000), { ...env, ELEVENLABS_SPEED_SHORT: '' }));
  assert.equal(ajusteCorto('a'.repeat(LIMITE_CORTO + 1), env), '', 'un largo no cambia de clave');
  assert.equal(ajusteCorto('a'.repeat(1000), {}), '', 'sin modelo de Shorts, nada cambia');
});

// 12/10/2026: the 13/10 Short (1,230 spoken characters) carried 14 <break …/> pauses and with them
// added up to 1,538: it went over LIMITE_CORTO and came out with the long videos' model and speed
// (twice the credits). What counts as a Short is decided by what's SAID, not by the pause markers.
const conPausas = (hablados, pausas) => {
  const trozo = 'a'.repeat(Math.floor(hablados / (pausas + 1)));
  return Array.from({ length: pausas + 1 }, () => trozo).join(' <break time="0.45s" /> ');
};

test('a Short whose pauses push it over 1,500 characters keeps the Shorts model and speed', async (t) => {
  t.after(() => { delete process.env.ELEVENLABS_SPEED_SHORT; delete process.env.VOICE_SPEED; delete process.env.VOICE_POLISH; });
  process.env.VOICE_SPEED = '0.84';
  process.env.ELEVENLABS_SPEED_SHORT = '1.08';
  process.env.VOICE_POLISH = '0';
  const texto = conPausas(1230, 14);
  assert.ok(texto.length > LIMITE_CORTO, 'con las pausas pasa del límite, como el Short del 13/10');
  const g = generador();
  g.isUsableAudioFile = async () => true;
  await g.generateTTSAudio(texto, salida);
  assert.equal(pedidos.at(-1).data.model_id, 'eleven_flash_v2_5');
  assert.equal(velocidad(), 1.08);
  assert.equal(g.lastNarrationResult.model, 'eleven_flash_v2_5');
});

test('a long video keeps the long-video model even with the pauses removed', async (t) => {
  t.after(() => { delete process.env.VOICE_SPEED; delete process.env.VOICE_POLISH; });
  process.env.VOICE_SPEED = '0.84';
  process.env.VOICE_POLISH = '0';
  const g = generador();
  g.isUsableAudioFile = async () => true;
  await g.generateTTSAudio(conPausas(3380, 40), salida);
  assert.equal(pedidos.at(-1).data.model_id, 'eleven_multilingual_v2');
  assert.equal(velocidad(), 0.84);
});

test('the cache key of a Short with many pauses carries its model and speed', () => {
  const env = { ELEVENLABS_TTS_MODEL_SHORT: 'eleven_flash_v2_5', ELEVENLABS_SPEED_SHORT: '1.08' };
  assert.equal(ajusteCorto(conPausas(1230, 14), env), 'eleven_flash_v2_5@1.08');
  assert.equal(ajusteCorto(conPausas(3380, 40), env), '');
});
