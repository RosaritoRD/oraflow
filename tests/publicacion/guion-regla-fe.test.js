// 05/10/2026: la regla de fe en el guion NO puede cambiar la forma de la conclusión
// (un objeto con recap/finalThought): convertirla en texto rompió todos los guiones.
const test = require('node:test');
const assert = require('node:assert/strict');
const ScriptWriterAgent = require('../../agents/script-writer-agent');

test('cierraOracion: conserva el objeto de la conclusión y cierra con Jesús Rey + Amén', () => {
  const anterior = process.env.CONTENT_LANGUAGE;
  process.env.CONTENT_LANGUAGE = 'es';
  try {
    const Clase = ScriptWriterAgent.ScriptWriterAgent || ScriptWriterAgent;
    const agente = Object.create(Clase.prototype);
    const conclusion = { type: 'conclusion', recap: ['Que su paz te acompañe esta noche'], finalThought: '', duration: '30 seconds' };
    const r = agente.cierraOracion(conclusion, { topic: 'Oración de la noche' }, { title: 'Oración de la noche' }, [{ content: ['Señor, te entrego mi día'] }]);
    assert.ok(Array.isArray(r.recap));
    assert.equal(r.finalThought, '');
    assert.match(r.recap.at(-1), /Jesús de Nazaret, Rey de reyes\. Amén\.$/);
    const conRey = agente.cierraOracion({ ...conclusion }, { topic: 'Oración' }, { title: 'Oración' }, [{ content: ['Jesús, mi Rey, gracias'] }]);
    assert.equal(conRey.recap.at(-1), 'Que su paz te acompañe esta noche. Amén.');
    assert.doesNotThrow(() => r.recap.forEach(() => {}));
  } finally {
    process.env.CONTENT_LANGUAGE = anterior;
  }
});

test('generateScript completo con IA simulada: no se rompe y cierra en Amén', async () => {
  const anterior = process.env.CONTENT_LANGUAGE;
  process.env.CONTENT_LANGUAGE = 'es';
  try {
    const { ScriptWriterAgent } = require('../../agents/script-writer-agent');
    const agente = new ScriptWriterAgent({ saveScript: async () => {} }, {});
    agente.aiTextService = { providerName: 'falso', isAvailable: () => true, generateText: async () => JSON.stringify({
      title: 'Oración de la noche para descansar', hook: 'Si hoy no puedes dormir, esta oración es para ti.',
      introduction: 'Respira despacio.', conclusion: 'Que su paz te acompañe.', cta: 'Vuelve mañana por otra oración.',
      sections: [{ title: 'Oración', content: ['Señor, te entrego mi día y mi cansancio.'], duration: 60 }],
      scriptures: [], claims: []
    }) };
    agente.logger = { info() {}, warn() {}, error() {} };
    const guion = await agente.generateScript({ topic: 'Oración de la noche', contentType: 'Story', targetAudience: 'x', keywords: [] });
    assert.match(guion.fullScript, /Rey de reyes\. Amén\./);
  } finally {
    process.env.CONTENT_LANGUAGE = anterior;
  }
});
