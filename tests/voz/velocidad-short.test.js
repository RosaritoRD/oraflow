// 12/10/2026: con la misma `speed` (0.84), eleven_flash_v2_5 habla ~30 % más lento que
// eleven_multilingual_v2 con la voz principal del canal: medido con el mismo texto, 8,8 frente a
// 11,2 caracteres por segundo. Desde que los Shorts usan flash (06/10) duran ~2 min en vez de
// ~1:30 y sacan la mitad de vistas en 24 h. ELEVENLABS_SPEED_SHORT corrige la velocidad SOLO
// cuando se narra con el modelo de los Shorts; sin ella, todo como antes.
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

test('con el modelo de los Shorts se usa ELEVENLABS_SPEED_SHORT; con el de los largos, VOICE_SPEED', async (t) => {
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

test('sin ELEVENLABS_SPEED_SHORT, los Shorts siguen con VOICE_SPEED (como antes)', async (t) => {
  t.after(() => { delete process.env.VOICE_SPEED; });
  process.env.VOICE_SPEED = '0.84';
  const g = generador();
  g.modeloActual = 'eleven_flash_v2_5';
  await g.requestElevenLabsTTS('Hola', salida);
  assert.equal(velocidad(), 0.84);
});

test('sin modelo propio para los Shorts, la velocidad de los Shorts no se aplica', async (t) => {
  t.after(() => { delete process.env.ELEVENLABS_SPEED_SHORT; delete process.env.VOICE_SPEED; });
  process.env.VOICE_SPEED = '0.84';
  process.env.ELEVENLABS_SPEED_SHORT = '1.08';
  const g = generador();
  g.elevenLabsModelCorto = '';
  g.modeloActual = 'eleven_multilingual_v2';
  await g.requestElevenLabsTTS('Hola', salida);
  assert.equal(velocidad(), 0.84);
});

test('un valor fuera de rango se recorta al máximo de ElevenLabs (1.2)', async (t) => {
  t.after(() => { delete process.env.ELEVENLABS_SPEED_SHORT; });
  process.env.ELEVENLABS_SPEED_SHORT = '3';
  const g = generador();
  g.modeloActual = 'eleven_flash_v2_5';
  await g.requestElevenLabsTTS('Hola', salida);
  assert.equal(velocidad(), 1.2);
});

const { ajusteCorto, LIMITE_CORTO } = require('../../utils/voice-pacing');

test('la caché de la narración de un Short cambia si cambian su modelo o su velocidad (y la de los largos no)', () => {
  const env = { ELEVENLABS_TTS_MODEL_SHORT: 'eleven_flash_v2_5', ELEVENLABS_SPEED_SHORT: '1.08' };
  assert.equal(ajusteCorto('a'.repeat(1000), env), 'eleven_flash_v2_5@1.08');
  assert.notEqual(ajusteCorto('a'.repeat(1000), env), ajusteCorto('a'.repeat(1000), { ...env, ELEVENLABS_SPEED_SHORT: '' }));
  assert.equal(ajusteCorto('a'.repeat(LIMITE_CORTO + 1), env), '', 'un largo no cambia de clave');
  assert.equal(ajusteCorto('a'.repeat(1000), {}), '', 'sin modelo de Shorts, nada cambia');
});

// 12/10/2026: el Short del 13/10 (1.230 caracteres hablados) llevaba 14 pausas <break …/> y con
// ellas sumaba 1.538: pasó de LIMITE_CORTO y salió con el modelo y la velocidad de los largos
// (el doble de créditos). Qué es un Short lo decide lo que se DICE, no las marcas de pausa.
const conPausas = (hablados, pausas) => {
  const trozo = 'a'.repeat(Math.floor(hablados / (pausas + 1)));
  return Array.from({ length: pausas + 1 }, () => trozo).join(' <break time="0.45s" /> ');
};

test('un Short con pausas que pasan de 1.500 caracteres sigue con el modelo y la velocidad de los Shorts', async (t) => {
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

test('un largo sigue con el modelo de los largos aunque se le quiten las pausas', async (t) => {
  t.after(() => { delete process.env.VOICE_SPEED; delete process.env.VOICE_POLISH; });
  process.env.VOICE_SPEED = '0.84';
  process.env.VOICE_POLISH = '0';
  const g = generador();
  g.isUsableAudioFile = async () => true;
  await g.generateTTSAudio(conPausas(3380, 40), salida);
  assert.equal(pedidos.at(-1).data.model_id, 'eleven_multilingual_v2');
  assert.equal(velocidad(), 0.84);
});

test('la clave de caché de un Short con muchas pausas lleva su modelo y velocidad', () => {
  const env = { ELEVENLABS_TTS_MODEL_SHORT: 'eleven_flash_v2_5', ELEVENLABS_SPEED_SHORT: '1.08' };
  assert.equal(ajusteCorto(conPausas(1230, 14), env), 'eleven_flash_v2_5@1.08');
  assert.equal(ajusteCorto(conPausas(3380, 40), env), '');
});
