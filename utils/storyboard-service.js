/**
 * Storyboard: turn the narration plan + word timing into semantic scenes, and
 * each scene into one or more visual "shots" whose length follows the
 * visualTiming ranges. The narration audio is the source of truth: shots are
 * laid over the audio, never the other way round.
 *
 * scene  = one idea (visual intent, stock queries, preferred asset type)
 * shot   = one visual on screen (asset, motion, transition, start/end)
 */
const crypto = require('crypto');
const { tokenizeWords } = require('./narration-timing');
const { splitSentences } = require('./voice-pacing');
const { lienzo } = require('./formato');

const VISUAL_TIMING = Object.freeze({
  image: { min: 4, target: 5, max: 7 },
  video: { min: 5, target: 6, max: 9 },
  hero: { min: 7, target: 8, max: 10 } // "important" visuals that need reading time
});

/**
 * Pace presets. 'explainer' = documentary rhythm; 'calm' = prayer/meditation:
 * fewer, longer shots so the picture breathes with the voice.
 */
const PACE_PRESETS = Object.freeze({
  explainer: VISUAL_TIMING,
  calm: Object.freeze({
    image: { min: 10, target: 14, max: 19 },
    video: { min: 12, target: 16, max: 22 },
    hero: { min: 15, target: 20, max: 26 }
  })
});

function visualPace() {
  const explicit = String(process.env.VISUAL_PACE || '').toLowerCase();
  if (PACE_PRESETS[explicit]) return explicit;
  return String(process.env.CHANNEL_THEME || '').toLowerCase() === 'prayer' ? 'calm' : 'explainer';
}

const MOTIONS = ['zoom-in', 'zoom-out', 'pan-left', 'pan-right'];
const STOPWORDS = new Set(('a al algo ante bajo cabe con contra de del desde durante en entre hacia hasta mediante para por según sin so sobre tras y o u e ni que como cuando donde el la los las un una unos unas lo le les se su sus mi mis tu tus te me nos os es son era eran fue fueron ser estar está están hay he ha han muy más menos pero aunque porque si ya no sí este esta estos estas ese esa esos esas aquel aquella the a an and or but of to in on at for with from by as is are was were be been being this that these those it its it\'s they them their we our you your i my he she his her not no yes very more most less than then so if when where how what which who whom into onto over under about after before while can could may might will would shall should do does did have has had').split(' '));

/** Ranges where every clip type aims at `t` seconds (min 0.8t, max 1.2t; hero up to 1.25t). */
function rangosDeClip(t) {
  return {
    image: { min: Math.round(t * 0.8), target: t, max: Math.round(t * 1.2) },
    video: { min: Math.round(t * 0.8), target: t, max: Math.round(t * 1.2) },
    hero: { min: Math.round(t * 0.85), target: t, max: Math.round(t * 1.25) }
  };
}

function visualTiming(overrides = {}) {
  const merged = JSON.parse(JSON.stringify(PACE_PRESETS[visualPace()]));
  // Single knob: VISUAL_SHOT_SECONDS=15 → every clip ~15 s (02/10/2026, el autor:
  // «clips de 15 segundos cada uno»). Before, videos ran +15 % and heroes +40 %
  // (up to 27 s). The margin lets a cut land on the end of a sentence.
  const knob = Number(process.env.VISUAL_SHOT_SECONDS);
  if (Number.isFinite(knob) && knob >= 3) Object.assign(merged, rangosDeClip(Math.min(40, knob)));
  for (const key of Object.keys(overrides || {})) {
    if (merged[key]) Object.assign(merged[key], overrides[key]);
  }
  return merged;
}

function keywords(text, limit = 6) {
  const counts = new Map();
  for (const raw of tokenizeWords(String(text || '').toLowerCase())) {
    const word = raw.replace(/[^\p{L}\p{N}-]/gu, '');
    if (word.length < 4 || STOPWORDS.has(word)) continue;
    counts.set(word, (counts.get(word) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([word]) => word);
}

/** Deterministic seed so a storyboard renders the same way twice. */
function seeded(seed) {
  let state = crypto.createHash('md5').update(String(seed)).digest().readUInt32LE(0) || 1;
  return () => {
    state ^= state << 13; state >>>= 0;
    state ^= state >> 17;
    state ^= state << 5; state >>>= 0;
    return state / 0xffffffff;
  };
}

// ---------------------------------------------------------------------------
// 1) Scenes from the narration plan
// ---------------------------------------------------------------------------

/**
 * Fallback without AI: sentences grouped into ~6-12 s chunks inside each
 * paragraph, visual intent = the sentence itself, queries from keywords.
 */
function heuristicScenes(plan, timing) {
  const scenes = [];
  for (const paragraph of plan) {
    const indexes = [];
    timing.words.forEach((word, index) => { if (word.paragraph === paragraph.index) indexes.push(index); });
    if (!indexes.length) continue;
    const sentences = splitSentences(paragraph.text);
    let cursor = 0; // paragraph-relative word offset
    let group = { sentences: [], from: 0 };
    const flush = () => {
      if (!group.sentences.length) return;
      const text = group.sentences.join(' ');
      scenes.push({
        paragraph: paragraph.index,
        wordStart: indexes[group.from],
        wordEnd: indexes[Math.min(indexes.length, cursor) - 1] + 1,
        narration: text,
        visualIntent: text,
        stockQueries: [keywords(text, 3).join(' '), keywords(text, 5).slice(1).join(' ')].filter(Boolean),
        preferredAssetType: 'image',
        importance: 'normal'
      });
      group = { sentences: [], from: cursor };
    };
    for (const sentence of sentences) {
      const count = tokenizeWords(sentence).length;
      const spanStart = timing.words[indexes[group.from]]?.start ?? 0;
      const spanEnd = timing.words[indexes[Math.min(indexes.length - 1, cursor + count - 1)]]?.end ?? spanStart;
      if (group.sentences.length && spanEnd - spanStart > (visualPace() === 'calm' ? 25 : 10)) flush();
      group.sentences.push(sentence);
      cursor = Math.min(indexes.length, cursor + count);
    }
    flush();
  }
  return scenes;
}

function storyboardPrompt(plan, context = {}) {
  const language = context.language || process.env.CONTENT_LANGUAGE || 'en';
  const calm = visualPace() === 'calm';
  const paragraphs = plan.map(p => `#${p.index}${p.sectionTitle && p.sectionStart ? ` [SECTION: ${p.sectionTitle}]` : ''}: ${p.text}`).join('\n');
  return `You are a documentary storyboard editor. Split this narration into visual scenes.
Rules:
- A scene is ONE concrete visual idea, roughly ${calm ? '15 to 35 seconds of speech (about 35-90 words)' : '5 to 15 seconds of speech (about 12-40 words)'}. Split by meaning and concept changes, not just by sentence.${calm ? '\n- This is a calm prayer/meditation video: prefer LANDSCAPES and atmosphere — skies, sunrise, mountains, sea, forests, fields, rivers, light through windows, candles, an open Bible, empty churches, quiet roads. People may appear in at most one scene out of four, always distant or from behind, never a close-up of a face, never romance or couples. Every scene is an OUTDOOR NATURAL place — forest, beach, river, mountain, field, lake, waterfall, sky — or a quiet church, an open Bible, a candle. Never an office, a desk, a computer, a city street or any workplace.' : ''}
- Scenes must cover the narration in order, without gaps or overlaps. Never rewrite the narration.
- For each scene give a visual_intent: what a viewer should SEE (a subject, an action, a setting), written in English for image search. Not the words of the narration — the picture behind them. Bad: "modify share visual plan aligned". Good: "creative team reviewing a storyboard together".
- Give 3 to 5 stock_queries in English: short, concrete, searchable, varied (different subjects/angles), no abstract words.
- preferred_asset: "video" when motion helps (people doing things, places, processes), "image" for portraits, objects, still moods.
- importance: "hero" only for the 1-2 scenes that deserve more screen time.
- Vary the subjects across scenes: avoid five scenes of "person at computer".
${context.visualStyle ? `- Channel visual style to respect: ${context.visualStyle}` : ''}
Narration language: ${language}. Paragraphs are numbered; a scene never spans two paragraphs.

Return ONLY JSON: {"scenes":[{"paragraph":0,"starts_with":"first 4-6 words of the scene exactly as written","visual_intent":"...","stock_queries":["...","..."],"preferred_asset":"video|image","importance":"normal|hero"}]}

NARRATION:
${paragraphs}`;
}

/**
 * Parse the model's JSON; if the output was cut off, keep every complete scene
 * object (the alignment step fills the rest of the narration from the last
 * placed scene onwards).
 */
function parseScenesJson(response) {
  const text = String(response || '').replace(/^```(?:json)?/m, '').replace(/```$/m, '').trim();
  try {
    return JSON.parse(text);
  } catch (error) {
    const start = text.indexOf('[');
    if (start === -1) throw error;
    const scenes = [];
    let depth = 0;
    let objStart = -1;
    let inString = false;
    for (let i = start + 1; i < text.length; i += 1) {
      const ch = text[i];
      if (inString) { if (ch === '\\') i += 1; else if (ch === '"') inString = false; continue; }
      if (ch === '"') inString = true;
      else if (ch === '{') { if (depth === 0) objStart = i; depth += 1; }
      else if (ch === '}') {
        depth -= 1;
        if (depth === 0 && objStart !== -1) {
          try { scenes.push(JSON.parse(text.slice(objStart, i + 1))); } catch { /* skip broken object */ }
          objStart = -1;
        }
      }
    }
    if (!scenes.length) throw error;
    return { scenes, truncated: true };
  }
}

function normalizeToken(word) {
  return String(word || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}

/** Map AI scenes (paragraph + starts_with) onto absolute word indexes. */
function alignAiScenes(aiScenes, plan, timing) {
  const scenes = [];
  const byParagraph = new Map();
  timing.words.forEach((word, index) => {
    if (!byParagraph.has(word.paragraph)) byParagraph.set(word.paragraph, []);
    byParagraph.get(word.paragraph).push(index);
  });

  const sorted = (Array.isArray(aiScenes) ? aiScenes : []).filter(s => s && Number.isInteger(Number(s.paragraph)));
  for (const paragraph of plan) {
    const indexes = byParagraph.get(paragraph.index) || [];
    if (!indexes.length) continue;
    const own = sorted.filter(s => Number(s.paragraph) === paragraph.index);
    const starts = [];
    let searchFrom = 0;
    for (const scene of own) {
      const lead = tokenizeWords(scene.starts_with || '').map(normalizeToken).filter(Boolean).slice(0, 3);
      let found = -1;
      if (lead.length) {
        for (let i = searchFrom; i < indexes.length; i += 1) {
          const ok = lead.every((token, k) => normalizeToken(timing.words[indexes[i + k]]?.text) === token);
          if (ok) { found = i; break; }
        }
      }
      if (found === -1) continue; // could not place: merge into the previous scene
      if (starts.length && found <= starts[starts.length - 1].at) continue;
      starts.push({ at: found, scene });
      searchFrom = found + 1;
    }
    if (!starts.length || starts[0].at !== 0) {
      starts.unshift({ at: 0, scene: starts[0]?.scene || own[0] || { visual_intent: paragraph.text, stock_queries: [keywords(paragraph.text, 3).join(' ')] } });
    }
    starts.forEach((entry, i) => {
      const wordStart = indexes[entry.at];
      const wordEnd = i + 1 < starts.length ? indexes[starts[i + 1].at] : indexes[indexes.length - 1] + 1;
      const text = timing.words.slice(wordStart, wordEnd).map(w => w.text).join(' ');
      const s = entry.scene || {};
      scenes.push({
        paragraph: paragraph.index,
        wordStart, wordEnd,
        narration: text,
        visualIntent: String(s.visual_intent || text).trim(),
        stockQueries: [...new Set((Array.isArray(s.stock_queries) ? s.stock_queries : []).map(q => String(q).trim()).filter(Boolean))].slice(0, 5),
        preferredAssetType: s.preferred_asset === 'video' ? 'video' : 'image',
        importance: s.importance === 'hero' ? 'hero' : 'normal'
      });
    });
  }
  return scenes;
}

// ---------------------------------------------------------------------------
// 2) Shots: lay visuals over the audio
// ---------------------------------------------------------------------------

function pickDuration(range, random) {
  // jittered around target so the cut rhythm never repeats exactly
  const spread = Math.min(range.target - range.min, range.max - range.target);
  return range.target + (random() * 2 - 1) * spread;
}

function planShots(scene, timing, random) {
  const range = scene.importance === 'hero' ? timing.hero : timing[scene.preferredAssetType] || timing.image;
  const length = scene.audioEnd - scene.audioStart;
  const count = Math.max(1, Math.round(length / range.target));
  const shots = [];
  let cursor = scene.audioStart;
  for (let i = 0; i < count; i += 1) {
    const remaining = scene.audioEnd - cursor;
    const left = count - i - 1;
    let duration = i === count - 1 ? remaining : pickDuration(range, random);
    // keep enough for the remaining shots and never below the minimum
    duration = Math.min(duration, remaining - left * range.min);
    duration = Math.max(range.min, duration);
    if (i === count - 1 || cursor + duration > scene.audioEnd) duration = remaining;
    shots.push({
      id: `shot_${crypto.randomUUID()}`,
      order: i,
      start: Number(cursor.toFixed(3)),
      end: Number((cursor + duration).toFixed(3)),
      duration: Number(duration.toFixed(3)),
      query: scene.stockQueries[i % Math.max(1, scene.stockQueries.length)] || scene.visualIntent,
      preferredAssetType: scene.preferredAssetType,
      visualMotion: { type: scene.preferredAssetType === 'video' ? 'none' : MOTIONS[Math.floor(random() * MOTIONS.length)] },
      transition: { type: i === 0 ? (scene.sectionStart ? 'fade' : 'crossfade') : 'cut', duration: i === 0 ? (scene.sectionStart ? 0.8 : 0.5) : 0.05 },
      selectedAsset: null
    });
    cursor += duration;
  }
  return shots;
}

/**
 * Merge scenes shorter than the minimum into a neighbour (never across a
 * section start), then extend the last scene to the end of the audio.
 */
function normalizeScenes(scenes, timing, vt) {
  const minLength = vt.image.min;
  const out = [];
  for (const scene of scenes) {
    const previous = out[out.length - 1];
    const length = scene.audioEnd - scene.audioStart;
    if (previous && length < minLength && !scene.sectionStart) {
      previous.audioEnd = scene.audioEnd;
      previous.wordEnd = scene.wordEnd;
      previous.narration = `${previous.narration} ${scene.narration}`;
      previous.stockQueries = [...new Set([...previous.stockQueries, ...scene.stockQueries])].slice(0, 5);
      continue;
    }
    out.push({ ...scene });
  }
  if (out.length) out[out.length - 1].audioEnd = Math.max(out[out.length - 1].audioEnd, timing.duration);
  return out;
}

async function buildStoryboard({ script, plan, timing, aiTextService = null, logger = null, context = {}, visualTimingOverrides = {}, seed = null, format = null }) {
  const vt = visualTiming(visualTimingOverrides);
  const random = seeded(seed || script?.title || 'storyboard');
  logger?.info?.(`Storyboard pace: ${visualPace()} (image ${vt.image.min}-${vt.image.max}s, video ${vt.video.min}-${vt.video.max}s)`);
  let raw = null;
  let source = 'heuristic';

  if (aiTextService?.isAvailable?.()) {
    try {
      // ~40 tokens per scene; a 10-minute script has 60-90 scenes.
      const budget = Math.min(16000, Math.max(4000, plan.reduce((sum, p) => sum + tokenizeWords(p.text).length, 0) * 3));
      const response = await aiTextService.generateText(storyboardPrompt(plan, context), { maxTokens: budget, temperature: 0.4 });
      const json = parseScenesJson(response);
      const aligned = alignAiScenes(json.scenes, plan, timing);
      if (aligned.length) { raw = aligned; source = 'ai'; }
    } catch (error) {
      logger?.warn?.(`AI storyboard failed, using heuristic split: ${error.message}`);
    }
  }
  if (!raw) raw = heuristicScenes(plan, timing);

  // timing per scene from word timestamps; a scene owns the silence after it
  const withTimes = raw.map((scene, i) => {
    const first = timing.words[scene.wordStart];
    const nextStart = raw[i + 1] ? timing.words[raw[i + 1].wordStart]?.start : timing.duration;
    const paragraph = plan[scene.paragraph] || {};
    return {
      ...scene,
      audioStart: Number((first?.start ?? 0).toFixed(3)),
      audioEnd: Number((nextStart ?? timing.duration).toFixed(3)),
      part: paragraph.part || 'section',
      sectionTitle: paragraph.sectionTitle || null,
      sectionStart: Boolean(paragraph.sectionStart) && scene.wordStart === timing.words.findIndex(w => w.paragraph === scene.paragraph)
    };
  });
  if (withTimes.length) withTimes[0].audioStart = 0;

  const scenes = normalizeScenes(withTimes, timing, vt).map((scene, order) => ({
    id: `scene_${crypto.randomUUID()}`,
    order,
    ...scene,
    duration: Number((scene.audioEnd - scene.audioStart).toFixed(3)),
    shots: planShots(scene, vt, random),
    captions: []
  }));

  return {
    version: 1,
    source,
    ...lienzo(format),
    format: format || 'long',
    fps: 30,
    duration: timing.duration,
    timingSource: timing.source,
    visualTiming: vt,
    scenes
  };
}

function allShots(storyboard) {
  return (storyboard?.scenes || []).flatMap(scene => scene.shots.map(shot => ({ ...shot, sceneId: scene.id, sceneOrder: scene.order })));
}

module.exports = { rangosDeClip, buildStoryboard, heuristicScenes, alignAiScenes, parseScenesJson, visualPace, PACE_PRESETS, planShots, normalizeScenes, visualTiming, keywords, allShots, VISUAL_TIMING, MOTIONS, storyboardPrompt };
