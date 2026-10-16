// 12/10/2026: with 19 Shorts measured at 7 days, the ones that name a concrete situation of the
// viewer («cuando no puedes dejar de pensar» 9,624 views, «Si despertaste con ansiedad» 6,283)
// got 2-3 times more than the generic ones. The Shorts scriptwriter sees the channel's best ones
// as a SHAPE to imitate (not text to copy); long videos don't change.
const test = require('node:test');
const assert = require('node:assert/strict');
const { mejoresShorts, bloqueEjemplos } = require('../../utils/shorts-que-funcionan');

const fila = (video_id, views, title, seoTitle = null) => ({
  video_id, metrics: JSON.stringify({ views }), title, metadata: JSON.stringify(seoTitle ? { seo: { title: seoTitle } } : {})
});

test('mejoresShorts: most viewed first, one per video, with the published title', () => {
  const r = mejoresShorts([
    fila('a', 2462, 'Si tu mente no descansa'),
    fila('b', 9624, 'Oración de la noche', 'Oración de la noche cuando no puedes dejar de pensar'),
    fila('c', 6283, 'Si despertaste con ansiedad, haz esta oración 🙏'),
    fila('b', 3840, 'Oración de la noche'),
    fila('d', 0, 'Sin vistas'),
    { video_id: 'e', metrics: 'roto', title: 'x', metadata: '{}' }
  ], 2);
  assert.deepEqual(r, [
    { titulo: 'Oración de la noche cuando no puedes dejar de pensar', vistas: 9624 },
    { titulo: 'Si despertaste con ansiedad, haz esta oración 🙏', vistas: 6283 }
  ]);
});

test('bloqueEjemplos: says not to copy them and gives the shape; empty without data', () => {
  const b = bloqueEjemplos([{ titulo: 'Si despertaste con ansiedad, haz esta oración', vistas: 6283 }]);
  assert.match(b, /do not copy/i);
  assert.match(b, /"Si despertaste con ansiedad, haz esta oración" \(6283 views in its first week\)/);
  assert.equal(bloqueEjemplos([]), '');
  assert.equal(bloqueEjemplos(undefined), '');
});

async function promptDe(strategy) {
  const anterior = process.env.CONTENT_LANGUAGE;
  process.env.CONTENT_LANGUAGE = 'es';
  let prompt = '';
  try {
    const { ScriptWriterAgent } = require('../../agents/script-writer-agent');
    const agente = new ScriptWriterAgent({ saveScript: async () => {} }, {});
    agente.aiTextService = { providerName: 'falso', isAvailable: () => true, generateText: async (p) => { prompt = p; return JSON.stringify({
      title: 'Oración de la noche', hook: 'Si hoy no puedes dormir, ora conmigo.', introduction: 'Respira.', conclusion: 'Paz.',
      cta: 'Vuelve mañana.', sections: [{ title: 'Oración', content: ['Señor, te entrego mi día.'], duration: 60 }], scriptures: [], claims: []
    }); } };
    agente.logger = { info() {}, warn() {}, error() {} };
    await agente.generateScript({ topic: 'Oración de la noche', contentType: 'Story', targetAudience: 'x', keywords: [], ...strategy });
  } finally {
    process.env.CONTENT_LANGUAGE = anterior;
  }
  return prompt;
}

const EJEMPLOS = [{ titulo: 'Oración de la noche cuando no puedes dejar de pensar', vistas: 9624 }];

test('a Short\'s script carries the channel\'s best Shorts', async () => {
  const p = await promptDe({ contentFormat: 'short', ejemplosQueFuncionan: EJEMPLOS });
  assert.match(p, /cuando no puedes dejar de pensar" \(9624 views/);
});

test('a long video\'s script doesn\'t', async () => {
  const p = await promptDe({ contentFormat: 'long', ejemplosQueFuncionan: EJEMPLOS });
  assert.doesNotMatch(p, /9624/);
});

// 12/10/2026: the 13/10 Short came out with 220 spoken words (the target is 150-190 and the best
// ones had 168-199); with the Shorts voice that'd be ~1:55. The cap only goes in the prompt:
// trimming sections, as with long videos, would take away the Short's only section.
test('a Short\'s prompt carries a hard cap of 190 spoken words', async () => {
  const p = await promptDe({ contentFormat: 'short' });
  assert.match(p, /HARD LIMIT: at most 190 spoken words/);
});

test('a long video\'s cap still comes from its duration', async () => {
  const p = await promptDe({ contentFormat: 'long', requestedLength: '5-6 minutes' });
  assert.match(p, /HARD LIMIT: at most 780 spoken words/);
  assert.doesNotMatch(p, /at most 190 spoken words/);
});
