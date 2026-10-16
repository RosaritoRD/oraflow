// 07/10/2026: the SEO AI returned JSON with a line break inside the description
// («Unterminated string») and the video went out with the fallback template.
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

test('raw line breaks inside a JSON string are repaired', () => {
  const { a } = agente([]);
  const r = a.parseAIJsonResponse('{"title": "Oración", "description": "Primer párrafo.\nSalmos 4:8 \\"En paz\\"", "tags": ["a"]}');
  assert.equal(r.description, 'Primer párrafo.\nSalmos 4:8 "En paz"');
});

test('if the response can\'t be read, it asks again before using the template', async () => {
  const bueno = JSON.stringify({ title: 'Oración para dormir en paz', description: 'Una oración.', tags: ['oracion', 'paz'], hashtags: ['#oracion'] });
  const { a, llamadas } = agente(['{"title": "Oración", "description": "cortado', bueno]);
  const r = await a.generateSEOWithAI(guion, estrategia);
  assert.equal(llamadas(), 2);
  assert.ok(r && r.description === 'Una oración.');

  const { a: b, llamadas: n2 } = agente(['roto', 'roto']);
  assert.equal(await b.generateSEOWithAI(guion, estrategia), null);
  assert.equal(n2(), 2); // no more than one retry
});
