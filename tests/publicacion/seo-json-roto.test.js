// 07/10/2026: la IA de SEO devolvió JSON con un salto de línea dentro de la
// descripción («Unterminated string») y el vídeo salió con la plantilla de respaldo.
const test = require('node:test');
const assert = require('node:assert/strict');
const { SEOOptimizerAgent } = require('../../agents/seo-optimizer-agent');

function agente(respuestas) {
  const a = new SEOOptimizerAgent({ saveSEOData: async () => {} }, {});
  a.logger = { info() {}, warn() {}, error() {}, success() {} };
  let n = 0;
  a.aiTextService = { isAvailable: () => true, providerName: 'fake', generateText: async () => respuestas[Math.min(n++, respuestas.length - 1)] };
  return { a, llamadas: () => n };
}
const guion = { title: 'Oración de la noche', scriptures: [] };
const estrategia = { topic: 'paz', keywords: ['oracion'], contentFormat: 'long' };

test('saltos de línea crudos dentro de un texto JSON se reparan', () => {
  const { a } = agente([]);
  const r = a.parseAIJsonResponse('{"title": "Oración", "description": "Primer párrafo.\nSalmos 4:8 \\"En paz\\"", "tags": ["a"]}');
  assert.equal(r.description, 'Primer párrafo.\nSalmos 4:8 "En paz"');
});

test('si la respuesta no se puede leer, se pide otra vez antes de usar la plantilla', async () => {
  const bueno = JSON.stringify({ title: 'Oración para dormir en paz', description: 'Una oración.', tags: ['oracion', 'paz'], hashtags: ['#oracion'] });
  const { a, llamadas } = agente(['{"title": "Oración", "description": "cortado', bueno]);
  const r = await a.generateSEOWithAI(guion, estrategia);
  assert.equal(llamadas(), 2);
  assert.ok(r && r.description === 'Una oración.');

  const { a: b, llamadas: n2 } = agente(['roto', 'roto']);
  assert.equal(await b.generateSEOWithAI(guion, estrategia), null);
  assert.equal(n2(), 2); // no más de un reintento
});
