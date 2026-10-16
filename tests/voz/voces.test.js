// 03/10/2026: the owner asked for different voices across videos. There's a list
// (ELEVENLABS_VOICE_IDS) and each video uses one, always the same for the same
// video: a retry can't switch voices or pay for the narration again.
const test = require('node:test');
const assert = require('node:assert');
const { listaDeVoces, vozPara } = require('../../utils/voces');

test('the list comes from ELEVENLABS_VOICE_IDS, without blanks or repeats', () => {
  assert.deepStrictEqual(listaDeVoces({ ELEVENLABS_VOICE_IDS: ' a1, b2,,a1 , c3 ' }), ['a1', 'b2', 'c3']);
});

test('without a list, the usual voice', () => {
  assert.deepStrictEqual(listaDeVoces({ ELEVENLABS_VOICE_ID: 'unica' }), ['unica']);
  assert.deepStrictEqual(listaDeVoces({}), []);
});

test('the same video always with the same voice', () => {
  const env = { ELEVENLABS_VOICE_IDS: 'a,b,c,d' };
  assert.strictEqual(vozPara('1791021627333', env), vozPara('1791021627333', env));
});

test('with many videos all the voices on the list get used', () => {
  const env = { ELEVENLABS_VOICE_IDS: 'a,b,c,d,e,f' };
  const usadas = new Set();
  for (let i = 0; i < 120; i++) usadas.add(vozPara(String(1791000000000 + i * 7919), env));
  assert.strictEqual(usadas.size, 6);
});

test('without configured voices it returns null (the provider decides)', () => {
  assert.strictEqual(vozPara('x', {}), null);
});

test('the narration asks ElevenLabs for that video\'s voice and records it', async () => {
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

/* 07/10/2026 — the owner's calendar: the deep voice is the main one, the second
   male voice 3 nights a week and the female voice twice a month. */
const { vozDelCalendario } = require('../../utils/voces');
const CAL = { ELEVENLABS_VOICE_PRINCIPAL: 'faraon', ELEVENLABS_VOICE_SECUNDARIA: 'andre', ELEVENLABS_VOICE_MUJER: 'maria', ELEVENLABS_VOICE_IDS: 'x,y,z' };
// Dates in New York time (EDT = UTC-4 in October).
const ny = (fecha, hora) => new Date(`${fecha}T${String(hora).padStart(2, '0')}:00:00-04:00`).toISOString();

test('without a calendar, everything stays as before (list)', () => {
  assert.strictEqual(vozDelCalendario('1791021627333', { ELEVENLABS_VOICE_IDS: 'a,b' }), null);
});

test('a normal day: the main voice everywhere', () => {
  // Wednesday 07/10/2026
  assert.strictEqual(vozPara('p1', CAL, { fecha: ny('2026-10-07', 23), short: true }), 'faraon');
  assert.strictEqual(vozPara('p1', CAL, { fecha: ny('2026-10-07', 9), short: true }), 'faraon');
  assert.strictEqual(vozPara('p1', CAL, { fecha: ny('2026-10-07', 8), short: false }), 'faraon');
});

test('Tuesday, Thursday and Saturday: the secondary voice on the evening Short, not the morning one', () => {
  for (const dia of ['2026-10-06', '2026-10-08', '2026-10-10']) { // Tue, Thu, Sat
    assert.strictEqual(vozPara('p', CAL, { fecha: ny(dia, 23), short: true }), 'andre', dia);
    assert.strictEqual(vozPara('p', CAL, { fecha: ny(dia, 9), short: true }), 'faraon', dia);
  }
  assert.strictEqual(vozPara('p', CAL, { fecha: ny('2026-10-11', 23), short: true }), 'faraon'); // domingo
});

test('without a publish time, the secondary voice goes to that day\'s long video', () => {
  const martes = String(new Date(ny('2026-10-06', 4)).getTime());
  assert.strictEqual(vozPara(martes, CAL, { short: false }), 'andre');
  assert.strictEqual(vozPara(martes, CAL, { short: true }), 'faraon');
});

test('the female voice: the 1st and 15th, only on the long video (twice a month)', () => {
  assert.strictEqual(vozPara('p', CAL, { fecha: ny('2026-10-15', 8), short: false }), 'maria');
  assert.strictEqual(vozPara('p', CAL, { fecha: ny('2026-11-01', 8), short: false }), 'maria');
  // 15/10 is a Thursday: its evening Short gets the secondary voice, never the female one.
  assert.strictEqual(vozPara('p', CAL, { fecha: ny('2026-10-15', 23), short: true }), 'andre');
  assert.strictEqual(vozPara('p', CAL, { fecha: ny('2026-10-15', 9), short: true }), 'faraon');
});

test('over a month: secondary 2-3 times a week and female twice', () => {
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
