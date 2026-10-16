/**
 * Captions from word timestamps: short readable segments (3-8 words, max two
 * lines) that follow the voice, plus SRT (for YouTube upload) and ASS (burned
 * into the video, with the word being spoken highlighted).
 */
const path = require('path');
const fs = require('fs').promises;
const { normalizeReference, digitizeReferences } = require('./bible-reference');

const DEFAULTS = Object.freeze({
  minWords: 2,
  maxWords: 5,             // short bursts: the viewer reads a phrase, not a paragraph
  maxCharsPerLine: 28,
  maxLines: 2,
  position: 'center',      // 'center' (middle of the frame) or 'bottom'
  uppercase: true,         // reference style: short ALL-CAPS phrases
  highlight: false,        // colour the word being spoken (off = plain white like the reference)
  gapBreak: 0.35,          // seconds of silence that force a new segment
  minDuration: 0.8,        // never flash a caption shorter than this
  fontFamily: 'Liberation Sans',
  fontSize: 64,            // for 1080p; scaled for other heights
  primaryColour: '&H00FFFFFF',
  activeColour: '&H0060D9FF',   // warm amber (BGR order in ASS)
  outlineColour: '&H80000000',
  backColour: '&H80000000',
  // 03/10/2026: the audience is older and wants big letters. On long
  // (horizontal) videos all the text comes out ×1.5 with a thicker outline;
  // Shorts don't change. CAPTION_LONG_SCALE adjusts it (1 = as before).
  longScale: 1.5
});

function options(overrides = {}) {
  const merged = { ...DEFAULTS, ...(overrides || {}) };
  if (process.env.CAPTION_FONT) merged.fontFamily = process.env.CAPTION_FONT;
  if (process.env.CAPTION_FONT_SIZE) merged.fontSize = Number(process.env.CAPTION_FONT_SIZE) || merged.fontSize;
  if (process.env.CAPTION_ACTIVE_COLOUR) merged.activeColour = process.env.CAPTION_ACTIVE_COLOUR;
  if (process.env.CAPTION_MAX_WORDS) merged.maxWords = Math.max(2, Number(process.env.CAPTION_MAX_WORDS) || merged.maxWords);
  if (process.env.CAPTION_POSITION) merged.position = process.env.CAPTION_POSITION === 'bottom' ? 'bottom' : 'center';
  if (process.env.CAPTION_UPPERCASE) merged.uppercase = process.env.CAPTION_UPPERCASE !== 'off';
  if (process.env.CAPTION_HIGHLIGHT) merged.highlight = process.env.CAPTION_HIGHLIGHT === 'on';
  if (process.env.CAPTION_LONG_SCALE) {
    const v = Number(process.env.CAPTION_LONG_SCALE);
    if (Number.isFinite(v) && v >= 1 && v <= 2.5) merged.longScale = v;
  }
  return merged;
}

function endsClause(word) {
  return /[.!?…;:]["»”)]?$/.test(word);
}

function endsSoft(word) {
  return /[,—–]["»”)]?$/.test(word);
}

/** Group timed words into caption segments. */
function segmentWords(words, overrides = {}) {
  const opt = options(overrides);
  const segments = [];
  let current = [];
  const chars = list => list.reduce((sum, w) => sum + w.text.length + 1, 0) - 1;
  const flush = () => {
    if (!current.length) return;
    segments.push({
      text: current.map(w => w.text).join(' '),
      start: current[0].start,
      end: current[current.length - 1].end,
      words: current.map(w => ({ text: w.text, start: w.start, end: w.end }))
    });
    current = [];
  };

  words.forEach((word, index) => {
    const next = words[index + 1];
    current.push(word);
    const count = current.length;
    const tooWide = wrapLines(current.map(w => w.text).join(' '), opt).some(line => line.length > opt.maxCharsPerLine);
    if (tooWide && count > 1) { current.pop(); flush(); current.push(word); }
    const size = current.length;
    const gap = next ? next.start - word.end : Infinity;
    const boundary = size >= opt.minWords && (endsClause(word.text) || gap >= opt.gapBreak);
    const softBoundary = size >= opt.minWords + 1 && endsSoft(word.text) && chars(current) >= opt.maxCharsPerLine * 0.6;
    if (size >= opt.maxWords || boundary || softBoundary || !next) flush();
  });
  flush();

  // enforce a minimum on-screen time by borrowing from the gap after the segment
  return segments.map((segment, i) => {
    const nextStart = segments[i + 1]?.start ?? Infinity;
    const end = Math.max(segment.end, Math.min(segment.start + opt.minDuration, nextStart - 0.05));
    return { ...segment, end: Number(end.toFixed(3)), lines: wrapLines(segment.text, opt) };
  });
}

/** Greedy word wrap at maxChars (verse cards: 3-4 balanced-ish lines). */
function wrapWords(text, maxChars) {
  const lines = [];
  let current = '';
  for (const word of String(text || '').split(/\s+/).filter(Boolean)) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxChars && current) { lines.push(current); current = word; } else current = candidate;
  }
  if (current) lines.push(current);
  return lines;
}

function wrapLines(text, opt) {
  const words = text.split(' ');
  if (text.length <= opt.maxCharsPerLine) return [text];
  // balanced two-line break near the middle, preferring a clause boundary
  let best = null;
  for (let i = 1; i < words.length; i += 1) {
    const a = words.slice(0, i).join(' ');
    const b = words.slice(i).join(' ');
    if (a.length > opt.maxCharsPerLine || b.length > opt.maxCharsPerLine) continue;
    const score = Math.abs(a.length - b.length) - (endsSoft(words[i - 1]) || endsClause(words[i - 1]) ? 6 : 0);
    if (!best || score < best.score) best = { score, lines: [a, b] };
  }
  return best ? best.lines : [text];
}

// ---------------------------------------------------------------------------
// Serialisers
// ---------------------------------------------------------------------------

function srtTime(seconds) {
  const ms = Math.round(seconds * 1000);
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), s = Math.floor((ms % 60000) / 1000), r = ms % 1000;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(r).padStart(3, '0')}`;
}

function toSrt(segments) {
  return segments.map((segment, i) => `${i + 1}\n${srtTime(segment.start)} --> ${srtTime(segment.end)}\n${segment.lines.join('\n')}\n`).join('\n');
}

function assTime(seconds) {
  const cs = Math.round(seconds * 100);
  const h = Math.floor(cs / 360000), m = Math.floor((cs % 360000) / 6000), s = Math.floor((cs % 6000) / 100), r = cs % 100;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(r).padStart(2, '0')}`;
}

function assEscape(text) {
  return String(text).replace(/\\/g, '\\\\').replace(/\{/g, '(').replace(/\}/g, ')');
}

/**
 * ASS with the active word highlighted: one Dialogue per word window. The
 * whole segment stays on screen; only the colour of the current word changes.
 * Safe area: bottom margin = 9% of the height; 9:16 gets a larger margin.
 */
function toAss(segments, { width = 1920, height = 1080, titleCards = [], verseCards = [], ...overrides } = {}) {
  const opt = options(overrides);
  const scale = height / 1080;
  const horizontal = width > height;
  const fontSize = Math.round(opt.fontSize * scale * (width < height ? 0.9 : horizontal ? opt.longScale : 1));
  // Outline and shadow grow with the letters: thin white over a light sky can't be read.
  const grosor = horizontal ? opt.longScale : 1;
  const centered = opt.position === 'center';
  // Alignment: 5 = middle centre, 2 = bottom centre. Title cards go to the top
  // third when captions sit in the middle so the two never overlap.
  const captionAlign = centered ? 5 : 2;
  const marginV = centered ? 0 : Math.round(height * (width < height ? 0.18 : 0.09));
  const titleMarginV = Math.round(height * (centered ? 0.2 : 0.42));
  const marginH = Math.round(width * 0.08);
  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${width}
PlayResY: ${height}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Caption,${opt.fontFamily},${fontSize},${opt.primaryColour},${opt.activeColour},${opt.outlineColour},${opt.backColour},-1,0,0,0,100,100,${Math.round(1.5 * scale)},0,1,${Math.max(2, Math.round(2.5 * scale * grosor))},${Math.max(2, Math.round(3 * scale * grosor))},${captionAlign},${marginH},${marginH},${marginV},1
Style: Title,${opt.fontFamily},${Math.round(fontSize * 1.15)},&H00FFFFFF,&H00FFFFFF,${opt.outlineColour},&H00000000,-1,0,0,0,100,100,${Math.round(3 * scale)},0,1,${Math.max(2, Math.round(2.5 * scale))},${Math.max(2, Math.round(3 * scale))},8,${marginH},${marginH},${titleMarginV},1
Style: VerseRef,${opt.fontFamily},${Math.round(fontSize * 1.3)},&H00FFFFFF,&H00FFFFFF,${opt.outlineColour},&H00000000,-1,0,0,0,100,100,${Math.round(4 * scale)},0,1,${Math.max(2, Math.round(2.5 * scale))},${Math.max(2, Math.round(3 * scale))},8,${marginH},${marginH},${Math.round(height * 0.22)},1
Style: Verse,${opt.fontFamily},${Math.round(fontSize * 0.95)},&H00FFFFFF,&H00FFFFFF,${opt.outlineColour},&H00000000,-1,0,0,0,100,100,${Math.round(2 * scale)},0,1,${Math.max(2, Math.round(2.5 * scale))},${Math.max(2, Math.round(3 * scale))},5,${Math.round(width * 0.12)},${Math.round(width * 0.12)},0,1
Style: Dim,${opt.fontFamily},20,&H00000000,&H00000000,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
  const events = [];
  // On screen a reference is always digits, even when the narrator spells it out.
  const caps = text => {
    const digits = digitizeReferences(String(text));
    return opt.uppercase ? digits.toUpperCase() : digits;
  };
  // Section title cards: top centre, fade in/out, drawn by libass (no drawtext needed).
  for (const card of titleCards) {
    if (!card?.title) continue;
    const end = card.end ?? card.start + 2.5;
    events.push(`Dialogue: 1,${assTime(card.start)},${assTime(end)},Title,,0,0,0,,{\\fad(400,400)}${assEscape(caps(card.title))}`);
  }
  // Scripture cards: darken the frame, reference on top, the verse centred.
  // Normal captions are hidden while a verse card is on screen.
  const dim = `{\\p1\\alpha&H70&\\bord0\\shad0}m 0 0 l ${width} 0 ${width} ${height} 0 ${height}{\\p0}`;
  const hidden = [];
  for (const card of verseCards) {
    if (!card?.text) continue;
    hidden.push([card.start, card.end]);
    events.push(`Dialogue: 0,${assTime(card.start)},${assTime(card.end)},Dim,,0,0,0,,{\\fad(300,300)\\pos(0,0)}${dim}`);
    if (card.reference) events.push(`Dialogue: 2,${assTime(card.start)},${assTime(card.end)},VerseRef,,0,0,0,,{\\fad(300,300)}${assEscape(caps(normalizeReference(card.reference)))}`);
    // 36 caps characters fit inside the 76%-wide margins at this size, so libass never re-wraps our lines.
    const verseLines = wrapWords(`"${card.text}"`, width < height ? 20 : 36).map(line => assEscape(caps(line))).join('\\N');
    events.push(`Dialogue: 2,${assTime(card.start)},${assTime(card.end)},Verse,,0,0,0,,{\\fad(300,300)}${verseLines}`);
  }
  const isHidden = (start, end) => hidden.some(([a, b]) => start < b && end > a);

  for (const segment of segments) {
    if (isHidden(segment.start, segment.end)) continue;
    if (!opt.highlight) {
      // Plain mode (reference look): one event per segment, no per-word colour.
      const lines = segment.lines.map(line => assEscape(caps(line))).join('\\N');
      events.push(`Dialogue: 0,${assTime(segment.start)},${assTime(segment.end)},Caption,,0,0,0,,{\\fad(80,80)}${lines}`);
      continue;
    }
    const lineBreakAfter = segment.lines.length > 1 ? segment.lines[0].split(' ').length : Infinity;
    const words = segment.words;
    words.forEach((word, i) => {
      const start = i === 0 ? segment.start : word.start;
      const end = i === words.length - 1 ? segment.end : Math.max(word.start + 0.05, words[i + 1].start);
      if (end <= start) return;
      const text = words.map((w, k) => {
        const token = assEscape(caps(w.text));
        const styled = k === i ? `{\\c${opt.activeColour}\\b1}${token}{\\c${opt.primaryColour}\\b1}` : token;
        return k === lineBreakAfter - 1 ? `${styled}\\N` : `${styled} `;
      }).join('').replace(/\\N /g, '\\N').trim();
      const fade = i === 0 ? '{\\fad(80,0)}' : i === words.length - 1 ? '{\\fad(0,80)}' : '';
      events.push(`Dialogue: 0,${assTime(start)},${assTime(end)},Caption,,0,0,0,,${fade}${text}`);
    });
  }
  return header + events.join('\n') + '\n';
}

async function writeCaptionFiles(segments, dir, baseName, dimensions = {}) {
  await fs.mkdir(dir, { recursive: true });
  const srtPath = path.join(dir, `${baseName}.srt`);
  const assPath = path.join(dir, `${baseName}.ass`);
  const jsonPath = path.join(dir, `${baseName}.captions.json`);
  await fs.writeFile(srtPath, toSrt(segments));
  await fs.writeFile(assPath, toAss(segments, dimensions));
  await fs.writeFile(jsonPath, JSON.stringify(segments, null, 2));
  return { srtPath, assPath, jsonPath };
}

/** QA helper: any segment breaking the readability rules. */
function lint(segments, overrides = {}) {
  const opt = options(overrides);
  const problems = [];
  segments.forEach((segment, i) => {
    if (segment.lines.length > opt.maxLines) problems.push(`caption ${i + 1} has ${segment.lines.length} lines`);
    if (segment.lines.some(line => line.length > opt.maxCharsPerLine + 4)) problems.push(`caption ${i + 1} line too long`);
    if (segment.words.length > opt.maxWords + 2) problems.push(`caption ${i + 1} has ${segment.words.length} words`);
    if (segment.end - segment.start < opt.minDuration - 0.05) problems.push(`caption ${i + 1} shorter than ${opt.minDuration}s`);
    if (segments[i + 1] && segments[i + 1].start < segment.end - 0.01) problems.push(`caption ${i + 1} overlaps the next one`);
  });
  return problems;
}

module.exports = { segmentWords, wrapLines, wrapWords, toSrt, toAss, writeCaptionFiles, lint, options, DEFAULTS };
