// 05/10/2026: oración de la mañana con fecha + frase para compartir, y la regla de fe
// (Jesús de Nazaret como Rey de reyes, y «Amén» al final de toda oración).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const p = require('../../utils/piezas-diarias');
const reglas = require('../../utils/reglas-oracion');
const corta = require('../../utils/oracion-corta');

const BIBLIA = { Salmos: { 23: { 1: 'Jehová es mi pastor; nada me faltará.' } } };

test('regla de fe: añade a Jesús Rey si falta y siempre termina en Amén', () => {
  assert.equal(reglas.conAmen('Señor, cuida a mi familia. Amén.'),
    'Señor, cuida a mi familia. En el nombre de Jesús de Nazaret, Rey de reyes. Amén.');
  assert.equal(reglas.conAmen('Te alabo, Jesús, mi Rey, por este día'), 'Te alabo, Jesús, mi Rey, por este día. Amén.');
  assert.match(reglas.cierreDeGuion('Que su paz te acompañe', 'sin nombrarlo'), /Jesús de Nazaret, Rey de reyes\. Amén\.$/);
  assert.equal(reglas.cierreDeGuion('Que su paz te acompañe', 'Jesús, Rey de reyes'), 'Que su paz te acompañe. Amén.');
  assert.equal(reglas.cierreDeGuion('Gloria al Rey. Amén.', 'Jesús, Rey'), 'Gloria al Rey. Amén.');
});

test('oración del día (Reel): siempre nombra a Jesús como Rey', () => {
  const v = corta.validaOracion({ saludo: 'Señor.', texto: 'Gracias por este nuevo día y por cada persona que pusiste en mi camino. Pongo en tus manos mis preocupaciones, mi familia y mis pasos, porque sé que me sostienes. Amén.' });
  assert.ok(reglas.nombraAJesusRey(v.texto));
  assert.doesNotMatch(v.texto, /Amén/); // el Amén lo pinta el diseño
});

test('fecha larga en español, en la zona del canal', () => {
  assert.equal(p.fechaLarga(new Date('2026-10-05T12:00:00Z'), 'America/New_York'), 'Lunes 5 de Octubre');
  assert.equal(p.fechaLarga(new Date('2026-10-05T02:00:00Z'), 'America/New_York'), 'Domingo 4 de Octubre');
});

test('pieza con fecha: gancho en negrita, Jesús Rey, Amén y texto de la publicación', () => {
  const v = p.validaFecha({
    gancho: 'Amado Dios, en este nuevo día pongo en tus manos mi vida.',
    texto: 'Te pido que tu paz llene mi casa, que cuides a mi familia y que guíes cada paso que dé en el trabajo y en el camino de hoy. Amén.',
    pie: 'Que tengas un día bendecido.'
  });
  assert.ok(reglas.nombraAJesusRey(`${v.gancho} ${v.texto}`));
  assert.doesNotMatch(v.texto, /Amén/);
  const d = { fecha: 'Lunes 5 de Octubre', ...v };
  const html = p.htmlFecha(d);
  assert.match(html, /Lunes 5 de Octubre/);
  assert.match(html, /<strong>Amado Dios, en este nuevo día/);
  assert.match(html, /Amén\./);
  const t = p.textoFecha(d);
  assert.match(t, /^Feliz y bendecido lunes 5 de octubre/);
  assert.match(t, /Rey de reyes\. Amén\./);
  assert.ok((t.match(/#\S+/g) || []).length <= 5);
  assert.throws(() => p.validaFecha({ gancho: 'Señor.', texto: 'corta' }), /palabras/);
});

test('frase para compartir: versículo real de la RV1909, nunca inventado ni en boca de Dios', () => {
  const v = p.validaFrase({ frase: 'Aunque no veas el camino, Jesús de Nazaret, el Rey de reyes, va delante de ti y nada te faltará.', cita: 'Salmo 23:1' }, BIBLIA);
  assert.equal(v.versiculo.texto, 'Jehová es mi pastor; nada me faltará.');
  assert.equal(v.versiculo.cita, 'Salmos 23:1');
  assert.match(p.htmlFrase(v), /Inspirada en Salmos 23:1 · RV1909/);
  assert.match(p.textoFrase(v), /Inspirada en Salmos 23:1 \(Reina-Valera 1909\)/);
  assert.throws(() => p.validaFrase({ frase: 'Jesús dijo muévete como si todo te fuera a salir bien porque así será siempre en tu vida.', cita: 'Salmos 23:1' }, BIBLIA), /boca de Dios/);
  assert.throws(() => p.validaFrase({ frase: 'Jesús, el Rey de reyes, camina contigo hoy y cada día de tu vida entera.', cita: 'Mateo 99:1' }, BIBLIA), /no verificable/);
  const sinRey = p.validaFrase({ frase: 'Hoy puedes descansar, porque tu vida está en buenas manos y nada te faltará en el camino.', cita: 'Salmos 23:1' }, BIBLIA);
  assert.ok(reglas.nombraAJesusRey(sinRey.frase));
});

function dbFalsa(inicial = {}) {
  const s = { ...inicial };
  return { s, getSetting: async k => s[k] ?? null, setSetting: async (k, v) => { s[k] = v; } };
}

test('publicaPieza: a su hora, una vez al día, Instagram + Facebook por separado', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'piezas-'));
  const db = dbFalsa({ channel_timezone: 'America/New_York' });
  const llamadas = [];
  const deps = {
    enlace: { dir: dataDir, base: 'https://x.test' },
    tokenInstagram: async () => 'tok',
    preparaPieza: async () => ({ html: '<html></html>', texto: 'texto' }),
    renderizaJpg: async (_h, salida) => salida,
    publicaCopia: async () => ({ nombre: 'a.jpg', url: 'https://x.test/a.jpg' }),
    borraCopia: async () => true,
    preparaImagenIG: async ({ imageUrl }) => { llamadas.push(`ig:${imageUrl}`); return { containerId: 'c', igUserId: 'u' }; },
    estadoIG: async () => ({ status: 'FINISHED' }),
    publicaIG: async () => ({ mediaId: 'm', permalink: 'https://instagram.com/p/m' }),
    publicaFoto: async () => { llamadas.push('fb'); return { postId: '1_2' }; },
    espera: async () => {}
  };
  const env = { FACEBOOK_PAGE_ID: '1', FACEBOOK_PAGE_TOKEN: 't' };
  assert.equal(await p.publicaPieza('fecha', { db, ai: {}, env, now: new Date('2026-10-05T10:30:00Z'), dataDir, deps }), null); // 06:30 NY
  const r = await p.publicaPieza('fecha', { db, ai: {}, env, now: new Date('2026-10-05T11:10:00Z'), dataDir, deps });
  assert.equal(r.redes.instagram.status, 'published');
  assert.ok(llamadas.includes('ig:https://x.test/a.jpg'));
  assert.equal(await p.publicaPieza('fecha', { db, ai: {}, env, now: new Date('2026-10-05T13:00:00Z'), dataDir, deps }), null);
  await db.setSetting('frase_compartir_enabled', 'false');
  assert.equal(await p.publicaPieza('frase', { db, ai: {}, env, now: new Date('2026-10-06T01:00:00Z'), dataDir, deps }), null);
});

test('frase: si la IA manda dos citas separadas por «;» se usa la primera que exista (07/10/2026)', () => {
  const frase = 'Jesús de Nazaret, el Rey de reyes, te llama por tu nombre y camina contigo hoy.';
  const v = p.validaFrase({ frase, cita: 'Mateo 99:1; Salmos 23:1' }, BIBLIA);
  assert.equal(v.versiculo.cita, 'Salmos 23:1');
  assert.equal(p.validaFrase({ frase, cita: 'Salmos 23:1; Apocalipsis 19:16' }, BIBLIA).versiculo.cita, 'Salmos 23:1');
  assert.throws(() => p.validaFrase({ frase, cita: 'Mateo 99:1; Juan 99:3' }, BIBLIA), /no verificable/);
});
