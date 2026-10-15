// 05/10/2026: vídeos recomendados en la descripción (modelo Harrigan).
const test = require('node:test');
const assert = require('node:assert/strict');
const d = require('../../utils/destacados');
const { componeDescripcion, INVITA, VER } = require('../../agents/seo-optimizer-agent');
const { textoParaRed } = require('../../utils/texto-social');

test('elige el largo y el Short más vistos', () => {
  assert.equal(d.duracionSegundos('PT7M3S'), 423);
  const r = d.eligeDestacados([
    { id: 'L1', titulo: 'a', vistas: 10, segundos: 420 }, { id: 'L2', titulo: 'b', vistas: 99, segundos: 400 },
    { id: 'S1', titulo: 'c', vistas: 500, segundos: 50 }, { id: 'S2', titulo: 'd', vistas: 5, segundos: 40 }
  ]);
  assert.equal(r.invita.id, 'L2');
  assert.equal(r.ver.url, 'https://www.youtube.com/watch?v=S1');
});

test('descripción: invita arriba, "Tienes que ver" tras la raya del pie, hashtags finales; nada de eso pasa a Instagram', () => {
  process.env.DESCRIPTION_FOOTER = '━━━━━\\n📖 Libro';
  try {
    const t = componeDescripcion('Cuerpo.', ['oracion'], { invita: { url: 'https://www.youtube.com/watch?v=L2' }, ver: { url: 'https://www.youtube.com/watch?v=S1' } });
    assert.ok(t.startsWith(`${INVITA}\nhttps://www.youtube.com/watch?v=L2`));
    assert.match(t, new RegExp(`━━━━━\\n${VER}\\nhttps://www.youtube.com/watch\\?v=S1`));
    assert.match(t, /#oracion$/);
    const ig = textoParaRed({ title: 'T', description: t }, 'instagram', {});
    assert.doesNotMatch(ig, /invitamos|watch\?v=|Tienes que ver/);
    assert.match(ig, /Cuerpo\./);
  } finally {
    delete process.env.DESCRIPTION_FOOTER;
  }
});

test('control de calidad: usa el título editado en el panel', async () => {
  const { OperatorService } = require('../../utils/operator-service');
  const vistos = [];
  const op = Object.create(OperatorService.prototype);
  op.db = { findDuplicatePublicationTitle: async t => { vistos.push(t); return null; }, getRow: async () => ({ count: 0 }) };
  op.check = (id, passed, message, blocking = true) => ({ id, passed, message, blocking });
  op.fileExists = async () => true;
  op.logger = { info() {}, warn() {} };
  await op.runQualityChecks({ seo: { title: 'Viejo', description: 'x'.repeat(60), tags: ['a', 'b', 'c'] }, editorData: { title: 'Nuevo' }, script: { fullScript: 'y'.repeat(300) }, assets: {} }).catch(() => {});
  assert.equal(vistos[0], 'Nuevo');
});
