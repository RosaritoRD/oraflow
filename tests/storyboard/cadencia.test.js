// 06/10/2026: clips de 24/25 fps se mezclan a 30 (framerate) en vez de repetir fotogramas.
const test = require('node:test');
const assert = require('node:assert/strict');
const { filtroVariante } = require('../../utils/timeline-renderer');

test('cadencia: framerate solo para 24/25 fps; 30 y 60 siguen con fps', () => {
  const base = { width: 1920, height: 1080, fps: 30, frames: 300 };
  assert.match(filtroVariante(null, { ...base, fuenteFps: 23.976 }), /framerate=fps=30/);
  assert.match(filtroVariante(null, { ...base, fuenteFps: 25 }), /framerate=fps=30/);
  assert.match(filtroVariante(null, { ...base, fuenteFps: 29.97 }), /,fps=30$/);
  assert.match(filtroVariante(null, { ...base, fuenteFps: 59.94 }), /,fps=30$/);
  assert.match(filtroVariante(null, { ...base }), /,fps=30$/);
});
