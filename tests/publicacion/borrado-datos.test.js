// 07/10/2026: the privacy policy (data-deletion page) promises that a private
// message with «BORRAR» or «DELETE» deletes that person's data.
const test = require('node:test');
const assert = require('node:assert/strict');
const b = require('../../utils/borrado-datos');

function dbFalsa(inicial = {}) {
  const s = { ...inicial };
  return { s, getSetting: async k => s[k] ?? null, setSetting: async (k, v) => { s[k] = v; } };
}

test('esPeticionDeBorrado: only the clear request, in Spanish or English', () => {
  for (const t of ['BORRAR', 'borrar', ' Borrar mis datos ', 'DELETE', 'delete my data', 'Eliminar mis datos.', 'BORRAR!']) assert.ok(b.esPeticionDeBorrado(t), t);
  for (const t of ['Amén', 'no quiero borrar nada, gracias', 'como borrar un comentario?', '', null]) assert.ok(!b.esPeticionDeBorrado(t), String(t));
});

test('procesaBorrados: removes the person, adds them to do-not-contact, confirms once and leaves it for the panel', async () => {
  const db = dbFalsa({
    dm_amen_usuarios: JSON.stringify(['ana', 'luis']),
    dm_no_contactar: JSON.stringify([])
  });
  const enviados = [];
  const fetchImpl = async (url, o = {}) => {
    const u = new URL(url);
    if (o.method === 'POST') { enviados.push(JSON.parse(o.body)); return { ok: true, json: async () => ({ message_id: 'r' }) }; }
    if (u.pathname.endsWith('/me')) return { ok: true, json: async () => ({ username: 'your_account' }) };
    return {
      ok: true,
      json: async () => ({
        data: [{
          messages: { data: [
            { id: 'm1', message: 'BORRAR', from: { username: 'ana', id: '111' }, created_time: '2026-10-07T10:00:00+0000' },
            { id: 'm0', message: 'Amén, gracias', from: { username: 'ana', id: '111' }, created_time: '2026-10-07T09:00:00+0000' },
            { id: 'm2', message: 'BORRAR', from: { username: 'your_account', id: '999' }, created_time: '2026-10-07T10:01:00+0000' }
          ] }
        }]
      })
    };
  };
  const now = new Date('2026-10-07T10:05:00Z');
  const r = await b.procesaBorrados({ db, token: 't', fetchImpl, now });
  assert.equal(r.nuevas, 1);
  assert.deepEqual(JSON.parse(db.s.dm_amen_usuarios), ['luis']);
  assert.deepEqual(JSON.parse(db.s.dm_no_contactar), ['ana']);
  assert.equal(enviados.length, 1);
  assert.equal(enviados[0].recipient.id, '111');
  assert.match(enviados[0].message.text, /borramos tus datos/);
  const lista = JSON.parse(db.s.borrado_solicitudes);
  assert.equal(lista[0].usuario, 'ana');
  assert.equal(lista[0].confirmado, true);

  // the second round doesn't repeat
  const r2 = await b.procesaBorrados({ db, token: 't', fetchImpl, now });
  assert.equal(r2.nuevas, 0);
  assert.equal(enviados.length, 1);
});

test('procesaBorrados: without messaging permission it leaves the error for the panel and doesn\'t break', async () => {
  const db = dbFalsa();
  const fetchImpl = async url => new URL(url).pathname.endsWith('/me')
    ? { ok: true, json: async () => ({ username: 'your_account' }) }
    : { ok: false, status: 400, json: async () => ({ error: { message: '(#3) Application does not have the capability to make this API call.' } }) };
  const r = await b.procesaBorrados({ db, token: 't', fetchImpl, now: new Date('2026-10-07T10:00:00Z') });
  assert.equal(r.nuevas, 0);
  assert.match(JSON.parse(db.s.borrado_estado).error, /capability/);
});
