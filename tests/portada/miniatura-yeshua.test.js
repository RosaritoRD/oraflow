// 11/10/2026 (el autor): miniatura con el diseño de su referencia «Oración / PODEROSA / para hoy».
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const sharp = require('sharp');
const { titularValido, titularesPorReglas, titularesMiniatura } = require('../../utils/titular-miniatura');
const { componeMiniaturaYeshua, miniaturaSvg } = require('../../utils/miniatura-yeshua');

const silencio = { info() {}, warn() {} };

test('largo: 3-6 palabras en total; Short: 2-4 grandes y sin línea pequeña', () => {
  assert.deepEqual(titularValido({ arriba: 'oración', oro: 'poderosa', abajo: 'Para hoy' }),
    { arriba: 'Oración', oro: 'PODEROSA', abajo: 'para hoy' });
  assert.equal(titularValido({ arriba: 'Oración', oro: 'PODEROSA' }), null, 'el largo necesita la línea pequeña');
  assert.equal(titularValido({ arriba: 'Oración muy', oro: 'PODEROSA DE FE', abajo: 'para hoy y mañana' }), null, 'más de 6 palabras');
  assert.deepEqual(titularValido({ arriba: 'Duerme', oro: 'en paz', abajo: 'lo que sea' }, 'short'),
    { arriba: 'Duerme', oro: 'EN PAZ', abajo: '' });
  assert.equal(titularValido({ arriba: 'Recibe hoy', oro: 'PAZ DE DIOS', abajo: '' }, 'short'), null, 'más de 4 palabras');
});

test('tono: «milagro urgente» vale (lo pidió el autor); «milagro garantizado» y «no sabes orar» no', () => {
  assert.ok(titularValido({ arriba: 'Milagro', oro: 'URGENTE', abajo: 'oración de fe' }));
  assert.equal(titularValido({ arriba: 'Milagro', oro: 'GARANTIZADO', abajo: 'para hoy' }), null);
  assert.equal(titularValido({ arriba: 'Si no', oro: 'SABES ORAR', abajo: 'escucha esto' }), null);
});

test('reglas: la necesidad del título manda y siempre hay 3 variantes válidas', () => {
  const ansiedad = titularesPorReglas({ title: 'Oración para dejar la ansiedad por lo que viene' });
  assert.equal(ansiedad.length, 3);
  assert.equal(ansiedad[0].oro, 'TU ANSIEDAD');
  const noche = titularesPorReglas({ title: 'Oración de la noche para descansar' });
  assert.equal(`${noche[0].arriba} ${noche[0].oro}`, 'Antes de DORMIR');
  const manana = titularesPorReglas({ title: 'ORACIÓN DE LA MAÑANA · 12 DE OCTUBRE' });
  assert.deepEqual(manana[0], { arriba: 'Oración', oro: 'PODEROSA', abajo: 'para hoy' });
  for (const f of ['largo', 'short']) {
    for (const v of titularesPorReglas({ title: 'Oración por tu familia', formato: f })) assert.ok(titularValido(v, f), JSON.stringify(v));
  }
});

test('IA: lo inválido o repetido se cambia por el catálogo; si falla, reglas', async () => {
  const ia = (json) => ({ generateText: async () => JSON.stringify(json) });
  const r = await titularesMiniatura({
    title: 'Oración de la noche para dormir en paz', logger: silencio,
    aiTextService: ia({
      beneficio: { arriba: 'Duerme', oro: 'EN SU PAZ', abajo: 'esta noche' },
      invitacion: { arriba: 'Duerme', oro: 'EN SU PAZ', abajo: 'esta noche' },
      oracion: { arriba: 'Te sanará', oro: 'HOY MISMO', abajo: 'garantizado' }
    })
  });
  assert.equal(r.origen, 'mixto');
  assert.equal(r.titulares[0].oro, 'EN SU PAZ');
  assert.notEqual(r.titulares[1].oro, 'EN SU PAZ');
  assert.ok(!/sanar/i.test(JSON.stringify(r.titulares)));
  const roto = await titularesMiniatura({ title: 'x', logger: silencio, aiTextService: { generateText: async () => 'no es json' } });
  assert.equal(roto.origen, 'reglas');
});

test('SVG: escapa el texto, quita la coma final y pinta sello y filetes', async () => {
  const svg = await miniaturaSvg({ sharp, titular: { arriba: 'Yeshua,', oro: 'DAME <TU> PAZ', abajo: 'oración & fe' }, layout: 'izquierda', W: 1920, H: 1080 });
  assert.ok(svg.includes('DAME &lt;TU&gt; PAZ'));
  assert.ok(svg.includes('oración &amp; fe'));
  assert.ok(/>Yeshua</.test(svg), 'sin la coma');
  assert.ok(svg.includes('YESHUA') && svg.includes('ORACIONES EN PRESENCIA DE'));
  assert.equal((svg.match(/fill="url\(#filete[ID]\)"/g) || []).length, 4, 'filetes del titular y del sello');
  const corto = await miniaturaSvg({ sharp, titular: { arriba: 'Duerme', oro: 'EN PAZ', abajo: '' }, layout: 'vertical', W: 1080, H: 1920 });
  assert.equal((corto.match(/fill="url\(#filete[ID]\)"/g) || []).length, 2, 'sin línea pequeña: solo los del sello');
});

test('compone a 3840x2160 y cabe en los 2 MB de la API de YouTube', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'miniatura-'));
  const fondo = path.join(dir, 'f.png');
  // Ruido: el peor caso para el tamaño del JPG.
  const ruido = Buffer.alloc(1536 * 1024 * 3);
  for (let i = 0; i < ruido.length; i++) ruido[i] = (i * 2654435761) >>> 24;
  await sharp(ruido, { raw: { width: 1536, height: 1024, channels: 3 } }).png().toFile(fondo);
  const r = await componeMiniaturaYeshua({ sharp, fondo, titular: { arriba: 'Oración', oro: 'PODEROSA', abajo: 'para hoy' }, salida: path.join(dir, 'm.jpg') });
  assert.ok(r.bytes <= 2 * 1024 * 1024, `${r.bytes} bytes`);
  const meta = await sharp(r.salida).metadata();
  assert.equal(meta.width / meta.height, 16 / 9);
  const corto = await componeMiniaturaYeshua({ sharp, fondo, formato: 'short', titular: { arriba: 'Duerme', oro: 'EN PAZ', abajo: '' }, salida: path.join(dir, 's.jpg') });
  const ms = await sharp(corto.salida).metadata();
  assert.deepEqual([ms.width, ms.height], [2160, 3840]);
});
