/**
 * Voice pacing: central config for narration speed and pauses, plus the
 * "narration plan" — the ordered list of paragraphs the narrator actually reads.
 *
 * The plan is the single source of truth for TTS text, captions and the
 * storyboard: everything downstream indexes into the same paragraphs, so
 * timestamps returned by the TTS provider line up with the script structure.
 *
 * Env overrides: VOICE_SPEED (0.7-1.2), VOICE_SENTENCE_PAUSE_MS,
 * VOICE_PARAGRAPH_PAUSE_MS, VOICE_STABILITY, VOICE_SIMILARITY, VOICE_STYLE.
 */

const { leeCitasBiblicas, esEspanol } = require('./citas-biblicas');
const { suavizaPalabras } = require('./palabras-dificiles');

const DEFAULTS = Object.freeze({
  speed: 0.92,
  sentencePauseMs: 180,
  paragraphPauseMs: 400,
  stability: 0.55,
  similarityBoost: 0.8,
  style: 0.0
});

function clamp(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function voicePacing(overrides = {}) {
  return {
    speed: clamp(overrides.speed ?? process.env.VOICE_SPEED, 0.7, 1.2, DEFAULTS.speed),
    sentencePauseMs: clamp(overrides.sentencePauseMs ?? process.env.VOICE_SENTENCE_PAUSE_MS, 0, 1500, DEFAULTS.sentencePauseMs),
    paragraphPauseMs: clamp(overrides.paragraphPauseMs ?? process.env.VOICE_PARAGRAPH_PAUSE_MS, 0, 3000, DEFAULTS.paragraphPauseMs),
    stability: clamp(overrides.stability ?? process.env.VOICE_STABILITY, 0, 1, DEFAULTS.stability),
    similarityBoost: clamp(overrides.similarityBoost ?? process.env.VOICE_SIMILARITY, 0, 1, DEFAULTS.similarityBoost),
    style: clamp(overrides.style ?? process.env.VOICE_STYLE, 0, 1, DEFAULTS.style)
  };
}

/** Split text into sentences, keeping the terminal punctuation. */
function splitSentences(text) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  const parts = clean.match(/[^.!?…]+[.!?…]+["»”)]?|[^.!?…]+$/g) || [clean];
  return parts.map(part => part.trim()).filter(Boolean);
}

function sectionSpokenLines(section = {}) {
  if (Array.isArray(section.content)) {
    return section.content.filter(line => typeof line === 'string' && !line.trim().startsWith('[')).map(line => line.trim()).filter(Boolean);
  }
  if (Array.isArray(section.steps)) {
    return section.steps.map(step => [step.title, step.description, step.tip].filter(Boolean).join('. ')).filter(Boolean);
  }
  if (Array.isArray(section.items)) {
    return section.items.map(item => [item.title, item.description].filter(Boolean).join('. ')).filter(Boolean);
  }
  if (typeof section.content === 'string' && section.content.trim()) return [section.content.trim()];
  return [];
}

/**
 * Build the narration plan from a script. Each paragraph carries the part of
 * the script it came from so the storyboard can treat headings as sections.
 *
 * Section titles are NOT read aloud (they become title cards); the old
 * "Section 1: ..." spoken prefix is gone.
 *
 * In Spanish, Bible references are spelled out the way they are said
 * ("Jn 3,16" → "Juan, capítulo tres, versículo dieciséis"): voice, captions
 * and timing all come from this plan, so they stay in sync.
 */
function buildNarrationPlan(script = {}, { language = process.env.CONTENT_LANGUAGE } = {}) {
  const paragraphs = [];
  const citas = esEspanol(language);
  const push = (text, meta) => {
    let clean = String(text || '').replace(/\s+/g, ' ').trim();
    if (citas) clean = suavizaPalabras(leeCitasBiblicas(clean));
    if (!clean) return;
    paragraphs.push({ index: paragraphs.length, text: clean, ...meta });
  };

  push(script.hook?.text, { part: 'hook', sectionIndex: null, sectionTitle: null });

  if (script.introduction) {
    const intro = [script.introduction.greeting, script.introduction.topicIntro, script.introduction.valueProposition, script.introduction.credibility]
      .filter(line => typeof line === 'string' && line.trim()).join(' ');
    push(intro, { part: 'introduction', sectionIndex: null, sectionTitle: null });
  }

  (script.mainContent?.sections || []).forEach((section, sectionIndex) => {
    const lines = sectionSpokenLines(section);
    lines.forEach((line, lineIndex) => {
      push(line, { part: 'section', sectionIndex, sectionTitle: section.title || null, sectionStart: lineIndex === 0 });
    });
  });

  if (script.conclusion) {
    const closing = [...(Array.isArray(script.conclusion.recap) ? script.conclusion.recap : []), script.conclusion.finalThought]
      .filter(line => typeof line === 'string' && line.trim()).join(' ');
    push(closing, { part: 'conclusion', sectionIndex: null, sectionTitle: null });
  }

  if (script.callToAction) {
    const cta = [script.callToAction.subscribe, script.callToAction.like, script.callToAction.comment]
      .filter(line => typeof line === 'string' && line.trim()).join(' ');
    push(cta, { part: 'cta', sectionIndex: null, sectionTitle: null });
  }

  return paragraphs;
}

/**
 * Text handed to the TTS provider. ElevenLabs honours <break time="0.4s" />
 * (max 3 s); other providers get plain newlines, which they read as pauses.
 */
function renderTtsText(plan, pacing = voicePacing(), { breakTags = true } = {}) {
  const sentenceBreak = breakTags && pacing.sentencePauseMs > 0 ? ` <break time="${(pacing.sentencePauseMs / 1000).toFixed(2)}s" /> ` : ' ';
  const paragraphBreak = breakTags && pacing.paragraphPauseMs > 0 ? `\n<break time="${(pacing.paragraphPauseMs / 1000).toFixed(2)}s" />\n` : '\n\n';
  return plan
    .map(paragraph => splitSentences(paragraph.text).join(sentenceBreak))
    .join(paragraphBreak)
    .trim();
}

/** Plain text (no break tags) — what the captions and alignment work from. */
function renderPlainText(plan) {
  return plan.map(paragraph => paragraph.text).join('\n\n').trim();
}

/**
 * Editable view of a script for the dashboard: one block per spoken part.
 *   { title, blocks: [{ part, sectionTitle, text }] }
 * Section blocks are grouped per section (title + all its lines as paragraphs).
 */
function editableFromScript(script = {}) {
  const blocks = [];
  const hook = String(script.hook?.text || '').trim();
  if (hook) blocks.push({ part: 'hook', sectionTitle: null, text: hook });
  const intro = [script.introduction?.greeting, script.introduction?.topicIntro, script.introduction?.valueProposition, script.introduction?.credibility]
    .filter(line => typeof line === 'string' && line.trim()).join(' ').trim();
  if (intro) blocks.push({ part: 'introduction', sectionTitle: null, text: intro });
  for (const section of script.mainContent?.sections || []) {
    blocks.push({ part: 'section', sectionTitle: String(section.title || '').trim(), text: sectionSpokenLines(section).join('\n\n') });
  }
  const closing = [...(Array.isArray(script.conclusion?.recap) ? script.conclusion.recap : []), script.conclusion?.finalThought]
    .filter(line => typeof line === 'string' && line.trim()).join(' ').trim();
  if (closing) blocks.push({ part: 'conclusion', sectionTitle: null, text: closing });
  const cta = [script.callToAction?.subscribe, script.callToAction?.like, script.callToAction?.comment]
    .filter(line => typeof line === 'string' && line.trim()).join(' ').trim();
  if (cta) blocks.push({ part: 'cta', sectionTitle: null, text: cta });
  return { title: String(script.title || ''), blocks, scriptures: Array.isArray(script.scriptures) ? script.scriptures : [] };
}

/** Rebuild a script from edited blocks, keeping everything the editor did not touch. */
function scriptFromEditable(script = {}, editable = {}) {
  const next = JSON.parse(JSON.stringify(script || {}));
  const clean = text => String(text || '').replace(/\r/g, '').trim();
  if (editable.title !== undefined) next.title = clean(editable.title).slice(0, 100) || next.title;
  const blocks = Array.isArray(editable.blocks) ? editable.blocks : [];
  const sections = [];
  for (const block of blocks) {
    const text = clean(block.text);
    switch (block.part) {
      case 'hook': next.hook = { ...(next.hook || {}), type: next.hook?.type || 'statement', text }; break;
      case 'introduction': next.introduction = { greeting: text, topicIntro: '', valueProposition: '', credibility: '', duration: next.introduction?.duration || '0:05-0:20' }; break;
      case 'section': {
        const lines = text.split(/\n\s*\n/).map(clean).filter(Boolean);
        if (!lines.length) break;
        sections.push({ type: 'ai_generated', title: clean(block.sectionTitle) || `Part ${sections.length + 1}`, content: lines, duration: Math.max(20, Math.round(lines.join(' ').split(/\s+/).length / 130 * 60)) });
        break;
      }
      case 'conclusion': next.conclusion = { type: 'conclusion', title: 'Conclusion', recap: [text], finalThought: '', duration: '30 seconds' }; break;
      case 'cta': next.callToAction = { type: 'call_to_action', subscribe: text, like: '', comment: '', nextVideo: '', duration: '15 seconds' }; break;
      default: break;
    }
  }
  if (blocks.some(block => block.part === 'section')) next.mainContent = { ...(next.mainContent || {}), sections, totalDuration: sections.reduce((sum, section) => sum + section.duration, 0) };
  if (Array.isArray(editable.scriptures)) {
    next.scriptures = editable.scriptures.map(item => ({ reference: clean(item?.reference).slice(0, 60), text: clean(item?.text).slice(0, 600) })).filter(item => item.text);
  }
  return next;
}

/**
 * Up to this length (spoken characters) the narration is a Short's and uses
 * ELEVENLABS_TTS_MODEL_SHORT.
 */
const LIMITE_CORTO = 1500;

/**
 * Characters that are SPOKEN: <break …/> pauses don't count. 12/10/2026: the 13/10 Short had
 * 1,230 spoken and 14 pauses (1,538 total) and came out with the long-video model.
 */
function largoHablado(texto) {
  return String(texto || '').replace(/<break\b[^>]*\/>/g, '').length;
}

/**
 * 12/10/2026: what a Short's voice has of its own (model and speed). It goes in the narration
 * cache key so changing ELEVENLABS_SPEED_SHORT really narrates again; '' for long videos and
 * without a Shorts model, so their keys don't change.
 */
function ajusteCorto(texto, env = process.env) {
  const modelo = String(env.ELEVENLABS_TTS_MODEL_SHORT || '').trim();
  if (!modelo || largoHablado(texto) > LIMITE_CORTO) return '';
  return `${modelo}@${String(env.ELEVENLABS_SPEED_SHORT || '').trim()}`;
}

module.exports = { DEFAULTS, LIMITE_CORTO, largoHablado, voicePacing, ajusteCorto, splitSentences, buildNarrationPlan, renderTtsText, renderPlainText, sectionSpokenLines, editableFromScript, scriptFromEditable };
