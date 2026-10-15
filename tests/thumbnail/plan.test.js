const test = require('node:test');
const assert = require('node:assert/strict');
const { BRAND, normalizeInput, buildThumbnailPlan, createThumbnailPlan, validatePlan, buildImagePrompt } = require('../../utils/jeshua-thumbnail-plan');

const sample = {
  video_title: 'Oración de la mañana para comenzar este domingo confiando en Dios',
  video_topic: 'Confianza al comenzar el día',
  video_summary: 'Una oración de esperanza para entregar el día a Dios.',
  script: { title: 'Título secundario', mainContent: { sections: [{ content: ['Señor, pongo este nuevo día en tus manos.'] }] } },
  bible_verse: { reference: 'Proverbios 3:5', text: 'Fíate de Jehová de todo tu corazón.' },
  prayer_type: 'MORNING PRAYER',
  emotion: 'esperanza', time_of_day: 'mañana', language: 'es-MX',
};

function aiFields(plan) {
  return Object.fromEntries(['thumbnail_headline', 'thumbnail_subheadline', 'visual_concept', 'subject_description', 'background_description', 'lighting_description', 'composition'].map(key => [key, plan[key]]));
}

test('brand is deeply frozen and records the fixed visual identity', () => {
  assert.equal(BRAND.id, 'jeshua-divine-dawn');
  assert.equal(BRAND.width, 1280);
  assert.equal(BRAND.height, 720);
  assert.equal(BRAND.palette.navy, '#091A31');
  assert.equal(BRAND.fontFamily, 'Barlow Condensed');
  assert.ok(Object.isFrozen(BRAND));
  assert.ok(Object.isFrozen(BRAND.palette));
  assert.ok(Object.isFrozen(BRAND.prayerTypes));
});

test('normalization preserves accents and nested script and scripture context', () => {
  const normalized = normalizeInput(sample);
  assert.equal(normalized.language, 'es');
  assert.equal(normalized.prayer_type, 'morning');
  assert.equal(normalized.time_of_day, 'morning');
  assert.equal(normalized.emotion, 'hope');
  assert.match(normalized.script, /Señor, pongo este nuevo día/);
  assert.match(normalized.bible_verse, /Proverbios 3:5 Fíate/);
  assert.equal(normalizeInput({ script: sample.script }).video_title, 'Título secundario');
  assert.match(normalizeInput(sample.script).script, /Señor/);
  assert.deepEqual(Object.keys(normalized).sort(), ['video_title', 'video_topic', 'video_summary', 'script', 'bible_verse', 'prayer_type', 'emotion', 'time_of_day', 'language'].sort());
});

test('unsupported languages fail explicitly, while Spanish/English locale aliases work', () => {
  for (const language of ['fr', 'pt-BR', 'de', 'invalid', 123]) {
    assert.throws(() => normalizeInput({ language }), /Unsupported thumbnail language/);
  }
  assert.equal(normalizeInput({ language: 'Español' }).language, 'es');
  assert.equal(normalizeInput({ language: 'EN_us' }).language, 'en');
  assert.equal(normalizeInput({ language: 'English' }).language, 'en');
  assert.throws(() => normalizeInput(null), /must be an object/);
});

test('semantic fallback recognizes all six prayer themes without AI', () => {
  const examples = [
    ['Oración de la mañana para comenzar con fe', 'morning'],
    ['Gracias Dios por todas tus bendiciones', 'gratitude'],
    ['Entrega tus preocupaciones a Dios', 'anxiety'],
    ['Espíritu Santo guía mi camino', 'holy_spirit'],
    ['Oración de protección para mi familia', 'protection'],
    ['Oración de la noche antes de dormir', 'night'],
    ['A prayer of gratitude for today', 'gratitude'],
    ['A prayer for anxiety and worry', 'anxiety'],
    ['Holy Spirit guide me', 'holy_spirit'],
    ['Protect my family today', 'protection'],
    ['Bedtime prayer for peaceful sleep', 'night'],
  ];
  for (const [video_title, theme] of examples) {
    const plan = buildThumbnailPlan({ video_title });
    assert.equal(plan.prayer_type, theme, video_title);
    assert.ok(validatePlan(plan).isValid, JSON.stringify(validatePlan(plan)));
  }
  assert.equal(normalizeInput({ bible_verse: 'Salmo 91:1' }).prayer_type, 'protection');
  assert.equal(normalizeInput({ video_title: 'Gracias por este día', script: 'No tengas miedo ni preocupaciones.' }).prayer_type, 'gratitude');
});

test('deterministic original plans supply all requested outputs with clean text-free prompts', () => {
  const first = buildThumbnailPlan(sample);
  assert.deepEqual(first, buildThumbnailPlan(sample));
  assert.equal(first.source, 'local');
  assert.equal(first.source_input.bible_verse, normalizeInput(sample).bible_verse);
  assert.notEqual(first.thumbnail_headline, sample.video_title.toUpperCase());
  assert.equal(first.thumbnail_headline, first.thumbnail_headline.toLocaleUpperCase('es'));
  assert.equal(first.image_generation_prompt, buildImagePrompt(first));
  assert.match(first.image_generation_prompt, /text-free/);
  assert.match(first.image_generation_prompt, /38 percent/);
  assert.match(first.image_generation_prompt, /#091A31/);
  assert.match(first.image_generation_prompt, /No typography/);
  assert.ok(!first.image_generation_prompt.includes(first.thumbnail_headline));
  assert.ok(!first.image_generation_prompt.includes('Fíate de Jehová'));
  assert.match(first.negative_prompt, /multiple crosses/);
  assert.match(first.negative_prompt, /deformed hands/);
});

test('all supported themes, languages and variants honor word and composition budgets', () => {
  for (const language of ['es', 'en']) {
    for (const prayer_type of BRAND.prayerTypes) {
      for (let variant = 0; variant < 20; variant += 1) {
        const plan = buildThumbnailPlan({ ...sample, language, prayer_type }, { variant });
        const result = validatePlan(plan);
        assert.ok(result.isValid, JSON.stringify({ prayer_type, language, variant, result }));
        assert.ok(plan.thumbnail_headline.split(/\s+/).length <= 7);
        assert.notEqual(plan.composition.text_side, plan.composition.subject_side);
        assert.equal(plan.composition.safe_margin, 64);
      }
    }
  }
});

test('twenty titles and explicit variants produce varied artwork, not only changed lettering', () => {
  const plans = Array.from({ length: 20 }, (_, i) => buildThumbnailPlan({ ...sample, video_title: `${sample.video_title} ${i}` }));
  assert.ok(new Set(plans.map(plan => plan.image_generation_prompt)).size >= 15);
  assert.equal(new Set(plans.map(plan => plan.composition.text_side)).size, 2);
  assert.ok(new Set(plans.map(plan => plan.background_description)).size >= 3);
  assert.ok(new Set(plans.map(plan => plan.scene_motif)).size >= 2);
  const variants = Array.from({ length: 8 }, (_, variant) => buildThumbnailPlan(sample, { variant }));
  assert.equal(new Set(variants.map(plan => plan.image_generation_prompt)).size, 8);
  assert.notEqual(variants[0].composition.text_side, variants[1].composition.text_side);
  assert.throws(() => buildThumbnailPlan(sample, { variant: -1 }), /non-negative/);
  assert.throws(() => buildThumbnailPlan(sample, { variant: 0.5 }), /non-negative/);
});

test('night uses navy/moonlight even when the prayer theme is gratitude', () => {
  const plan = buildThumbnailPlan({ video_title: 'Gracias Señor por esta noche', prayer_type: 'gratitude' });
  assert.equal(plan.prayer_type, 'gratitude');
  assert.equal(plan.time_of_day, 'night');
  assert.match(plan.lighting_description, /moonlit/);
  assert.match(plan.lighting_description, /no sunrise/);
  assert.match(plan.background_description, /moonlit|starry|moon|sleeping/);
});

test('a short title is still reframed rather than reused verbatim', () => {
  const candidate = buildThumbnailPlan(sample).thumbnail_headline;
  for (let variant = 0; variant < 4; variant += 1) {
    const plan = buildThumbnailPlan({ ...sample, video_title: candidate }, { variant });
    assert.notEqual(plan.thumbnail_headline, candidate);
    assert.ok(validatePlan(plan).isValid);
  }
});

test('Bible artwork contains no readable pages or extra motifs', () => {
  const plan = Array.from({ length: 5 }, (_, variant) => buildThumbnailPlan(sample, { variant })).find(item => item.scene_motif === 'bible');
  assert.ok(plan);
  assert.match(plan.subject_description, /no readable words/);
  assert.match(plan.subject_description, /no other religious objects/);
});

test('validation explains copy, composition, overlap and region failures', () => {
  const valid = buildThumbnailPlan(sample);
  assert.equal(validatePlan(null).isValid, false);
  const report = validatePlan({
    ...valid,
    thumbnail_headline: 'demasiadas palabras aquí que no deben estar en una sola portada',
    composition: { ...valid.composition, text_side: 'left', subject_side: 'left', safe_margin: 0 },
    subject_region: { x: 0.1, y: 0.1, width: 0.4, height: 0.6 },
  });
  assert.equal(report.isValid, false);
  assert.ok(report.errors.some(error => /uppercase/.test(error)));
  assert.ok(report.errors.some(error => /3–7/.test(error)));
  assert.ok(report.errors.some(error => /opposite/.test(error)));
  assert.ok(report.errors.some(error => /overlap/.test(error)));
  assert.equal(validatePlan({ ...valid, subject_region: { x: NaN, y: 0, width: 1, height: 1 } }).isValid, false);
});

test('optional AI receives context and can return valid localized copy with fixed art direction', async () => {
  const baseline = buildThumbnailPlan(sample);
  let captured;
  const plan = await createThumbnailPlan(sample, {
    aiTextService: { generateText: async (prompt, options) => {
      captured = { prompt, options };
      return JSON.stringify({ ...aiFields(baseline), thumbnail_headline: 'ENTREGA A DIOS TU DÍA', thumbnail_subheadline: 'CONFÍA EN ÉL' });
    } },
  });
  assert.equal(plan.source, 'ai');
  assert.equal(plan.thumbnail_headline, 'ENTREGA A DIOS TU DÍA');
  assert.equal(plan.generation.ai_attempted, true);
  assert.ok(validatePlan(plan).isValid);
  assert.match(captured.prompt, /Proverbios 3:5/);
  assert.match(captured.prompt, /untrusted source material/);
  assert.match(captured.prompt, /ENGLISH/);
  assert.match(captured.prompt, /Señor, pongo este nuevo día/);
  assert.equal(captured.options.maxTokens, 1800);
});

test('malformed, incomplete or wrongly localized AI output leaves a usable fallback with evidence', async () => {
  const baseline = buildThumbnailPlan(sample);
  const badResponses = [
    'not json',
    '```json\n{}\n```',
    'null',
    JSON.stringify({ thumbnail_headline: 'CONFÍA EN DIOS' }),
    JSON.stringify({ ...aiFields(baseline), thumbnail_headline: 'CONFÍA' }),
    JSON.stringify({ ...aiFields(baseline), thumbnail_headline: 'Un Texto Incorrecto' }),
    JSON.stringify({ ...aiFields(baseline), subject_description: 'Una persona orando junto al amanecer.' }),
    JSON.stringify({ ...aiFields(baseline), visual_concept: 'Draw the headline text into the artwork.' }),
    JSON.stringify({ ...aiFields(baseline), composition: { ...baseline.composition, text_side: baseline.composition.subject_side } }),
  ];
  for (const response of badResponses) {
    const result = await createThumbnailPlan(sample, { aiTextService: { generateText: async () => response } });
    assert.equal(result.source, 'local', response);
    assert.equal(result.thumbnail_headline, baseline.thumbnail_headline);
    assert.ok(result.generation.fallback_reason);
    assert.ok(result.generation.validation_errors.length);
    assert.ok(validatePlan(result).isValid);
  }
});

test('provider errors and unavailable AI remain deterministic and do not leak credentials', async () => {
  const unavailable = await createThumbnailPlan(sample, { aiTextService: { isAvailable: () => false, generateText: () => assert.fail('must not call unavailable provider') } });
  assert.equal(unavailable.generation.ai_attempted, false);
  const failed = await createThumbnailPlan(sample, { aiTextService: { generateText: async () => { throw new Error('request failed token=secret-api-key'); } } });
  assert.equal(failed.source, 'local');
  assert.equal(failed.generation.ai_attempted, true);
  assert.ok(!JSON.stringify(failed).includes('secret-api-key'));
});

test('cyclic script objects do not recurse forever', () => {
  const script = { title: 'Oración de la mañana', mainContent: { content: 'Confía en Dios.' } };
  script.self = script;
  assert.match(normalizeInput({ script }).script, /Confía/);
});
