// 05/10/2026: a private message to whoever comments Amén on Instagram (off by default).
const test = require('node:test');
const assert = require('node:assert/strict');
const m = require('../../utils/mensaje-amen');

test('text: first the prayer (Jesus as King + Amén), then the book with the coupon; no 🕊️', () => {
  const t = m.textoMensaje({ id: 'x' });
  assert.ok(t.indexOf('Amén.') < t.indexOf('YOUR_COUPON'));
  assert.match(t, /your-domain\.com\/libro/);
  assert.match(t, /10 %/);
  assert.doesNotMatch(t, /🕊/);
  assert.equal(m.ORACIONES.length, 40);
  assert.equal(new Set(m.ORACIONES).size, 40);
  for (const o of m.ORACIONES) { assert.match(o, /Jesús/); assert.match(o, /Rey/); assert.match(o, /Amén\.$/); assert.doesNotMatch(o, /🕊/); }
  assert.notEqual(m.textoMensaje({ id: 'a' }, 0), m.textoMensaje({ id: 'a' }, 1));
});

test('enviaMensajesAmen: off does nothing; on, any comment gets the prayer privately + a notice, once per person', async () => {
  const s = {};
  const db = { getSetting: async k => s[k] ?? null, setSetting: async (k, v) => { s[k] = v; } };
  const enviados = [];
  const publicas = [];
  const fetchImpl = async (url, o) => { enviados.push(JSON.parse(o.body).recipient.comment_id); return { ok: true, json: async () => ({ message_id: 'm' }) }; };
  const responde = async ({ id, texto }) => { publicas.push([id, texto]); };
  const now = new Date('2026-10-10T12:00:00Z');
  const comentarios = [
    { id: 'c1', texto: '¿Dónde compro el libro?', usuario: 'ana', fecha: '2026-10-10T10:00:00Z' },
    { id: 'c2', texto: 'Amén 🙏', usuario: 'ana', fecha: '2026-10-10T11:00:00Z' },
    { id: 'c3', texto: 'Hola', usuario: 'luis', fecha: '2026-09-20T11:00:00Z' }
  ];
  const esAmen = t => /^am[eé]n/i.test(t);
  const args = { db, token: 't', comentarios, esAmen, respuestaAmen: () => 'Amén 🙏 Jesús Rey', responde, now, fetchImpl };
  assert.equal(await m.enviaMensajesAmen(args), 0);
  s.dm_amen_enabled = 'true';
  assert.equal(await m.enviaMensajesAmen(args), 1);
  assert.deepEqual(enviados, ['c1']);                      // the question also gets the prayer
  assert.match(publicas[0][1], /mensaje privado|DM|mensajes/);
  assert.equal(publicas[1][0], 'c2');                       // their second comment (Amén) gets a normal reply
  assert.equal(publicas[1][1], 'Amén 🙏 Jesús Rey');
  for (const a of m.AVISOS) assert.doesNotMatch(a, /🕊/);
});

test('private message: leaves state for the panel (sends and last error) and respects the do-not-contact list (07/10/2026)', async () => {
  const s = { dm_amen_enabled: 'true', dm_no_contactar: JSON.stringify(['pedro']) };
  const db = { getSetting: async k => s[k] ?? null, setSetting: async (k, v) => { s[k] = v; } };
  const enviados = [];
  let falla = false;
  const fetchImpl = async (url, o) => {
    if (falla) return { ok: false, status: 400, json: async () => ({ error: { message: '(#10) Application does not have permission for this action' } }) };
    enviados.push(JSON.parse(o.body).recipient.comment_id); return { ok: true, json: async () => ({ message_id: 'm' }) };
  };
  const now = new Date('2026-10-10T12:00:00Z');
  const c = (id, usuario) => ({ id, texto: 'Amén', usuario, fecha: '2026-10-10T11:00:00Z' });
  await m.enviaMensajesAmen({ db, token: 't', comentarios: [c('p1', 'pedro'), c('a1', 'ana')], now, fetchImpl });
  assert.deepEqual(enviados, ['a1']); // pedro asked us not to write to them
  let e = JSON.parse(s.dm_amen_estado);
  assert.equal(e.ultimoEnvio, now.toISOString());
  assert.equal(e.hoy, 1);
  assert.equal(e.total, 1);
  assert.equal(e.ultimoError, null);

  falla = true;
  const despues = new Date('2026-10-10T13:00:00Z');
  await m.enviaMensajesAmen({ db, token: 't', comentarios: [c('l1', 'luis')], now: despues, fetchImpl });
  e = JSON.parse(s.dm_amen_estado);
  assert.match(e.ultimoError.mensaje, /permission/);
  assert.equal(e.ultimoError.at, despues.toISOString());
  assert.equal(e.ultimoEnvio, now.toISOString());
});

test('if Meta rejects the private message, «Amén» comments are still answered publicly (07/10/2026)', async () => {
  const s = { dm_amen_enabled: 'true' };
  const db = { getSetting: async k => s[k] ?? null, setSetting: async (k, v) => { s[k] = v; } };
  let intentosPrivado = 0;
  const fetchImpl = async () => { intentosPrivado += 1; return { ok: false, status: 400, json: async () => ({ error: { message: '(#10) Application does not have permission for this action' } }) }; };
  const publicas = [];
  const now = new Date('2026-10-10T12:00:00Z');
  const comentarios = [
    { id: 'a1', texto: 'Amén', usuario: 'ana', fecha: '2026-10-10T11:00:00Z' },
    { id: 'l1', texto: 'Amén por mi hija Sara', usuario: 'luis', fecha: '2026-10-10T11:00:00Z' },
    { id: 'p1', texto: 'Tengo una pregunta', usuario: 'pedro', fecha: '2026-10-10T11:00:00Z' }
  ];
  await m.enviaMensajesAmen({
    db, token: 't', comentarios, now, fetchImpl,
    esAmen: t => /^am[eé]n/i.test(t), respuestaAmen: c => `Amén 🙏 (${c.id})`, responde: async ({ id, texto }) => publicas.push([id, texto])
  });
  assert.equal(intentosPrivado, 1);                          // doesn't insist with the private message
  assert.deepEqual(publicas.map(p => p[0]), ['a1', 'l1']);    // the Amén ones do get replies; the question is left for the owner
  assert.match(publicas[0][1], /Amén/);
  assert.equal(s.dm_amen_usuarios, undefined);                // nobody is marked as "already got the prayer"
});

test('after a permissions rejection, the private message waits 1 h before trying again (07/10/2026)', async () => {
  const s = { dm_amen_enabled: 'true', dm_amen_estado: JSON.stringify({ ultimoError: { mensaje: '(#10) Application does not have permission', at: '2026-10-10T11:30:00Z' } }) };
  const db = { getSetting: async k => s[k] ?? null, setSetting: async (k, v) => { s[k] = v; } };
  let intentos = 0;
  const fetchImpl = async () => { intentos += 1; return { ok: true, json: async () => ({ message_id: 'm' }) }; };
  const c = [{ id: 'a1', texto: 'Hola', usuario: 'ana', fecha: '2026-10-10T11:00:00Z' }];
  await m.enviaMensajesAmen({ db, token: 't', comentarios: c, now: new Date('2026-10-10T12:00:00Z'), fetchImpl });
  assert.equal(intentos, 0);
  await m.enviaMensajesAmen({ db, token: 't', comentarios: c, now: new Date('2026-10-10T12:31:00Z'), fetchImpl });
  assert.equal(intentos, 1);
  assert.equal(JSON.parse(s.dm_amen_estado).ultimoError, null); // it went out: the error is behind us
});
