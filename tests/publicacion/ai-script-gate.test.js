const test = require('node:test');
const assert = require('node:assert/strict');
const { OperatorService } = require('../../utils/operator-service');

const db = { getRow: async () => ({ count: 0 }), findDuplicatePublicationTitle: async () => null };

function production(generationSource) {
  return {
    seo: { title: 'ORACIÓN DE LA MAÑANA', description: 'x'.repeat(80), tags: ['a', 'b', 'c'] },
    script: { fullScript: 'y'.repeat(300), metadata: generationSource ? { generationSource } : {} },
    strategy: {},
    assets: {}
  };
}

const gate = checks => checks.find(c => c.id === 'ai_script');

test('un guion de plantilla (la IA falló) bloquea la publicación', async () => {
  const r = await new OperatorService(db).runQualityChecks(production(undefined));
  assert.equal(gate(r.checks).passed, false);
  assert.equal(gate(r.checks).blocking, true);
  assert.equal(r.passed, false);
  assert.ok(r.blockingFailures.includes('ai_script'));
});

test('un guion escrito por la IA pasa el control', async () => {
  const r = await new OperatorService(db).runQualityChecks(production('ai'));
  assert.equal(gate(r.checks).passed, true);
});

test('ALLOW_TEMPLATE_CONTENT=on lo desactiva', async () => {
  process.env.ALLOW_TEMPLATE_CONTENT = 'on';
  try {
    const r = await new OperatorService(db).runQualityChecks(production(undefined));
    assert.equal(gate(r.checks), undefined);
  } finally {
    delete process.env.ALLOW_TEMPLATE_CONTENT;
  }
});
