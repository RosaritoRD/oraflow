const test = require('node:test');
const assert = require('node:assert/strict');
const { SEOOptimizerAgent, cortaTitulo } = require('../../agents/seo-optimizer-agent');

// 30/09: los títulos por fecha y en mayúsculas ("ORACIÓN DE LA MAÑANA — MIÉRCOLES
// 30 DE SEPTIEMBRE | SALMO 5:3 … PARA TODO EL D") pasan a títulos por NECESIDAD,
// como los canales grandes: "Oración para los días de cargas | Oración de la noche 🙏".

test('el título nunca se corta a mitad de palabra', () => {
  const largo = 'ORACIÓN DE LA MAÑANA — MIÉRCOLES 30 DE SEPTIEMBRE | SALMO 5:3 RECIBE PAZ Y PROTECCIÓN PARA TODO EL DÍA';
  const t = cortaTitulo(largo, 100);
  assert.ok(t.length <= 100);
  assert.ok(largo.startsWith(t));
  assert.match(t, /PARA TODO EL$/);
  assert.equal(cortaTitulo('Corto 🙏', 100), 'Corto 🙏');
  assert.equal(cortaTitulo('Oración para dormir en paz |', 100), 'Oración para dormir en paz');   // sin separador colgando
});

async function promptDeLargo(extraEnv = {}) {
  const prev = { ...process.env };
  Object.assign(process.env, { CONTENT_LANGUAGE: 'es', CHANNEL_THEME: 'prayer', TITLE_DATE: 'on', ...extraEnv });
  let visto = '';
  const agente = new SEOOptimizerAgent({ saveSEOData: async () => {} }, {});
  agente.aiTextService = {
    isAvailable: () => true, providerName: 'fake',
    generateText: async (p) => { visto = p; return JSON.stringify({ title: 'Oración para los días de cargas | Oración de la noche 🙏', description: 'x', tags: ['a', 'b'], hashtags: ['#a'] }); }
  };
  const r = await agente.generateSEOWithAI({ title: 'Oración de la noche', scriptures: [{ reference: 'Mateo 11:28' }] },
    { topic: 'cargas', keywords: [], franja: 'NOCHE', contentFormat: 'long' });
  process.env = prev;
  return { visto, r };
}

test('la plantilla de los largos pide el formato de los canales grandes, sin fecha (03/10/2026)', async () => {
  const { visto } = await promptDeLargo();
  assert.match(visto, /ORACIÓN DE LA NOCHE \|/);                     // la cabecera con la franja del contenido
  assert.match(visto, /EL SEÑOR ES MI LUZ Y MI SALVACIÓN: NO TEMAS LO QUE TRAIGA ESTE DÍA/); // los ejemplos del autor
  assert.match(visto, /Mateo 11:28/);                                  // la cita del guion
  assert.doesNotMatch(visto, /Today's date for the title/);            // la fecha sigue fuera
});

test('optimize publica el largo en el formato nuevo aunque la IA lo devuelva en minúsculas', async () => {
  const prev = { ...process.env };
  Object.assign(process.env, { CONTENT_LANGUAGE: 'es', CHANNEL_THEME: 'prayer' });
  const agente = new SEOOptimizerAgent({ saveSEOData: async () => {} }, {});
  agente.aiTextService = {
    isAvailable: () => true, providerName: 'fake',
    generateText: async () => JSON.stringify({ title: 'Venid a mí los cansados: entrega tus cargas antes de dormir 🌙🙏', description: 'x', tags: ['a', 'b'], hashtags: ['#a'] })
  };
  const r = await agente.optimize({ title: 'Oración de la noche', scriptures: [{ reference: 'Mateo 11:28' }] },
    { topic: 'cargas', keywords: [], franja: 'NOCHE', contentFormat: 'long' });
  process.env = prev;
  assert.equal(r.title, 'ORACIÓN DE LA NOCHE | VENID A MÍ LOS CANSADOS: ENTREGA TUS CARGAS ANTES DE DORMIR | Mateo 11:28');
});
