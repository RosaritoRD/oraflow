// node --test tests/storyboard — pure logic, no network, no ffmpeg.
const test = require('node:test');
const assert = require('node:assert/strict');
const { voicePacing, buildNarrationPlan, renderTtsText, splitSentences } = require('../../utils/voice-pacing');
const { buildTiming, estimateWords, alignmentToWords } = require('../../utils/narration-timing');
const { heuristicScenes, alignAiScenes, planShots, normalizeScenes, visualTiming, buildStoryboard } = require('../../utils/storyboard-service');
const captions = require('../../utils/caption-service');

const script = {
  title: 'Understanding Storyboard Creation Tools',
  hook: { text: 'What if you could see your film before shooting a single frame?' },
  introduction: { greeting: 'Storyboard creation tools are software applications designed to help users visualize a narrative sequence.', topicIntro: '', valueProposition: '', credibility: '' },
  mainContent: { sections: [
    { title: 'Key Features and Benefits', content: ['They provide a digital canvas where users can arrange a series of images or sketches. Text descriptions, dialogue and camera notes sit next to each frame.', 'They replace traditional paper-based storyboarding methods with digital workflows.'] },
    { title: 'Who Uses Them', content: ['Filmmakers, animators, game designers and presenters all rely on them to plan scenes before production begins.'] }
  ] },
  conclusion: { recap: ['Plan first, shoot second.'], finalThought: '' },
  callToAction: { subscribe: 'Return tomorrow for another lesson.', like: '', comment: '' }
};

test('voice pacing defaults and env clamp', () => {
  const p = voicePacing();
  assert.equal(p.speed, 0.92);
  assert.equal(voicePacing({ speed: 5 }).speed, 1.2);
  assert.equal(voicePacing({ speed: 'x' }).speed, 0.92);
});

test('narration plan keeps order, drops section headings from speech', () => {
  const plan = buildNarrationPlan(script);
  assert.equal(plan[0].part, 'hook');
  assert.ok(plan.some(p => p.part === 'section' && p.sectionStart && p.sectionTitle === 'Key Features and Benefits'));
  assert.ok(!plan.some(p => /Section \d/.test(p.text)));
  assert.equal(plan[plan.length - 1].part, 'cta');
});

test('tts text carries break tags between sentences and paragraphs', () => {
  const plan = buildNarrationPlan(script);
  const text = renderTtsText(plan, voicePacing());
  assert.match(text, /<break time="0\.18s" \/>/);
  assert.match(text, /<break time="0\.40s" \/>/);
  assert.equal(splitSentences('Hola. ¿Qué tal? Bien… gracias!').length, 4);
});

test('estimated timing covers the duration and respects paragraph pauses', () => {
  const plan = buildNarrationPlan(script);
  const words = estimateWords(plan, 60, { paragraphPauseMs: 400 });
  assert.equal(words[0].start, 0);
  assert.ok(Math.abs(words[words.length - 1].end - 60) < 0.01);
  const firstOfSecond = words.find(w => w.paragraph === 1);
  const lastOfFirst = [...words].reverse().find(w => w.paragraph === 0);
  assert.ok(firstOfSecond.start - lastOfFirst.end >= 0.39);
});

test('alignment maps provider characters to words and skips break tags', () => {
  const plan = [{ index: 0, text: 'Hola mundo. Adiós.', part: 'hook' }];
  const sent = 'Hola mundo. <break time="0.18s" /> Adiós.';
  const chars = sent.split('');
  const alignment = { characters: chars, character_start_times_seconds: chars.map((_, i) => i * 0.1), character_end_times_seconds: chars.map((_, i) => i * 0.1 + 0.1) };
  const words = alignmentToWords(plan, alignment);
  assert.deepEqual(words.map(w => w.text), ['Hola', 'mundo.', 'Adiós.']);
  assert.ok(words[2].start > words[1].end + 1); // the break tag took time
  const timing = buildTiming(plan, { alignment, duration: 5 });
  assert.equal(timing.source, 'elevenlabs');
});

test('heuristic scenes cover every word in order', () => {
  const plan = buildNarrationPlan(script);
  const timing = buildTiming(plan, { duration: 90, pacing: { paragraphPauseMs: 400 } });
  const scenes = heuristicScenes(plan, timing);
  assert.ok(scenes.length >= plan.length);
  assert.equal(scenes[0].wordStart, 0);
  for (let i = 1; i < scenes.length; i += 1) assert.equal(scenes[i].wordStart, scenes[i - 1].wordEnd);
  assert.equal(scenes[scenes.length - 1].wordEnd, timing.words.length);
});

test('AI scenes align by starts_with and fall back when a start is missing', () => {
  const plan = buildNarrationPlan(script);
  const timing = buildTiming(plan, { duration: 90 });
  const scenes = alignAiScenes([
    { paragraph: 2, starts_with: 'They provide a digital canvas', visual_intent: 'creator arranging storyboard frames', stock_queries: ['digital storyboard filmmaker'], preferred_asset: 'video' },
    { paragraph: 2, starts_with: 'Text descriptions, dialogue and camera', visual_intent: 'close up of storyboard notes', stock_queries: ['storyboard close-up'] },
    { paragraph: 2, starts_with: 'nonsense words that do not exist', visual_intent: 'x', stock_queries: [] }
  ], plan, timing);
  const p2 = scenes.filter(s => s.paragraph === 2);
  assert.equal(p2.length, 2);
  assert.equal(p2[0].preferredAssetType, 'video');
  assert.match(p2[1].narration, /^Text descriptions/);
  assert.ok(scenes.filter(s => s.paragraph === 0).length === 1); // paragraphs without AI scenes still get one
});

test('shots follow the timing ranges and never end before the audio', () => {
  const vt = visualTiming();
  const scene = { audioStart: 10, audioEnd: 33.4, stockQueries: ['a', 'b'], visualIntent: 'x', preferredAssetType: 'image', importance: 'normal', sectionStart: true };
  const random = () => 0.5;
  const shots = planShots(scene, vt, random);
  assert.equal(shots[0].start, 10);
  assert.ok(Math.abs(shots[shots.length - 1].end - 33.4) < 0.001);
  for (const shot of shots) assert.ok(shot.duration >= vt.image.min - 0.001 && shot.duration <= vt.hero.max + 0.001, `shot ${shot.duration}`);
  assert.equal(shots[0].transition.type, 'fade');
  assert.equal(shots[1].transition.type, 'cut');
});

test('short scenes merge into the previous one, last scene reaches the end', () => {
  const timing = { duration: 30 };
  const scenes = normalizeScenes([
    { audioStart: 0, audioEnd: 8, narration: 'a', stockQueries: ['q1'], sectionStart: false, wordStart: 0, wordEnd: 3 },
    { audioStart: 8, audioEnd: 10, narration: 'b', stockQueries: ['q2'], sectionStart: false, wordStart: 3, wordEnd: 4 },
    { audioStart: 10, audioEnd: 25, narration: 'c', stockQueries: ['q3'], sectionStart: true, wordStart: 4, wordEnd: 9 }
  ], timing, visualTiming());
  assert.equal(scenes.length, 2);
  assert.equal(scenes[0].narration, 'a b');
  assert.equal(scenes[1].audioEnd, 30);
});

test('full storyboard without AI is contiguous and audio-led', async () => {
  const plan = buildNarrationPlan(script);
  const timing = buildTiming(plan, { duration: 120 });
  const sb = await buildStoryboard({ script, plan, timing, aiTextService: null, seed: 'test' });
  assert.equal(sb.source, 'heuristic');
  const shots = sb.scenes.flatMap(s => s.shots);
  assert.equal(shots[0].start, 0);
  assert.ok(Math.abs(shots[shots.length - 1].end - 120) < 0.01);
  for (let i = 1; i < shots.length; i += 1) assert.ok(Math.abs(shots[i].start - shots[i - 1].end) < 0.002);
  assert.ok(sb.scenes.some(s => s.sectionStart && s.sectionTitle));
  const same = await buildStoryboard({ script, plan, timing, aiTextService: null, seed: 'test' });
  assert.deepEqual(shots.map(s => s.duration), same.scenes.flatMap(s => s.shots).map(s => s.duration)); // deterministic
});

test('captions: 3-8 words, two lines max, minimum on-screen time, lint clean', () => {
  const plan = buildNarrationPlan(script);
  const timing = buildTiming(plan, { duration: 100 });
  const segments = captions.segmentWords(timing.words);
  assert.ok(segments.length > 5);
  for (const s of segments) {
    assert.ok(s.words.length <= 7, `words ${s.words.length}`);
    assert.ok(s.lines.length <= 2);
    assert.ok(s.lines.every(line => line.length <= 30));
  }
  assert.deepEqual(captions.lint(segments), []);
  const ass = captions.toAss(segments, { width: 1920, height: 1080 });
  assert.match(ass, /PlayResX: 1920/);
  assert.match(ass, /Caption,,0,0,0,,\{\\fad\(80,80\)\}[A-ZÁÉÍÓÚÑ]/); // plain uppercase captions by default
  assert.match(captions.toAss(segments, { width: 1920, height: 1080, highlight: true }), /\\c&H0060D9FF/); // opt-in highlight
  const srt = captions.toSrt(segments);
  assert.match(srt, /^1\n00:00:00,000 --> /);
});

test('captions break on long silences', () => {
  const words = [
    { text: 'Uno', start: 0, end: 0.3 }, { text: 'dos', start: 0.35, end: 0.6 }, { text: 'tres', start: 0.65, end: 0.9 },
    { text: 'cuatro', start: 2.0, end: 2.3 }, { text: 'cinco', start: 2.35, end: 2.6 }, { text: 'seis.', start: 2.65, end: 2.9 }
  ];
  const segments = captions.segmentWords(words);
  assert.equal(segments.length, 2);
  assert.equal(segments[0].text, 'Uno dos tres');
});

test('verse cards are located in the timing and hide normal captions', () => {
  const { locateVerseCards } = require('../../utils/storyboard-pipeline');
  const plan = [{ index: 0, text: 'Tu palabra dice: No temas, porque yo estoy contigo. Amén.', part: 'section' }];
  const timing = buildTiming(plan, { duration: 10 });
  const cards = locateVerseCards([{ reference: 'Isaías 41:10', text: 'No temas, porque yo estoy contigo.' }], timing);
  assert.equal(cards.length, 1);
  assert.ok(cards[0].start > 0 && cards[0].end > cards[0].start);
  const segments = captions.segmentWords(timing.words);
  const ass = captions.toAss(segments, { width: 1920, height: 1080, verseCards: cards });
  assert.match(ass, /VerseRef,,0,0,0,,\{\\fad\(300,300\)\}ISAÍAS 41:10/);
  assert.match(ass, /Style: Dim/);
  assert.ok(!/Caption,,0,0,0,,\{\\fad\(80,80\)\}NO TEMAS/.test(ass)); // hidden under the card
});

test('truncated storyboard JSON keeps the complete scenes', () => {
  const { parseScenesJson } = require('../../utils/storyboard-service');
  const cut = '{"scenes":[{"paragraph":0,"starts_with":"What if you","visual_intent":"a","stock_queries":["x"]},{"paragraph":1,"starts_with":"Storyboard creation","visual_intent":"b","stock_queries":["y"]},{"paragraph":2,"starts_with":"They prov';
  const parsed = parseScenesJson(cut);
  assert.equal(parsed.scenes.length, 2);
  assert.equal(parsed.truncated, true);
  assert.equal(parseScenesJson('```json\n{"scenes":[]}\n```').scenes.length, 0);
});

test('editable script round-trips and applies edits', () => {
  const { editableFromScript, scriptFromEditable } = require('../../utils/voice-pacing');
  const editable = editableFromScript(script);
  assert.equal(editable.blocks[0].part, 'hook');
  assert.ok(editable.blocks.some(b => b.part === 'section' && b.sectionTitle === 'Who Uses Them'));
  editable.blocks[0].text = 'A new hook.';
  const section = editable.blocks.find(b => b.part === 'section');
  section.text = 'First paragraph edited.\n\nSecond paragraph added.';
  const next = scriptFromEditable(script, editable);
  assert.equal(next.hook.text, 'A new hook.');
  assert.deepEqual(next.mainContent.sections[0].content, ['First paragraph edited.', 'Second paragraph added.']);
  assert.equal(next.mainContent.sections.length, 2);
  assert.equal(buildNarrationPlan(next)[0].text, 'A new hook.');
});

test('blocklist and people detection on stock metadata', () => {
  const { isBlocked, showsPeople } = require('../../utils/storyboard-pipeline');
  assert.equal(isBlocked({ title: 'Two women kissing at sunset', keywords: [] }), true);
  assert.equal(isBlocked({ title: 'Sunrise over misty lake', keywords: ['nature'] }), false);
  assert.equal(showsPeople({ title: 'Woman praying by the window' }), true);
  assert.equal(showsPeople({ title: 'Forest path in the morning' }), false);
});

test('calm pace uses longer shots', () => {
  const { PACE_PRESETS } = require('../../utils/storyboard-service');
  assert.ok(PACE_PRESETS.calm.image.min > PACE_PRESETS.explainer.image.max);
  process.env.VISUAL_PACE = 'calm';
  const shots = planShots({ audioStart: 0, audioEnd: 40, stockQueries: ['a'], visualIntent: 'x', preferredAssetType: 'image', importance: 'normal' }, visualTiming(), () => 0.5);
  delete process.env.VISUAL_PACE;
  assert.ok(shots.length <= 4 && shots.every(s => s.duration >= 8));
});

// 02/10/2026: «clips of 15 seconds each». The knob no longer stretches videos (+15
// %) or heroes (+40 %): every clip lands around the requested value, with room to
// cut at the end of a sentence.
test('VISUAL_SHOT_SECONDS: every clip is around that value (image, video and hero)', () => {
  process.env.VISUAL_SHOT_SECONDS = '15';
  const vt = visualTiming();
  delete process.env.VISUAL_SHOT_SECONDS;
  for (const tipo of ['image', 'video', 'hero']) {
    assert.equal(vt[tipo].target, 15, tipo);
    assert.ok(vt[tipo].min >= 12 && vt[tipo].max <= 19, `${tipo}: ${vt[tipo].min}-${vt[tipo].max}`);
  }
});

test('Shorts: SHORT_SHOT_SECONDS gives its own clip length; without it, the usual 5 s', () => {
  const { shortShots } = require('../../utils/storyboard-pipeline');
  assert.equal(shortShots({}).image.target, 5);
  const s = shortShots({ SHORT_SHOT_SECONDS: '15' });
  for (const tipo of ['image', 'video', 'hero']) {
    assert.equal(s[tipo].target, 15);
    assert.ok(s[tipo].min >= 10 && s[tipo].max <= 19);
  }
  assert.equal(shortShots({ SHORT_SHOT_SECONDS: 'basura' }).image.target, 5);
});

test('scene replacement prefers unused, non-blocked stock', async () => {
  const { SceneRepairService } = require('../../utils/scene-repair-service');
  const used = 'asset_used';
  const candidates = [
    { id: used, source: 'pexels', type: 'video', title: 'sunrise valley', keywords: [], width: 1920, height: 1080 },
    { id: 'asset_kiss', source: 'pexels', type: 'video', title: 'couple kissing at sunrise', keywords: [], width: 1920, height: 1080 },
    { id: 'asset_new', source: 'pexels', type: 'video', title: 'empty church sunbeams', keywords: ['church'], width: 1920, height: 1080 }
  ];
  const storyboard = { aspectRatio: '16:9', scenes: [{ id: 'scene_1', order: 0, visualIntent: 'empty church interior with sunbeams', stockQueries: ['empty church interior'], preferredAssetType: 'video', shots: [{ selectedAsset: { assetId: used } }] }] };
  const saved = [];
  const db = {
    getProductionStoryboard: async () => ({ storyboard, timing: null, captions: null, qa: null }),
    saveProductionStoryboard: async (id, payload) => saved.push(payload)
  };
  const stock = {
    isAvailable: async () => true,
    search: async ({ excludeIds }) => candidates.filter(c => !excludeIds.has(c.id)),
    score: asset => (asset.id === 'asset_new' ? 80 : 70),
    download: async asset => `/tmp/${asset.id}.mp4`
  };
  const svc = new SceneRepairService(db, {}, { logger: { info() {}, warn() {}, error() {} }, stockMedia: stock, dataRoot: '/tmp' });
  const result = await svc.replaceSceneStock('prod_1', { id: 'scene_1', position: 0, duration: 8, stockQueries: ['empty church interior'], visualIntent: 'empty church interior with sunbeams' });
  assert.equal(result.assetType, 'video');
  assert.equal(result.externalTaskId, 'asset_new');   // not the used one, not the blocked one
  assert.equal(saved.length, 1);
  assert.equal(storyboard.scenes[0].shots[0].selectedAsset.assetId, 'asset_new');
});

test('bible references are shown with digits', () => {
  const { normalizeReference, digitizeReferences } = require('../../utils/bible-reference');
  assert.equal(normalizeReference('Salmo ciento veintiuno, versículos siete y ocho'), 'Salmo 121:7-8');
  assert.equal(normalizeReference('Juan tres dieciséis'), 'Juan 3:16');
  assert.equal(normalizeReference('Isaías cuarenta y uno, versículo diez'), 'Isaías 41:10');
  assert.equal(normalizeReference('Filipenses cuatro, versículos seis y siete'), 'Filipenses 4:6-7');
  assert.equal(normalizeReference('Salmo 121:7-8'), 'Salmo 121:7-8');
  assert.equal(normalizeReference('Psalm one hundred twenty-one, verse seven'), 'Psalm 121:7');
  assert.equal(normalizeReference('Salmo veintitrés'), 'Salmo 23');
  assert.equal(normalizeReference('Una oración'), 'Una oración');              // no chapter → untouched
  assert.equal(digitizeReferences('Tu palabra en Salmo ciento veintiuno, versículo siete dice así.'),
    'Tu palabra en Salmo 121:7 dice así.');
  assert.equal(digitizeReferences('Señor, hoy te entrego mis temores y mi cansancio.'),
    'Señor, hoy te entrego mis temores y mi cansancio.');                      // no reference → untouched
});

test('the shot cache only invalidates what changes', () => {
  const { claveDePlano } = require('../../utils/timeline-renderer');
  const dim = { width: 1920, height: 1080, fps: 30 };
  const base = { duration: 12, visualMotion: { type: 'zoom-in' }, selectedAsset: { localPath: '/no/existe.mp4' } };
  const k = s => claveDePlano(s, 0, dim, { duration: 0.5 });

  assert.equal(k(base), k({ ...base }));                                            // igual → misma clave
  assert.notEqual(k(base), k({ ...base, duration: 13 }));                           // different duration → redo
  assert.notEqual(k(base), k({ ...base, visualMotion: { type: 'pan-left' } }));     // otro movimiento → rehacer
  assert.notEqual(k(base), k({ ...base, selectedAsset: { localPath: '/otro.mp4' } })); // otro clip → rehacer
  assert.notEqual(k(base), claveDePlano(base, 0, { ...dim, height: 720 }, { duration: 0.5 })); // different resolution
  assert.notEqual(k(base), claveDePlano(base, 0, dim, { duration: 0.8 }));          // different transition → redo
});

test('the description is built in layers and keeps the order', () => {
  const { componeDescripcion } = require('../../agents/seo-optimizer-agent');
  process.env.DESCRIPTION_INTRO = '¡Bienvenido!\\nSegunda línea.';
  process.env.DESCRIPTION_FOOTER = 'Música: X\\nLicencia: Y';
  const d = componeDescripcion('Cuerpo de la oración.\n\nEscribe "Amén".', ['oracion', '#salmo121', 'fe']);
  const bloques = d.split('\n\n');
  assert.equal(bloques[0], '¡Bienvenido!');                        // \n from .env → its own paragraph
  assert.equal(bloques[1], 'Segunda línea.');
  assert.equal(bloques[2], 'Cuerpo de la oración.');
  assert.match(d, /Licencia: Y\n\n#oracion #salmo121 #fe$/);        // hashtags at the end, # added where missing
  delete process.env.DESCRIPTION_INTRO; delete process.env.DESCRIPTION_FOOTER;
  assert.equal(componeDescripcion('Solo cuerpo.', []), 'Solo cuerpo.');
});

test('the loud thumbnail splits the title and adds the date', () => {
  const t = require('../../utils/prayer-theme');
  const svg = t.thumbnailLoudSvg('Cubre a mi familia hoy, Señor | Oración de Protección',
    { date: 'miércoles 23 de septiembre' });
  assert.match(svg, /ORACIÓN DE PROTECCIÓN/);         // the header comes from the right side of the |
  assert.match(svg, /CUBRE A MI FAMILIA/);            // the body, in capitals
  assert.match(svg, /MIÉRCOLES 23 DE SEPTIEMBRE/);
  assert.match(svg, /url\(#oro\)/);                   // relleno dorado
  assert.match(svg, /stroke: #12080b/);               // borde negro
  assert.ok(!/MIÉRCOLES/.test(t.thumbnailLoudSvg('Título', {})));   // no date unless requested
  const largo = t.thumbnailLoudSvg('Una oración muy larga para pedir protección sobre toda la familia y el hogar entero', {});
  assert.ok((largo.match(/class="gordo"/g) || []).length <= 3);     // at most 3 lines
  assert.match(t.fechaEnEspanol(new Date('2026-09-23T15:00:00Z')), /^miércoles 23 de septiembre$/);
});

test('the title date comes out in Spanish and in the channel\'s time zone', () => {
  const { fechaDeHoy } = require('../../agents/seo-optimizer-agent');
  process.env.CONTENT_LANGUAGE = 'es'; process.env.CHANNEL_TIMEZONE = 'America/New_York';
  // 04:00 UTC on the 24th is still the night of the 23rd in New York.
  assert.equal(fechaDeHoy(new Date('2026-09-24T02:00:00Z')), 'MIÉRCOLES 23 DE SEPTIEMBRE');
  assert.equal(fechaDeHoy(new Date('2026-09-23T15:00:00Z')), 'MIÉRCOLES 23 DE SEPTIEMBRE');
  process.env.CONTENT_LANGUAGE = 'en';
  assert.match(fechaDeHoy(new Date('2026-09-23T15:00:00Z')), /^WEDNESDAY, SEPTEMBER 23$/);
  process.env.CONTENT_LANGUAGE = 'es';
});

test('the thumbnail background depends on the time and is nature only', () => {
  const bg = require('../../utils/background-picker');
  process.env.CHANNEL_TIMEZONE = 'America/New_York';
  // 13:00 UTC = 9:00 in New York → morning
  assert.equal(bg.franja(new Date('2026-09-23T13:00:00Z')), 'manana');
  // 02:00 UTC = 22:00 the previous day in New York → night
  assert.equal(bg.franja(new Date('2026-09-24T02:00:00Z')), 'noche');

  const manana = bg.consultas(new Date('2026-09-23T13:00:00Z'));
  const noche = bg.consultas(new Date('2026-09-24T02:00:00Z'));
  assert.equal(manana.momento, 'manana');
  assert.match(manana.queries[0], /sunrise|morning|dawn|golden hour|sunlight/i);
  assert.match(noche.queries[0], /night|moonlight|starry|dusk/i);
  assert.equal(manana.queries.length, 3);                       // uno principal + dos de respaldo

  // the place rotates with the day of the year
  const a = bg.lugarDelDia(new Date('2026-09-23T13:00:00Z')).nombre;
  const b = bg.lugarDelDia(new Date('2026-09-24T13:00:00Z')).nombre;
  assert.notEqual(a, b);

  assert.equal(bg.esNatural({ title: 'Sunrise over calm beach', keywords: ['sea'] }), true);
  assert.equal(bg.esNatural({ title: 'Woman working in a modern office', keywords: [] }), false);
  assert.equal(bg.esNatural({ title: 'Morning light', keywords: ['desk', 'laptop'] }), false);
});

test('the video\'s B-roll also drops offices when ONLY_NATURE is on', () => {
  const { blocklist, isBlocked } = require('../../utils/storyboard-pipeline');
  process.env.ONLY_NATURE = 'on';
  const terminos = blocklist();
  assert.ok(terminos.includes('office'));
  assert.equal(isBlocked({ title: 'Team meeting at the office', keywords: [] }, terminos), true);
  assert.equal(isBlocked({ title: 'River in the forest at dawn', keywords: [] }, terminos), false);
  process.env.ONLY_NATURE = 'off';
  assert.ok(!blocklist().includes('office'));
  delete process.env.ONLY_NATURE;
});

test('the channel logo is only used if it really exists', async () => {
  const { logoDelCanal } = require('../../utils/background-picker');
  delete process.env.CHANNEL_LOGO;
  const sinLogo = await logoDelCanal();
  assert.ok(sinLogo === null || typeof sinLogo === 'string');   // depending on whether the file exists
  // A CHANNEL_LOGO that doesn't exist doesn't break anything: it falls back to the
  // channel's default logo, and only returns null when there isn't one either.
  process.env.CHANNEL_LOGO = '/no/existe/logo.png';
  const conRutaMala = await logoDelCanal();
  assert.ok(conRutaMala === null || conRutaMala.endsWith('marca/logo.png'));
  delete process.env.CHANNEL_LOGO;
});

test('the AI background turns off without a key and falls back to the image bank', async () => {
  const bg = require('../../utils/background-picker');
  const clave = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  assert.equal(await bg.generaFondoIA({ titulo: 'x' }), null);          // no key → null
  process.env.OPENAI_API_KEY = 'sk-test';
  process.env.THUMBNAIL_AI = 'off';
  assert.equal(await bg.generaFondoIA({ titulo: 'x' }), null);          // apagado → null
  delete process.env.THUMBNAIL_AI;
  // key but a failing API → null, never throws
  const roto = { images: { generate: async () => { throw new Error('402 sin saldo'); } } };
  assert.equal(await bg.generaFondoIA({ titulo: 'x', openai: roto, logger: { warn() {} } }), null);
  if (clave) process.env.OPENAI_API_KEY = clave; else delete process.env.OPENAI_API_KEY;
});

test('temperature isn\'t sent to models that reject it', async () => {
  const { AITextService } = require('../../utils/ai-text-service');
  const vistos = [];
  const fake = { chat: { completions: { create: async (p) => { vistos.push(p); return { choices: [{ message: { content: 'ok' } }] }; } } } };

  const s = new AITextService({});
  s.client = fake; s.gemini = null; s.providerName = 'test';

  s.model = 'gpt-5.6';
  await s.generateText('hola', { temperature: 0.4 });
  assert.equal(vistos[0].temperature, undefined, 'gpt-5.x no admite temperature');

  s.model = 'gpt-4o-mini';
  await s.generateText('hola', { temperature: 0.4 });
  assert.equal(vistos[1].temperature, 0.4, 'los modelos antiguos sí la admiten');

  // If the provider complains anyway, it retries without temperature.
  let primera = true;
  s.model = 'modelo-raro';
  s.client = { chat: { completions: { create: async (p) => {
    if (primera) { primera = false; throw new Error("Unsupported value: 'temperature' does not support 0.4"); }
    vistos.push(p); return { choices: [{ message: { content: 'ok' } }] };
  } } } };
  await s.generateText('hola', { temperature: 0.4 });
  assert.equal(vistos[2].temperature, undefined, 'el reintento va sin temperature');
});

// 03/10/2026: Bible references are read in full by the voice (and therefore in the
// captions and timings, which come from the same plan) only in Spanish.
test('the narration plan reads Bible references in Spanish', () => {
  const es = { hook: { text: 'Tu Palabra dice en el Salmo 5:3: «Oh Jehová, de mañana oirás mi voz».' }, mainContent: { sections: [] } };
  assert.equal(buildNarrationPlan(es, { language: 'es' })[0].text,
    'Tu Palabra dice en el Salmo cinco, versículo tres: «Oh Jehová, de mañana oirás mi voz».');
  assert.equal(buildNarrationPlan(es, { language: 'en' })[0].text, es.hook.text, 'en inglés no se toca');
});
