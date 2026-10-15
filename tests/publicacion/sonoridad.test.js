// 06/10/2026: volumen final a -14 LUFS.
const test = require('node:test');
const assert = require('node:assert/strict');
const s = require('../../utils/sonoridad');

test('ganancia hasta -14 LUFS, con topes y sin tocar el silencio', () => {
  assert.equal(s.ganancia(-30.4), 16.4);
  assert.equal(s.ganancia(-18.1), 4.1);
  assert.equal(s.ganancia(-9), -5);
  assert.equal(s.ganancia(-45), 20);
  assert.equal(s.ganancia(-90), 0);
  assert.equal(s.objetivo({ TARGET_LUFS: '-16' }), -16);
  assert.equal(s.objetivo({ TARGET_LUFS: 'x' }), -14);
});

test('normalizaVideo: aplica la ganancia, deja el vídeo sin recodificar y se apaga con LOUDNORM=0', async () => {
  const fs = require('fs'); const os = require('os'); const path = require('path');
  const ruta = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'lufs-')), 'v.mp4');
  fs.writeFileSync(ruta, 'x');
  const llamadas = [];
  let medidas = [-30, -14.2];
  const r = await s.normalizaVideo(ruta, { env: {}, mide: async () => medidas.shift(), ejecuta: async args => { llamadas.push(args); fs.writeFileSync(args.at(-1), 'y'); } });
  assert.deepEqual(r, { antes: -30, despues: -14.2, ganancia: 16 });
  assert.ok(llamadas[0].includes('copy'));
  assert.match(llamadas[0].join(' '), /volume=16dB/);
  assert.equal(await s.normalizaVideo(ruta, { env: { LOUDNORM: '0' } }), null);
});
