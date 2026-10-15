const test = require('node:test');
const assert = require('node:assert/strict');
const { GenerationRecoveryService } = require('../../utils/generation-recovery-service');

// 29/09: los Shorts devolvían null en la etapa de miniatura y el trabajo moría
// con "thumbnail produced an incomplete or missing artifact".
function fakeDb() {
  const checkpoints = new Map();
  return {
    getGenerationCheckpoint: async (_job, stage) => checkpoints.get(stage) || null,
    saveGenerationCheckpoint: async (_job, stage, data) => checkpoints.set(stage, { ...checkpoints.get(stage), ...data }),
    deleteGenerationCheckpoints: async () => {},
    getGenerationJob: async () => ({ details: {} })
  };
}

test('un Short (miniatura omitida a propósito) supera la etapa de miniatura', async () => {
  const svc = new GenerationRecoveryService(fakeDb(), { baseDelayMs: 0 });
  const out = await svc.run('job', 'thumbnail', 40, async () => ({ skipped: true, reason: 'short' }));
  assert.equal(out.skipped, true);
});

test('un largo sin miniatura sigue fallando', async () => {
  const svc = new GenerationRecoveryService(fakeDb(), { baseDelayMs: 0 });
  await assert.rejects(svc.run('job', 'thumbnail', 40, async () => null), /incomplete or missing artifact/);
  await assert.rejects(svc.run('job2', 'thumbnail', 40, async () => ({ path: '/no/existe.jpg' })), /incomplete/);
});
