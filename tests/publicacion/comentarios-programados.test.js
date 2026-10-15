// 02/10/2026: la sincronización de comentarios pedía los de vídeos aún programados
// (privados hasta su hora) y YouTube respondía «has disabled comments»: 40+ avisos
// falsos al día. Un vídeo que todavía no es público no se sincroniza.
const test = require('node:test');
const assert = require('node:assert');
const { AudienceEngagementService } = require('../../utils/audience-engagement-service');

const svc = Object.create(AudienceEngagementService.prototype);
const ahora = new Date('2026-10-02T12:00:00Z');

test('un vídeo programado para más tarde no se sincroniza todavía', () => {
  assert.strictEqual(svc.isSyncDue(null, '2026-10-02T16:00:00Z', ahora), false);
  assert.strictEqual(svc.isSyncDue({ lastSyncedAt: '2026-10-01T00:00:00Z' }, '2026-10-02T16:00:00Z', ahora), false);
});

test('un vídeo ya público y nunca sincronizado sí se sincroniza', () => {
  assert.strictEqual(svc.isSyncDue(null, '2026-10-02T09:00:00Z', ahora), true);
});

test('sin fecha de publicación se mantiene el comportamiento anterior', () => {
  assert.strictEqual(svc.isSyncDue(null, null, ahora), true);
});

test('recién publicado (menos de 15 min) aún no se sincroniza: YouTube tarda en hacerlo público', () => {
  assert.strictEqual(svc.isSyncDue(null, '2026-10-02T11:59:59Z', ahora), false);
  assert.strictEqual(svc.isSyncDue(null, '2026-10-02T11:40:00Z', ahora), true);
});

test('«comentarios desactivados» con la forma real de googleapis se apunta y no se reintenta', async () => {
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
