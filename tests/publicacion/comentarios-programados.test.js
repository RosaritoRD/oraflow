// 02/10/2026: comment sync was requesting comments on videos still scheduled (private
// until their time) and YouTube answered «has disabled comments»: 40+ false warnings a
// day. A video that isn't public yet isn't synced.
const test = require('node:test');
const assert = require('node:assert');
const { AudienceEngagementService } = require('../../utils/audience-engagement-service');

const svc = Object.create(AudienceEngagementService.prototype);
const ahora = new Date('2026-10-02T12:00:00Z');

test('a video scheduled for later isn\'t synced yet', () => {
  assert.strictEqual(svc.isSyncDue(null, '2026-10-02T16:00:00Z', ahora), false);
  assert.strictEqual(svc.isSyncDue({ lastSyncedAt: '2026-10-01T00:00:00Z' }, '2026-10-02T16:00:00Z', ahora), false);
});

test('a video already public and never synced does get synced', () => {
  assert.strictEqual(svc.isSyncDue(null, '2026-10-02T09:00:00Z', ahora), true);
});

test('without a publish date the previous behavior is kept', () => {
  assert.strictEqual(svc.isSyncDue(null, null, ahora), true);
});

test('just published (under 15 min) isn\'t synced yet: YouTube takes a while to make it public', () => {
  assert.strictEqual(svc.isSyncDue(null, '2026-10-02T11:59:59Z', ahora), false);
  assert.strictEqual(svc.isSyncDue(null, '2026-10-02T11:40:00Z', ahora), true);
});

test('«comments disabled» in googleapis\' real shape is recorded and not retried', async () => {
  const guardado = [];
  const db = {
    getEngagementInsight: async () => null,
    countAudienceComments: async () => ({ total: 0 }),
    saveEngagementInsight: async i => { guardado.push(i); return i; }
  };
  const s = new AudienceEngagementService(db, null, null, {
    logger: { info() {}, warn() {}, error() {} },
    listCommentThreads: async () => {
      const e = new Error('The video identified by the videoId parameter has disabled comments.');
      e.response = { data: { error: { errors: [{ reason: 'commentsDisabled' }] } } };
      throw e;
    },
    getChannelId: async () => 'UCx'
  });
  const r = await s.syncVideoComments('abc', {});
  assert.strictEqual(r.disabled, true);
  assert.ok(guardado[0].lastSyncedAt);
});
