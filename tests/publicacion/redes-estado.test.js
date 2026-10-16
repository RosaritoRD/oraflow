// 05/10/2026: the panel's «Social» area.
const test = require('node:test');
const assert = require('node:assert/strict');
const r = require('../../utils/redes-estado');

const dbFalsa = (s = {}) => ({ s, getSetting: async k => s[k] ?? null, setSetting: async (k, v) => { s[k] = v; } });

test('estadoRedes: on by default, carousel off by default, times and last result', async () => {
  const db = dbFalsa({ oracion_fecha_last: JSON.stringify({ fecha: '2026-10-05', status: 'published', redes: { instagram: { status: 'published', url: 'u' } } }) });
  const lista = await r.estadoRedes(db);
  const por = id => lista.find(p => p.id === id);
  assert.equal(por('oracion_fecha').encendida, true);
  assert.equal(por('oracion_fecha').hora, '07:00');
  assert.equal(por('oracion_fecha').ultimo.redes.instagram.status, 'published');
  assert.equal(por('carrusel').encendida, false);
  assert.equal(por('amen').hoy, 0);
});

test('cambiaPieza: valid time, turning off, and rejects what doesn\'t exist', async () => {
  const db = dbFalsa();
  assert.deepEqual(await r.cambiaPieza(db, 'frase_compartir', { hora: '21:30', encendida: false }), { ok: true });
  assert.equal(db.s.frase_compartir_time, '21:30');
  assert.equal(db.s.frase_compartir_enabled, 'false');
  assert.match((await r.cambiaPieza(db, 'frase_compartir', { hora: '25:00' })).error, /Hora/);
  assert.match((await r.cambiaPieza(db, 'amen', { hora: '10:00' })).error, /no tiene hora/);
  assert.match((await r.cambiaPieza(db, 'nada', {})).error, /desconocida/);
});

test('Instagram private message: visible and toggled from the panel, with sends, error and deletion requests (07/10/2026)', async () => {
  const db = dbFalsa({
    dm_amen_enabled: 'true',
    dm_amen_estado: JSON.stringify({ hoy: 3, total: 10, ultimoEnvio: '2026-10-07T10:00:00Z', ultimoError: { mensaje: '(#10) sin permiso', at: '2026-10-07T11:00:00Z' } }),
    dm_amen_dia: JSON.stringify({ fecha: new Date().toISOString().slice(0, 10), cuenta: 3 }),
    borrado_solicitudes: JSON.stringify([{ usuario: 'ana', at: '2026-10-07T10:00:00Z', confirmado: true }]),
    borrado_estado: JSON.stringify({ at: '2026-10-07T10:00:00Z', error: null }),
    amen_pausas: JSON.stringify({ facebook: { hasta: '2026-10-07T16:00:00Z', error: '(#10) pages_read_engagement' } })
  });
  const lista = await r.estadoRedes(db);
  const p = lista.find(x => x.id === 'privado');
  assert.equal(p.encendida, true);
  assert.equal(p.hoy, 3);
  assert.equal(p.total, 10);
  assert.match(p.ultimoError.mensaje, /permiso/);
  assert.equal(p.borrados[0].usuario, 'ana');
  assert.equal(p.borradoError, null);
  assert.equal(lista.find(x => x.id === 'amen').pausas.facebook.hasta, '2026-10-07T16:00:00Z');
  assert.equal(lista.find(x => x.id === 'amen').instagramPorPrivado, true);

  assert.deepEqual(await r.cambiaPieza(db, 'privado', { encendida: false }), { ok: true });
  assert.equal(db.s.dm_amen_enabled, 'false');
  // off by default, as until now
  assert.equal((await r.estadoRedes(dbFalsa())).find(x => x.id === 'privado').encendida, false);
});
