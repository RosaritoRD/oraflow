const test = require('node:test');
const assert = require('node:assert/strict');
const { SEOOptimizerAgent } = require('../../agents/seo-optimizer-agent');

async function optimize(reference, candidates, extra = {}) {
  let saved;
  const agent = new SEOOptimizerAgent({ saveSEOData: async value => { saved = value; } }, {});
  agent.generateSEOWithAI = async () => ({
    title: 'Oración de la noche para descansar', description: 'Oremos para descansar en paz.',
    tags: ['oracion'], hashtags: candidates
  });
  const result = await agent.optimize({ title: 'Oración de la noche', scriptures: reference ? [{ reference }] : [] },
    { topic: 'Oración para dormir', contentFormat: 'short', contentType: 'prayer', keywords: ['oracion'], franja: 'NOCHE', ...extra });
  assert.deepEqual(saved.hashtags, result.hashtags);
  return result;
}

for (const [reference, incorrect, expected] of [
  ['Salmo 4:8', '#salmo48', '#salmo4'],
  ['Salmos 121:7-8', '#salmos12178', '#salmo121'],
  ['Proverbios 3:5-6', '#proverbios356', '#proverbios3'],
  ['1 Pedro 5:7', '#1pedro57', '#1pedro5']
]) {
  test(`derives the chapter of ${reference} in SEO and description`, async () => {
    const result = await optimize(reference, ['#SHORTS', '#OraciónDeLaNoche', incorrect]);
    assert.deepEqual(result.hashtags, ['#shorts', '#oraciondelanoche', expected]);
    assert.ok(result.description.includes(expected));
    assert.ok(!result.description.includes(incorrect));
  });
}

test('Salmo 48:1 keeps #salmo48; doesn\'t replace it with Salmo 4', async () => {
  assert.ok((await optimize('Salmo 48:1', ['#shorts', '#salmo48'])).hashtags.includes('#salmo48'));
});

test('doesn\'t invent a chapter from an ambiguous reference or accept a foreign one', async () => {
  for (const reference of ['', 'Salmo48', 'Salmo 0:8', 'Algo 4:8']) {
    const result = await optimize(reference, ['#shorts', '#salmo48', '#oración']);
    assert.equal(result.hashtags.length, 3);
    assert.ok(!result.hashtags.some(h => /salmo\d/.test(h)));
  }
});

test('without AI hashtags, uses short prayer tags and the real reference', async () => {
  const result = await optimize('Mateo 11:28', null);
  assert.deepEqual(result.hashtags, ['#shorts', '#oraciondelanoche', '#mateo11']);
});

test('a long video doesn\'t inherit #shorts and the chapter has room among the three tags', async () => {
  const result = await optimize('Isaías 41:10', ['#shorts', '#Fe', '#Esperanza', '#oracion'], { contentFormat: 'long' });
  assert.deepEqual(result.hashtags, ['#fe', '#esperanza', '#isaias41']);
});
