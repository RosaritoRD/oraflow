const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs').promises;
const os = require('os');
const path = require('path');
const sharp = require('sharp');
const { BRAND, buildThumbnailPlan } = require('../../utils/jeshua-thumbnail-plan');
const { renderThumbnail } = require('../../utils/jeshua-thumbnail-renderer');
const { JeshuaThumbnailService, isJeshuaStyle } = require('../../utils/jeshua-thumbnail-service');

async function fixture(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'jeshua-test-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const artworkPath = path.join(dir, 'artwork.png');
  await sharp({ create: { width: 1280, height: 720, channels: 3, background: '#ffffff' } }).png().toFile(artworkPath);
  return { dir, artworkPath };
}

test('export preserves accented copy, margins, contrast and actual mobile files on a white background', async t => {
  const { dir, artworkPath } = await fixture(t);
  const plan = buildThumbnailPlan({ video_title: 'Oración para confiar en Dios', prayer_type: 'morning' });
  plan.thumbnail_headline = 'CONFÍA EN DIOS';
  plan.thumbnail_subheadline = 'ESTA MAÑANA';
  const result = await renderThumbnail({ plan, artworkPath, outputDir: path.join(dir, 'output'), textSide: 'right' });
  const metadata = await sharp(result.path).metadata();
  assert.equal(metadata.width, 1280);
  assert.equal(metadata.height, 720);
  assert.equal(metadata.format, 'jpeg');
  assert.ok(result.fileSize < 2 * 1024 * 1024);
  assert.ok(result.qa.checks.minTextContrast >= 4.5);
  assert.equal(result.qa.layout.boxes.filter(box => box.level === 'headline').map(box => box.text).join(' '), 'CONFÍA EN DIOS');
  assert.equal(result.qa.layout.boxes.filter(box => box.level === 'subheadline').map(box => box.text).join(' '), 'ESTA MAÑANA');
  assert.ok(result.qa.layout.boxes.every(box => box.x >= 64 && box.x + box.width <= 1216 && box.y + box.height <= 616));
  assert.equal(result.qa.artworkReview, 'pending');
  assert.equal(result.qa.requiresVisualReview, true);
  const pixels = await sharp(result.pngPath).removeAlpha().raw().toBuffer();
  let greenFringes = 0;
  for (let index = 0; index < pixels.length; index += 3) {
    const [r, g, b] = pixels.subarray(index, index + 3);
    if (g > 100 && g > r + 40 && g > b + 40) greenFringes++;
  }
  assert.equal(greenFringes, 0, 'Gold/ivory lettering on a white/navy canvas must not have green antialiasing fringes');
  for (const width of [320, 160]) assert.equal((await sharp(result.previews[width]).metadata()).width, width);
  assert.equal((await fs.readFile(artworkPath)).length > 0, true);
});

test('all themes and both languages render with exact copy at readable sizes', async t => {
  const { dir, artworkPath } = await fixture(t);
  for (const language of ['es', 'en']) {
    for (const prayer_type of BRAND.prayerTypes) {
      for (let variant = 0; variant < 4; variant++) {
        const plan = buildThumbnailPlan({ video_title: 'A meaningful original prayer', language, prayer_type }, { variant });
        const result = await renderThumbnail({ plan, artworkPath, outputDir: path.join(dir, 'render'), textSide: plan.composition.text_side, subjectRegion: plan.subject_region });
        assert.equal(result.qa.layout.boxes.filter(box => box.level === 'headline').map(box => box.text).join(' '), plan.thumbnail_headline);
        assert.ok(result.qa.checks.headlineMobileFontSize160 >= 11);
      }
    }
  }
});

test('automatic placement avoids a supplied subject; unsafe fixed placement is rejected', async t => {
  const { dir, artworkPath } = await fixture(t);
  const plan = buildThumbnailPlan({ prayer_type: 'night' });
  const subjectRegion = { x: 0.55, y: 0.05, width: 0.4, height: 0.85 };
  const result = await renderThumbnail({ plan, artworkPath, outputDir: dir, subjectRegion });
  assert.equal(result.qa.layout.textSide, 'left');
  await assert.rejects(renderThumbnail({ plan, artworkPath, outputDir: dir, subjectRegion, textSide: 'right' }), /overlap/);
  await assert.rejects(renderThumbnail({ plan, artworkPath, outputDir: dir, subjectRegion: { x: 0, y: 0, width: 1, height: 1 } }), /No safe text column/);
});

test('long unbreakable headlines fail instead of shrinking into unreadable lettering', async t => {
  const { dir, artworkPath } = await fixture(t);
  const plan = buildThumbnailPlan({});
  plan.thumbnail_headline = 'EXTRAORDINARIAMENTE MISERICORDIOSO DIOS';
  await assert.rejects(renderThumbnail({ plan, artworkPath, outputDir: dir }), /readable mobile size/);
});

test('offline service never invokes configured AI and keeps separate runs', async t => {
  const { dir, artworkPath } = await fixture(t);
  const service = new JeshuaThumbnailService({
    imageGenerator: { generateImage: () => { throw new Error('Unexpected image request'); } },
    aiTextService: { generateText: () => { throw new Error('Unexpected text request'); } },
  });
  const plan = await service.create({ prayer_type: 'gratitude' }, { outputDir: dir, planOnly: true, variants: 2 });
  assert.equal(plan.variants.length, 2);
  assert.equal(plan.variants[0].path, undefined);
  const first = await service.create({ prayer_type: 'gratitude' }, { outputDir: dir, artworkPath, approveArtwork: true });
  const second = await service.create({ prayer_type: 'gratitude' }, { outputDir: dir, artworkPath });
  assert.notEqual(first.manifestPath, second.manifestPath);
  assert.equal(first.variants[0].qa.artworkReview, 'operator-confirmed');
  assert.equal(second.variants[0].qa.artworkReview, 'pending');
  await assert.rejects(service.create({}, { outputDir: dir }), /Supply artworkPath/);
  await assert.rejects(service.create({}, { outputDir: dir, generate: true, planOnly: true }), /cannot be combined/);
  await assert.rejects(service.create({}, { outputDir: dir, planOnly: true, variants: 5 }), /1 to 4/);
});

test('generated variants use distinct text-free artwork prompts and never auto-approve unseen art', async t => {
  const { dir, artworkPath } = await fixture(t);
  const prompts = [];
  const service = new JeshuaThumbnailService({ imageGenerator: { generateImage: async (prompt, outputPath) => {
    prompts.push(prompt);
    await fs.copyFile(artworkPath, outputPath);
  } } });
  const result = await service.create({ prayer_type: 'morning' }, { outputDir: dir, generate: true, variants: 2 });
  assert.equal(new Set(prompts).size, 2);
  for (const [index, item] of result.variants.entries()) {
    assert.match(prompts[index], /text-free/);
    assert.ok(!prompts[index].includes(item.plan.thumbnail_headline));
    assert.equal(item.qa.artworkReview, 'pending');
    assert.equal(item.qa.layout.textSide, item.plan.composition.text_side);
  }
  await assert.rejects(service.create({}, { outputDir: dir, generate: true, approveArtwork: true }), /already inspected/);
});

test('style activates only for the configured style or exact channel name', () => {
  assert.equal(isJeshuaStyle({ CHANNEL_NAME: 'Oraciones en Presencia de Jeshua' }), true);
  assert.equal(isJeshuaStyle({ CHANNEL_NAME: 'Oraciones en Presencia de Yeshua' }), true);
  assert.equal(isJeshuaStyle({ THUMBNAIL_STYLE: BRAND.id }), true);
  assert.equal(isJeshuaStyle({ CHANNEL_NAME: 'Oraciones en Presencia de Jeshua', THUMBNAIL_STYLE: 'legacy' }), false);
  assert.equal(isJeshuaStyle({ CHANNEL_NAME: 'Another channel' }), false);
});

test('unrenderable AI copy is reframed before the image provider is called', async t => {
  const { dir, artworkPath } = await fixture(t);
  const input = { prayer_type: 'morning' };
  const localPlan = buildThumbnailPlan(input);
  const fields = ['thumbnail_headline', 'thumbnail_subheadline', 'visual_concept', 'subject_description', 'background_description', 'lighting_description', 'composition'];
  const aiPlan = Object.fromEntries(fields.map(key => [key, localPlan[key]]));
  aiPlan.thumbnail_headline = 'EXTRAORDINARIAMENTE MISERICORDIOSO DIOS';
  let calls = 0;
  const service = new JeshuaThumbnailService({
    aiTextService: { generateText: async () => JSON.stringify(aiPlan) },
    imageGenerator: { generateImage: async (_prompt, outputPath) => { calls++; await fs.copyFile(artworkPath, outputPath); } },
  });
  const result = await service.create(input, { outputDir: dir, generate: true });
  assert.equal(calls, 1);
  assert.equal(result.variants[0].plan.thumbnail_headline, localPlan.thumbnail_headline);
  assert.match(result.variants[0].plan.generation.fallback_reason, /readable mobile size/);
});

test('production preserves the composed Jeshua thumbnail without a second generation', async t => {
  const { dir, artworkPath } = await fixture(t);
  const { ProductionManagementAgent } = require('../../agents/production-management-agent');
  let calls = 0;
  const context = { aiVideoGenerator: { generateThumbnail: async () => { calls++; return { path: 'incorrect-generated.png' }; } }, logger: { error() {} } };
  const thumbnail = { path: artworkPath, brandId: BRAND.id, finalized: true, qa: { automaticChecksPassed: true }, dimensions: { width: 1280, height: 720 } };
  const result = await ProductionManagementAgent.prototype.processThumbnail.call(context, thumbnail, { title: 'Prayer' });
  assert.equal(calls, 0);
  assert.equal(result.path, artworkPath);
  assert.equal(result.brandId, BRAND.id);
  await assert.rejects(ProductionManagementAgent.prototype.processThumbnail.call(context, { ...thumbnail, path: path.join(dir, 'missing.jpg') }, {}), /ENOENT|missing/);
});

test('designer saves the branded artifact and sends branded A/B variants through the same service', async t => {
  const { ThumbnailDesignerAgent } = require('../../agents/thumbnail-designer-agent');
  const previousStyle = process.env.THUMBNAIL_STYLE;
  process.env.THUMBNAIL_STYLE = BRAND.id;
  t.after(() => { if (previousStyle === undefined) delete process.env.THUMBNAIL_STYLE; else process.env.THUMBNAIL_STYLE = previousStyle; });
  const saved = [];
  const requests = [];
  const agent = new ThumbnailDesignerAgent({ saveThumbnail: async item => saved.push(item) }, {});
  agent.jeshuaService = { create: async (input, options) => {
    requests.push({ input, options });
    return { brandId: BRAND.id, manifestPath: '/fixture/manifest.json', createdAt: '2026-09-21',
      variants: Array.from({ length: options.variants || 1 }, (_, index) => ({
        path: `/fixture/thumbnail-${index}.jpg`, dimensions: { width: 1280, height: 720 }, fileSize: 100000,
        qa: { automaticChecksPassed: true }, plan: buildThumbnailPlan(input, { variant: (options.startVariant || 0) + index }),
      })) };
  } };
  const thumbnail = await agent.generateThumbnail({ title: 'Oración de la noche para descansar', language: 'es', scriptures: [{ reference: 'Salmo 4:8' }] });
  assert.equal(saved[0], thumbnail);
  assert.equal(thumbnail.finalized, true);
  assert.equal(thumbnail.concept.prayer_type, 'night');
  assert.equal(thumbnail.brandId, BRAND.id);
  const variants = await agent.generateABVariants(thumbnail.concept);
  assert.equal(variants.length, 3);
  assert.equal(requests[1].options.startVariant, 1);
  assert.ok(variants.every(item => item.finalized && item.brandId === BRAND.id));
});

test('production keeps the composed oracion thumbnail (no legacy AI replacement)', async t => {
  const { artworkPath } = await fixture(t);
  const { ProductionManagementAgent } = require('../../agents/production-management-agent');
  let calls = 0;
  const context = { aiVideoGenerator: { generateThumbnail: async () => { calls++; return { path: 'loud.png' }; } }, logger: { error() {} } };
  const thumbnail = { path: artworkPath, concept: { style: 'oracion', background: 'ia' }, dimensions: { width: 1280, height: 720 } };
  const result = await ProductionManagementAgent.prototype.processThumbnail.call(context, thumbnail, { title: 'Oración' });
  assert.equal(calls, 0);
  assert.equal(result.path, artworkPath);
});

/* 13/10/2026: el largo de la mañana salió SIN miniatura. Las de la biblioteca
   del autor llegan con style 'propio'; este paso solo conocía 'oracion', las
   mandaba al camino de IA, la IA no estaba y devolvía un .info de simulación,
   y YouTube rechazaba ese .info («The provided image content is invalid»). */
test('production keeps el autor library thumbnails (style propio)', async t => {
  const { artworkPath } = await fixture(t);
  const { ProductionManagementAgent } = require('../../agents/production-management-agent');
  let calls = 0;
  const context = { aiVideoGenerator: { generateThumbnail: async () => { calls++; return { path: 'x.info' }; } }, logger: { error() {} } };
  const thumbnail = { path: artworkPath, concept: { style: 'propio', background: 'recibe-paz' } };
  const result = await ProductionManagementAgent.prototype.processThumbnail.call(context, thumbnail, { title: 'Oración' });
  assert.equal(calls, 0);
  assert.equal(result.path, artworkPath);
});

test('a simulated .info thumbnail never replaces a real image', async t => {
  const { artworkPath } = await fixture(t);
  const { ProductionManagementAgent } = require('../../agents/production-management-agent');
  const context = { aiVideoGenerator: { generateThumbnail: async () => ({ path: '/tmp/thumbnail_sim_1.info', dimensions: { width: 1792, height: 1024 } }) }, logger: { error() {}, warn() {} } };
  const result = await ProductionManagementAgent.prototype.processThumbnail.call(context, { path: artworkPath, concept: { style: 'clean' } }, { title: 'X' });
  t.after(() => fs.rm(result.path, { force: true }));
  // El camino de respaldo copia la original: tiene que ser la MISMA imagen.
  assert.doesNotMatch(result.path, /\.info$/);
  assert.deepEqual(await fs.readFile(result.path), await fs.readFile(artworkPath));
  assert.equal(result.originalPath, artworkPath);
});
