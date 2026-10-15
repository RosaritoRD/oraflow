// 05/10/2026: perfil y preferencias por usuario del panel.
const test = require('node:test');
const assert = require('node:assert/strict');
const p = require('../../utils/preferencias');

const req = correo => ({ headers: correo ? { 'x-forwarded-email': correo } : {} });
const dbFalsa = () => { const s = {}; return { s, getSetting: async k => s[k] ?? null, setSetting: async (k, v) => { s[k] = v; } }; };

test('perfil: nombre e iniciales desde el correo; local sin cabecera', async () => {
  const db = dbFalsa();
  const yo = await p.perfil(db, req('tu-correo@example.com'));
  assert.equal(yo.nombre, 'el autor');
  assert.equal(yo.iniciales, 'ER');
  assert.deepEqual(yo.prefs, p.DEFECTO);
  assert.equal((await p.perfil(db, req(null))).correo, 'local');
});

test('preferencias: cada usuario las suyas y se valida lo que llega', async () => {
  const db = dbFalsa();
  assert.deepEqual((await p.guardaPrefs(db, req('a@x.com'), { tema: 'claro', inicio: 'redes' })).prefs.tema, 'claro');
  assert.equal((await p.perfil(db, req('b@x.com'))).prefs.tema, 'oscuro');
  assert.match((await p.guardaPrefs(db, req('a@x.com'), { tema: 'rosa' })).error, /Tema/);
  assert.match((await p.guardaPrefs(db, req('a@x.com'), { inicio: 'hack' })).error, /inicio/);
});
