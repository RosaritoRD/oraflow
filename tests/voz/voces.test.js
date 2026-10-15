// 03/10/2026: el autor pidió voces distintas en los vídeos. Hay una lista
// (ELEVENLABS_VOICE_IDS) y cada vídeo usa una, siempre la misma para el mismo
// vídeo: un reintento no puede cambiar de voz ni volver a pagar la narración.
const test = require('node:test');
const assert = require('node:assert');
const { listaDeVoces, vozPara } = require('../../utils/voces');

test('la lista sale de ELEVENLABS_VOICE_IDS, sin huecos ni repetidas', () => {
  assert.deepStrictEqual(listaDeVoces({ ELEVENLABS_VOICE_IDS: ' a1, b2,,a1 , c3 ' }), ['a1', 'b2', 'c3']);
});

test('sin lista, la voz de siempre', () => {
  assert.deepStrictEqual(listaDeVoces({ ELEVENLABS_VOICE_ID: 'unica' }), ['unica']);
  assert.deepStrictEqual(listaDeVoces({}), []);
});

test('el mismo vídeo siempre con la misma voz', () => {
  const env = { ELEVENLABS_VOICE_IDS: 'a,b,c,d' };
  assert.strictEqual(vozPara('1791021627333', env), vozPara('1791021627333', env));
});

test('con muchos vídeos se usan todas las voces de la lista', () => {
  const env = { ELEVENLABS_VOICE_IDS: 'a,b,c,d,e,f' };
  const usadas = new Set();
  for (let i = 0; i < 120; i++) usadas.add(vozPara(String(1791000000000 + i * 7919), env));
  assert.strictEqual(usadas.size, 6);
});

test('sin voces configuradas devuelve null (el proveedor decide)', () => {
  assert.strictEqual(vozPara('x', {}), null);
});

test('la narración pide a ElevenLabs la voz de ese vídeo y la anota', async () => {
  const os = require('os');
  const fs = require('fs');
  const path = require('path');
  const { StoryboardPipeline } = require('../../utils/storyboard-pipeline');
  const prev = { ...process.env };
  Object.assign(process.env, { ELEVENLABS_VOICE_IDS: 'vozA,vozB,vozC', CONTENT_LANGUAGE: 'es' });
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'voces-'));
  let pedida = null;
  const videoGenerator = {
    generateTTSAudio: async (_texto, salida, opciones = {}) => { pedida = opciones.voiceId; fs.writeFileSync(salida, 'x'); return salida; },
    isUsableAudioFile: async () => true,
    probeAudioDuration: async () => 12
  };
  const p = new StoryboardPipeline({ db: {}, logger: { info() {}, warn() {} }, videoGenerator, dataRoot, stockMedia: {} });
  const produccion = { id: '1791021627333', script: { hook: { text: 'Señor, gracias por este día.' } }, assets: {}, timeline: {} };
  await p.narrate(produccion);
  process.env = prev;
  assert.strictEqual(pedida, vozPara('1791021627333', { ELEVENLABS_VOICE_IDS: 'vozA,vozB,vozC' }));
  assert.strictEqual(produccion.assets.audio.voiceId, pedida);
});

/* 07/10/2026 — el calendario del autor: la voz grave es la principal, la segunda
   voz de hombre 3 noches por semana y la de mujer 2 veces al mes. */
const { vozDelCalendario } = require('../../utils/voces');
const CAL = { ELEVENLABS_VOICE_PRINCIPAL: 'faraon', ELEVENLABS_VOICE_SECUNDARIA: 'andre', ELEVENLABS_VOICE_MUJER: 'maria', ELEVENLABS_VOICE_IDS: 'x,y,z' };
// Fechas en hora de Nueva York (EDT = UTC-4 en octubre).
const ny = (fecha, hora) => new Date(`${fecha}T${String(hora).padStart(2, '0')}:00:00-04:00`).toISOString();

test('sin calendario, todo sigue como antes (lista)', () => {
  assert.strictEqual(vozDelCalendario('1791021627333', { ELEVENLABS_VOICE_IDS: 'a,b' }), null);
});

test('un día normal: la voz principal en todo', () => {
  // Miércoles 07/10/2026
  assert.strictEqual(vozPara('p1', CAL, { fecha: ny('2026-10-07', 23), short: true }), 'faraon');
  assert.strictEqual(vozPara('p1', CAL, { fecha: ny('2026-10-07', 9), short: true }), 'faraon');
  assert.strictEqual(vozPara('p1', CAL, { fecha: ny('2026-10-07', 8), short: false }), 'faraon');
});

test('martes, jueves y sábado: la secundaria en el Short de la noche, no en el de la mañana', () => {
  for (const dia of ['2026-10-06', '2026-10-08', '2026-10-10']) { // mar, jue, sáb
    assert.strictEqual(vozPara('p', CAL, { fecha: ny(dia, 23), short: true }), 'andre', dia);
    assert.strictEqual(vozPara('p', CAL, { fecha: ny(dia, 9), short: true }), 'faraon', dia);
  }
  assert.strictEqual(vozPara('p', CAL, { fecha: ny('2026-10-11', 23), short: true }), 'faraon'); // domingo
});

test('sin hora de publicación, la secundaria va al largo de ese día', () => {
  const martes = String(new Date(ny('2026-10-06', 4)).getTime());
  assert.strictEqual(vozPara(martes, CAL, { short: false }), 'andre');
  assert.strictEqual(vozPara(martes, CAL, { short: true }), 'faraon');
});

test('la voz de mujer: días 1 y 15, solo en el largo (2 al mes)', () => {
  assert.strictEqual(vozPara('p', CAL, { fecha: ny('2026-10-15', 8), short: false }), 'maria');
  assert.strictEqual(vozPara('p', CAL, { fecha: ny('2026-11-01', 8), short: false }), 'maria');
  // El 15/10 es jueves: su Short de la noche lleva la secundaria, nunca la de mujer.
  assert.strictEqual(vozPara('p', CAL, { fecha: ny('2026-10-15', 23), short: true }), 'andre');
  assert.strictEqual(vozPara('p', CAL, { fecha: ny('2026-10-15', 9), short: true }), 'faraon');
});

test('en un mes: secundaria 2-3 veces por semana y mujer 2 veces', () => {
  const cuenta = {};
  for (let d = 1; d <= 31; d++) {
    const dia = `2026-10-${String(d).padStart(2, '0')}`;
    for (const [hora, short] of [[8, false], [9, true], [23, true]]) {
      const v = vozPara(`${dia}-${hora}`, CAL, { fecha: ny(dia, hora), short });
      cuenta[v] = (cuenta[v] || 0) + 1;
    }
  }
  assert.strictEqual(cuenta.maria, 2);
  assert.ok(cuenta.andre >= 12 && cuenta.andre <= 14, `andre ${cuenta.andre}`);
  assert.ok(cuenta.faraon > 70);
});
