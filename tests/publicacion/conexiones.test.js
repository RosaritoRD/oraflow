// 05/10/2026: estado de las conexiones del canal en el panel.
const test = require('node:test');
const assert = require('node:assert/strict');
const c = require('../../utils/conexiones');

const respuesta = d => ({ ok: true, json: async () => d });

test('Instagram: comentarios contados pero lista vacía = app de Meta en modo desarrollo', async () => {
  const fetchImpl = async url => {
    if (url.includes('/me?')) return respuesta({ username: 'tu_cuenta' });
    if (url.includes('/me/media')) return respuesta({ data: [{ id: 'm1', comments_count: 2 }] });
    return respuesta({ data: [] });
  };
  const r = await c.instagram({ token: 't', fetchImpl });
  assert.equal(r.ok, false);
  assert.match(r.detalle, /modo desarrollo/);
});

test('Facebook: dice qué permisos faltan', async () => {
  const fetchImpl = async () => respuesta({ data: { is_valid: true, scopes: ['pages_manage_posts', 'pages_read_engagement'] } });
  const r = await c.facebook({ config: { version: 'v25.0', token: 't' }, fetchImpl });
  assert.equal(r.ok, false);
  assert.match(r.detalle, /leer comentarios, responder comentarios/);
});

test('IA: avisa si queda poco saldo en la clave', async () => {
  const r = await c.ia({ env: { OPENROUTER_API_KEY: 'k' }, fetchImpl: async () => respuesta({ data: { limit: 2, limit_remaining: 0.1 } }) });
  assert.equal(r.ok, false);
  assert.match(r.detalle, /\$0\.10/);
});

test('Instagram: comprueba la lectura de privados y separa los comentarios de otras personas (07/10/2026)', async () => {
  const base = (conversaciones, comentarios) => async url => {
    if (url.includes('/me?')) return respuesta({ username: 'tu_cuenta' });
    if (url.includes('/me/media')) return respuesta({ data: [{ id: 'm1', comments_count: 1 }] });
    if (url.includes('/me/conversations')) return conversaciones;
    return respuesta({ data: comentarios });
  };
  const propios = [{ id: 'c1', username: 'tu_cuenta' }];
  const ok = await c.instagram({ token: 't', fetchImpl: base(respuesta({ data: [] }), propios) });
  assert.match(ok.detalle, /mensajes privados: lectura verificada/i);
  assert.match(ok.detalle, /ningún comentario de otras personas/i);

  const sinPermiso = await c.instagram({ token: 't', fetchImpl: base({ ok: false, status: 400, json: async () => ({ error: { message: '(#3) Application does not have the capability' } }) }, [{ id: 'c2', username: 'ana' }]) });
  assert.equal(sinPermiso.estado, 'partial');
  assert.match(sinPermiso.detalle, /no se pueden leer los mensajes privados/i);
  assert.match(sinPermiso.detalle, /1 comentario de otras personas/i);
});

test('YouTube: canal accesible, cuota agotada o autorización caducada (07/10/2026)', async () => {
  const db = (s = {}) => ({ getSetting: async k => s[k] ?? null });
  const yt = lista => ({ channels: { list: async () => lista() } });
  assert.equal((await c.youtube({ youtube: null, db: db() })).estado, 'not_configured');
  const ok = await c.youtube({ youtube: yt(async () => ({ data: { items: [{ snippet: { title: 'Oraciones en Presencia de Yeshua' } }] } })), db: db() });
  assert.equal(ok.estado, 'verified');
  assert.match(ok.titulo, /Oraciones en Presencia de Yeshua/);
  const cuota = await c.youtube({ youtube: yt(async () => assert.fail('no gastar cuota')), db: db({ youtube_cuota_hasta: '2099-01-01T08:05:00Z' }) });
  assert.equal(cuota.estado, 'partial');
  assert.match(cuota.detalle, /cuota/i);
  const caducada = await c.youtube({ youtube: yt(async () => { throw new Error('invalid_grant'); }), db: db() });
  assert.equal(caducada.estado, 'unavailable');
  assert.match(caducada.detalle, /volver a autorizar/i);
});

test('Instagram: avisa si la renovación semanal del acceso dejó de funcionar (07/10/2026)', async () => {
  const fetchImpl = async url => {
    if (url.includes('/me?')) return respuesta({ username: 'tu_cuenta' });
    if (url.includes('/me/media')) return respuesta({ data: [] });
    return respuesta({ data: [] });
  };
  const now = new Date('2026-10-30T12:00:00Z');
  const reciente = await c.instagram({ token: 't', fetchImpl, renovadoEl: '2026-10-28T12:00:00Z', now });
  assert.doesNotMatch(reciente.detalle, /caduca/);
  const viejo = await c.instagram({ token: 't', fetchImpl, renovadoEl: '2026-10-01T12:00:00Z', now });
  assert.equal(viejo.estado, 'partial');
  assert.match(viejo.detalle, /no se renueva desde hace 29 días.*caduca/i);
});
