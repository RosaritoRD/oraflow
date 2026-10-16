const test = require('node:test');
const assert = require('node:assert/strict');
const { planLimpieza, produccionDe } = require('../../utils/limpieza-disco');

// 30/09: the disk reached 97%. Rules agreed with the owner:
//  · editing leftovers: removed as soon as the video is edited
//  · final video + audio: removed 3 days after it's published on YouTube
//  · clip library: 8 GB cap, the ones without a record and the least used go first

const DIA = 86400000;
const ahora = Date.parse('2026-09-30T12:00:00Z');
const GB = 1024 ** 3;

test('takes the production id from the file name', () => {
  assert.equal(produccionDe('prod_1789969053907_8ehhkra4e9_uxr5fxllekr_final.mp4'), 'prod_1789969053907_8ehhkra4e9_uxr5fxllekr');
  assert.equal(produccionDe('prod_1790230542651_m0d68ealwp8_iaaci0dkerm_final.mp4.assembly.json'), 'prod_1790230542651_m0d68ealwp8_iaaci0dkerm');
  assert.equal(produccionDe('prod_1_a_b_narration.mp3'), 'prod_1_a_b');
  assert.equal(produccionDe('musica.mp3'), null);
});

test('final video and audio: only 3 days after publishing', () => {
  const producciones = new Map([
    ['prod_1_a_b', { publicadoMs: ahora - 4 * DIA }],   // published 4 days ago → removed
    ['prod_2_a_b', { publicadoMs: ahora - 1 * DIA }],   // 1 day ago → stays
    ['prod_3_a_b', { pendiente: true }]                 // still to be uploaded → stays
  ]);
  const finales = [
    { ruta: '/v/prod_1_a_b_final.mp4', size: 10, mtimeMs: ahora - 5 * DIA },
    { ruta: '/a/prod_1_a_b_narration.mp3', size: 1, mtimeMs: ahora - 5 * DIA },
    { ruta: '/v/prod_2_a_b_final.mp4', size: 10, mtimeMs: ahora - 2 * DIA },
    { ruta: '/v/prod_3_a_b_final.mp4', size: 10, mtimeMs: ahora - 20 * DIA },
    { ruta: '/v/musica.mp4', size: 10, mtimeMs: ahora - 90 * DIA }        // belongs to no production → untouched
  ];
  const { borrar } = planLimpieza({ ahora, producciones, finales });
  assert.deepEqual(borrar.sort(), ['/a/prod_1_a_b_narration.mp3', '/v/prod_1_a_b_final.mp4']);
});

test('a production that was never scheduled (failed or discarded) goes after 7 days', () => {
  const { borrar } = planLimpieza({ ahora, producciones: new Map(), finales: [
    { ruta: '/v/prod_9_a_b_final.mp4', size: 1, mtimeMs: ahora - 8 * DIA },
    { ruta: '/v/prod_8_a_b_final.mp4', size: 1, mtimeMs: ahora - 2 * DIA }
  ] });
  assert.deepEqual(borrar, ['/v/prod_9_a_b_final.mp4']);
});

test('editing leftovers: old production folders removed, never the shot cache', () => {
  const { borrar } = planLimpieza({ ahora, temporales: [
    { ruta: '/t/timeline/prod_1_a_b', mtimeMs: ahora - 7 * 3600000 },
    { ruta: '/t/timeline/prod_2_a_b', mtimeMs: ahora - 1 * 3600000 },   // it may be being edited
    { ruta: '/t/timeline/shot-cache', mtimeMs: ahora - 30 * DIA }
  ] });
  assert.deepEqual(borrar, ['/t/timeline/prod_1_a_b']);
});

test('library over the cap: records-less first, then the least used; never today\'s', () => {
  const stock = [
    { ruta: '/s/nuevo.mp4', size: 3 * GB, usadoMs: ahora - 1 * 3600000, conFicha: true, fichaRuta: '/s/nuevo.mp4.json' },
    { ruta: '/s/viejo.mp4', size: 3 * GB, usadoMs: ahora - 9 * DIA, conFicha: true, fichaRuta: '/s/viejo.mp4.json' },
    { ruta: '/s/medio.mp4', size: 3 * GB, usadoMs: ahora - 3 * DIA, conFicha: true, fichaRuta: '/s/medio.mp4.json' },
    { ruta: '/s/sinficha.mp4', size: 2 * GB, usadoMs: ahora - 2 * DIA, conFicha: false }
  ];                                                                      // 11 GB with an 8 cap → 3 too many
  const { borrar, bytes } = planLimpieza({ ahora, stock, topeStock: 8 * GB });
  assert.deepEqual(borrar, ['/s/sinficha.mp4', '/s/viejo.mp4', '/s/viejo.mp4.json']);
  assert.equal(bytes, 5 * GB);
});

test('below the cap the library isn\'t touched', () => {
  const { borrar } = planLimpieza({ ahora, topeStock: 8 * GB, stock: [
    { ruta: '/s/a.mp4', size: 1 * GB, usadoMs: ahora - 60 * DIA, conFicha: false }
  ] });
  assert.deepEqual(borrar, []);
});
