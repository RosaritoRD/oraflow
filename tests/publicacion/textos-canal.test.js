// 05/10/2026: the channel's texts, editable from the panel.
const test = require('node:test');
const assert = require('node:assert/strict');
const t = require('../../utils/textos-canal');
const comentario = require('../../utils/comentario-ig');
const amen = require('../../utils/amen-automatico');
const privado = require('../../utils/mensaje-amen');
const { lineaLibro } = require('../../utils/libro');

const dbFalsa = () => { const s = {}; return { s, getSetting: async k => s[k] ?? null, setSetting: async (k, v) => { s[k] = v; } }; };

test('what\'s edited in the panel rules; null goes back to the factory text; modules use it right away', async () => {
  const db = dbFalsa();
  assert.equal(comentario.TEXTOS.reel, t.DEFECTO.comentario_reel.valor);
  assert.deepEqual(await t.guarda(db, { comentario_reel: 'Nuevo 👑', cupon: 'OTRO10', amen_respuestas: 'Amén{n} A\n\nAmén{n} B\n', libro_linea: '' }), { ok: true });
  assert.equal(comentario.textoPara({ media_type: 'VIDEO' }), 'Nuevo 👑');
  assert.match(privado.textoMensaje({ id: 'x' }, 0), /OTRO10/);
  assert.deepEqual(amen.RESPUESTAS, ['Amén{n} A', 'Amén{n} B']);
  assert.equal(lineaLibro({}), '');
  assert.equal(JSON.parse(db.s['texto:amen_respuestas']).length, 2);
  await t.guarda(db, { comentario_reel: null, cupon: null, amen_respuestas: null, libro_linea: null });
  assert.equal(comentario.TEXTOS.reel, t.DEFECTO.comentario_reel.valor);
  assert.match(t.catalogo().find(x => x.clave === 'cupon').valor, /YOUR_COUPON/);
  assert.match((await t.guarda(db, { nada: 'x' })).error, /desconocido/);
});

test('carga reads what\'s saved at startup', async () => {
  const db = dbFalsa();
  db.s['texto:privado_cierre'] = 'Bendiciones 👑';
  await t.carga(db);
  assert.equal(t.texto('privado_cierre'), 'Bendiciones 👑');
  await t.guarda(db, { privado_cierre: null });
});
