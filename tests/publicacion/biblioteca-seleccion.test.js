const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const path = require('path');
const fs = require('fs').promises;
const { StoryboardPipeline } = require('../../utils/storyboard-pipeline');
const { guardaFicha, leeFichas } = require('../../utils/biblioteca-stock');

// Clip picking with the library: if there's already plenty of material it doesn't
// go to Pexels; reused footage carries a variant and is noted in the record.

async function montaje(clips) {
  const dataRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sel-'));
  const cacheDir = path.join(dataRoot, 'assets', 'stock');
  await fs.mkdir(cacheDir, { recursive: true });
  for (const c of clips) {
    const ruta = path.join(cacheDir, `${c.id}.mp4`);
    await fs.writeFile(ruta, 'video');
    const ficha = await guardaFicha(ruta, { source: 'pexels', type: 'video', width: 1920, height: 1080, durationSec: 30, url: `https://x/${c.id}.mp4`, ...c });
    if (c.usos) { ficha.usos = c.usos; await fs.writeFile(`${ruta}.json`, JSON.stringify(ficha)); }
  }
  let busquedas = 0;
  const stockMedia = {
    isAvailable: async () => true,
    search: async () => { busquedas += 1; return []; },
    score: () => 10,
    download: async (asset) => path.join(cacheDir, `${asset.id}.mp4`)
  };
  const logger = { info() {}, warn() {} };
  const pipeline = new StoryboardPipeline({ db: {}, logger, videoGenerator: {}, stockMedia, dataRoot });
  return { pipeline, cacheDir, dataRoot, busquedas: () => busquedas };
}

const escena = (shots) => ({ order: 0, stockQueries: ['calm lake at dawn'], visualIntent: 'lake', preferredAssetType: 'video',
  shots: Array.from({ length: shots }, () => ({ duration: 6, preferredAssetType: 'video' })) });

test('with plenty of library material Pexels isn\'t searched and reused footage carries a variant', async () => {
  const ids = ['l1', 'l2', 'l3', 'l4'];
  const m = await montaje(ids.map(id => ({ id, title: `misty lake at dawn ${id}`, usos: [{ produccion: 'vieja', en: '2026-09-01T00:00:00Z' }] })));
  const sb = { aspectRatio: '16:9', scenes: [escena(2)] };
  await m.pipeline.selectAssets({ id: 'prod_nueva', assets: {} }, sb);
  assert.equal(m.busquedas(), 0);
  const shots = sb.scenes[0].shots;
  assert.ok(shots.every(s => s.selectedAsset && s.variante));         // already used before → with a variant
  const fichas = await leeFichas(m.cacheDir);
  const usada = fichas.find(f => f.ficha.id === shots[0].selectedAsset.assetId);
  assert.equal(usada.ficha.usos.at(-1).produccion, 'prod_nueva');
  await fs.rm(m.dataRoot, { recursive: true });
});

test('if clips run short, it repeats one from the same video with another variant (never the same twice in a row)', async () => {
  const m = await montaje([{ id: 'u1', title: 'lake dawn' }, { id: 'u2', title: 'lake dawn two' }]);
  const sb = { aspectRatio: '16:9', scenes: [escena(4)] };
  await m.pipeline.selectAssets({ id: 'prod_x', assets: {} }, sb);
  const shots = sb.scenes[0].shots;
  assert.ok(shots.every(s => s.selectedAsset));
  assert.equal(shots[0].variante, null);                                  // primera vez: tal cual
  for (let i = 1; i < shots.length; i++) assert.notEqual(shots[i].selectedAsset.assetId, shots[i - 1].selectedAsset.assetId);
  assert.ok(shots[2].variante && shots[3].variante);                      // repeated: with a variant
  await fs.rm(m.dataRoot, { recursive: true });
});
