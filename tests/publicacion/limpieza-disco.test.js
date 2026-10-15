const test = require('node:test');
const assert = require('node:assert/strict');
const { planLimpieza, produccionDe } = require('../../utils/limpieza-disco');

// 30/09: el disco llegó al 97%. Reglas acordadas con el autor:
//  · restos del montaje: fuera en cuanto el vídeo está montado
//  · vídeo final + audio: fuera 3 días después de publicarse en YouTube
//  · biblioteca de clips: tope de 8 GB, se van primero los sin ficha y los menos usados

const DIA = 86400000;
const ahora = Date.parse('2026-09-30T12:00:00Z');
const GB = 1024 ** 3;

test('saca el id de producción del nombre del archivo', () => {
  assert.equal(produccionDe('prod_1789969053907_8ehhkra4e9_uxr5fxllekr_final.mp4'), 'prod_1789969053907_8ehhkra4e9_uxr5fxllekr');
  assert.equal(produccionDe('prod_1790230542651_m0d68ealwp8_iaaci0dkerm_final.mp4.assembly.json'), 'prod_1790230542651_m0d68ealwp8_iaaci0dkerm');
  assert.equal(produccionDe('prod_1_a_b_narration.mp3'), 'prod_1_a_b');
  assert.equal(produccionDe('musica.mp3'), null);
});

test('vídeo final y audio: solo 3 días después de publicarse', () => {
  const producciones = new Map([
    ['prod_1_a_b', { publicadoMs: ahora - 4 * DIA }],   // publicado hace 4 días → fuera
    ['prod_2_a_b', { publicadoMs: ahora - 1 * DIA }],   // hace 1 día → se queda
    ['prod_3_a_b', { pendiente: true }]                 // aún por subir → se queda
  ]);
  const finales = [
    { ruta: '/v/prod_1_a_b_final.mp4', size: 10, mtimeMs: ahora - 5 * DIA },
    { ruta: '/a/prod_1_a_b_narration.mp3', size: 1, mtimeMs: ahora - 5 * DIA },
    { ruta: '/v/prod_2_a_b_final.mp4', size: 10, mtimeMs: ahora - 2 * DIA },
    { ruta: '/v/prod_3_a_b_final.mp4', size: 10, mtimeMs: ahora - 20 * DIA },
    { ruta: '/v/musica.mp4', size: 10, mtimeMs: ahora - 90 * DIA }        // no es de ninguna producción → no se toca
  ];
  const { borrar } = planLimpieza({ ahora, producciones, finales });
  assert.deepEqual(borrar.sort(), ['/a/prod_1_a_b_narration.mp3', '/v/prod_1_a_b_final.mp4']);
});

test('una producción que nunca se programó (fallida o descartada) se va a los 7 días', () => {
  const { borrar } = planLimpieza({ ahora, producciones: new Map(), finales: [
    { ruta: '/v/prod_9_a_b_final.mp4', size: 1, mtimeMs: ahora - 8 * DIA },
    { ruta: '/v/prod_8_a_b_final.mp4', size: 1, mtimeMs: ahora - 2 * DIA }
  ] });
  assert.deepEqual(borrar, ['/v/prod_9_a_b_final.mp4']);
});

test('restos del montaje: fuera las carpetas de producción viejas, nunca la caché de planos', () => {
  const { borrar } = planLimpieza({ ahora, temporales: [
    { ruta: '/t/timeline/prod_1_a_b', mtimeMs: ahora - 7 * 3600000 },
    { ruta: '/t/timeline/prod_2_a_b', mtimeMs: ahora - 1 * 3600000 },   // puede estar montándose
    { ruta: '/t/timeline/shot-cache', mtimeMs: ahora - 30 * DIA }
  ] });
  assert.deepEqual(borrar, ['/t/timeline/prod_1_a_b']);
});

test('biblioteca por encima del tope: primero sin ficha, luego los menos usados; nunca lo de hoy', () => {
  const stock = [
    { ruta: '/s/nuevo.mp4', size: 3 * GB, usadoMs: ahora - 1 * 3600000, conFicha: true, fichaRuta: '/s/nuevo.mp4.json' },
    { ruta: '/s/viejo.mp4', size: 3 * GB, usadoMs: ahora - 9 * DIA, conFicha: true, fichaRuta: '/s/viejo.mp4.json' },
    { ruta: '/s/medio.mp4', size: 3 * GB, usadoMs: ahora - 3 * DIA, conFicha: true, fichaRuta: '/s/medio.mp4.json' },
    { ruta: '/s/sinficha.mp4', size: 2 * GB, usadoMs: ahora - 2 * DIA, conFicha: false }
  ];                                                                      // 11 GB con tope 8 → sobran 3
  const { borrar, bytes } = planLimpieza({ ahora, stock, topeStock: 8 * GB });
  assert.deepEqual(borrar, ['/s/sinficha.mp4', '/s/viejo.mp4', '/s/viejo.mp4.json']);
  assert.equal(bytes, 5 * GB);
});

test('por debajo del tope la biblioteca no se toca', () => {
  const { borrar } = planLimpieza({ ahora, topeStock: 8 * GB, stock: [
    { ruta: '/s/a.mp4', size: 1 * GB, usadoMs: ahora - 60 * DIA, conFicha: false }
  ] });
  assert.deepEqual(borrar, []);
});
