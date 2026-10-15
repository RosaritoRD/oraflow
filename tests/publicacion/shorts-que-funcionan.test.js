// 12/10/2026: con 19 Shorts medidos a 7 días, los que nombran una situación concreta del que
// mira («cuando no puedes dejar de pensar» 9.624 vistas, «Si despertaste con ansiedad» 6.283)
// sacaron 2-3 veces más que los genéricos. El guionista de Shorts ve los mejores del canal
// como FORMA a imitar (no como texto a copiar); los largos no cambian.
const test = require('node:test');
const assert = require('node:assert/strict');
const { mejoresShorts, bloqueEjemplos } = require('../../utils/shorts-que-funcionan');

const fila = (video_id, views, title, seoTitle = null) => ({
  video_id, metrics: JSON.stringify({ views }), title, metadata: JSON.stringify(seoTitle ? { seo: { title: seoTitle } } : {})
});

test('mejoresShorts: los de más vistas primero, uno por vídeo, con el título publicado', () => {
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

test('bloqueEjemplos: dice que no se copien y da la forma; vacío sin datos', () => {
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

test('el guion de un Short lleva los mejores Shorts del canal', async () => {
  const p = await promptDe({ contentFormat: 'short', ejemplosQueFuncionan: EJEMPLOS });
  assert.match(p, /cuando no puedes dejar de pensar" \(9624 views/);
});

test('el guion de un largo no los lleva', async () => {
  const p = await promptDe({ contentFormat: 'long', ejemplosQueFuncionan: EJEMPLOS });
  assert.doesNotMatch(p, /9624/);
});

// 12/10/2026: el Short del 13/10 salió con 220 palabras habladas (el objetivo es 150-190 y los
// mejores tuvieron 168-199); con la voz de los Shorts serían ~1:55. El tope va solo en el prompt:
// recortar secciones, como en los largos, le quitaría al Short su única sección.
test('el prompt de un Short lleva un tope duro de 190 palabras habladas', async () => {
  const p = await promptDe({ contentFormat: 'short' });
  assert.match(p, /HARD LIMIT: at most 190 spoken words/);
});

test('el tope de un largo sigue saliendo de su duración', async () => {
  const p = await promptDe({ contentFormat: 'long', requestedLength: '5-6 minutes' });
  assert.match(p, /HARD LIMIT: at most 780 spoken words/);
  assert.doesNotMatch(p, /at most 190 spoken words/);
});
