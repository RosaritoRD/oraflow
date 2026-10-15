/**
 * Narration timing: turn provider alignment data (or, failing that, the audio
 * duration) into word-level timestamps over the narration plan.
 *
 * Output shape (seconds):
 *   { source: 'elevenlabs'|'estimated', duration, words: [{ text, start, end, paragraph }],
 *     paragraphs: [{ index, start, end }] }
 *
 * ElevenLabs /with-timestamps returns per-character alignment for the text we
 * sent, break tags included. We align by walking the characters of each word
 * of the PLAIN text through the provider's character stream, skipping tag text.
 */

function tokenizeWords(text) {
  return String(text || '').match(/\S+/g) || [];
}

function alignmentToWords(plan, alignment) {
  const chars = alignment?.characters || [];
  const starts = alignment?.character_start_times_seconds || [];
  const ends = alignment?.character_end_times_seconds || [];
  if (!chars.length || chars.length !== starts.length) return null;

  const words = [];
  let cursor = 0;

  const skipTag = () => {
    // Provider echoes "<break time=... />" characters; they carry no speech.
    if (chars[cursor] !== '<') return false;
    let i = cursor;
    while (i < chars.length && chars[i] !== '>') i += 1;
    cursor = Math.min(chars.length, i + 1);
    return true;
  };

  for (const paragraph of plan) {
    for (const word of tokenizeWords(paragraph.text)) {
      // Find the word's first character in the stream.
      let matched = false;
      while (cursor < chars.length && !matched) {
        if (skipTag()) continue;
        if (/\s/.test(chars[cursor])) { cursor += 1; continue; }
        if (chars[cursor] === word[0]) {
          // Verify the whole word (tolerating provider whitespace/tags inside).
          let ci = cursor;
          let wi = 0;
          while (wi < word.length && ci < chars.length) {
            if (chars[ci] === word[wi]) { ci += 1; wi += 1; continue; }
            if (chars[ci] === '<') { while (ci < chars.length && chars[ci] !== '>') ci += 1; ci += 1; continue; }
            break;
          }
          if (wi === word.length) {
            words.push({ text: word, start: starts[cursor], end: ends[ci - 1] ?? starts[cursor], paragraph: paragraph.index });
            cursor = ci;
            matched = true;
            break;
          }
        }
        cursor += 1;
      }
      if (!matched) return null; // alignment drifted; caller falls back to estimate
    }
  }
  return words;
}

/**
 * Estimate word timings from total duration, weighting by word length so long
 * words take longer, and reserving pause time between paragraphs.
 */
function estimateWords(plan, duration, pacing = {}) {
  const paragraphPause = Math.max(0, Number(pacing.paragraphPauseMs || 0) / 1000);
  const tokens = plan.flatMap(paragraph => tokenizeWords(paragraph.text).map(text => ({ text, paragraph: paragraph.index })));
  if (!tokens.length || !(duration > 0)) return [];
  const pauses = Math.max(0, plan.length - 1) * paragraphPause;
  const speech = Math.max(1, duration - pauses);
  const weights = tokens.map(token => 1 + Math.min(12, token.text.replace(/[^\p{L}\p{N}]/gu, '').length) / 6);
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let clock = 0;
  let lastParagraph = tokens[0].paragraph;
  return tokens.map((token, index) => {
    if (token.paragraph !== lastParagraph) { clock += paragraphPause; lastParagraph = token.paragraph; }
    const length = (weights[index] / total) * speech;
    const start = clock;
    clock += length;
    return { text: token.text, start: Number(start.toFixed(3)), end: Number(clock.toFixed(3)), paragraph: token.paragraph };
  });
}

function paragraphRanges(plan, words, duration) {
  return plan.map(paragraph => {
    const own = words.filter(word => word.paragraph === paragraph.index);
    return {
      index: paragraph.index,
      start: own.length ? own[0].start : 0,
      end: own.length ? own[own.length - 1].end : 0
    };
  }).map((range, i, all) => ({
    ...range,
    // a paragraph "owns" the silence after it, up to the next paragraph's first word
    end: i + 1 < all.length ? Math.max(range.end, all[i + 1].start) : Math.max(range.end, duration || range.end)
  }));
}

function buildTiming(plan, { alignment = null, duration = 0, pacing = {} } = {}) {
  let words = alignment ? alignmentToWords(plan, alignment) : null;
  let source = 'elevenlabs';
  if (!words || !words.length) {
    words = estimateWords(plan, duration, pacing);
    source = 'estimated';
  }
  const total = Math.max(duration || 0, words.length ? words[words.length - 1].end : 0);
  return { source, duration: Number(total.toFixed(3)), words, paragraphs: paragraphRanges(plan, words, total) };
}

module.exports = { buildTiming, alignmentToWords, estimateWords, tokenizeWords, paragraphRanges };
