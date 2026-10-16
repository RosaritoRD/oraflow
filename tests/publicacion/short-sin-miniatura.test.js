const test = require('node:test');
const assert = require('node:assert/strict');
const { GenerationRecoveryService } = require('../../utils/generation-recovery-service');

// 29/09: Shorts returned null at the thumbnail stage and the job died with
// "thumbnail produced an incomplete or missing artifact".
function fakeDb() {
  const checkpoints = new Map();
  return {
    getGenerationCheckpoint: async (_job, stage) => checkpoints.get(stage) || null,
    saveGenerationCheckpoint: async (_job, stage, data) => checkpoints.set(stage, { ...checkpoints.get(stage), ...data }),
    deleteGenerationCheckpoints: async () => {},
    getGenerationJob: async () => ({ details: {} })
  };
}

test('a Short (thumbnail skipped on purpose) passes the thumbnail stage', async () => {
  const svc = new GenerationRecoveryService(fakeDb(), { baseDelayMs: 0 });
  const out = await svc.run('job', 'thumbnail', 40, async () => ({ skipped: true, reason: 'short' }));
  assert.equal(out.skipped, true);
});

test('a long video without a thumbnail still fails', async () => {
  const svc = new GenerationRecoveryService(fakeDb(), { baseDelayMs: 0 });
  await assert.rejects(svc.run('job', 'thumbnail', 40, async () => null), /incomplete or missing artifact/);
  await assert.rejects(svc.run('job2', 'thumbnail', 40, async () => ({ path: '/no/existe.jpg' })), /incomplete/);
});
