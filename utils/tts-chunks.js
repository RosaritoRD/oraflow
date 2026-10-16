/**
 * ElevenLabs cuts per request (eleven_multilingual_v2: 10,000 characters).
 * A 14-16 min script is around 12,000, so the narration is split into chunks by
 * paragraph/sentence, each one is generated and the audio and alignment are
 * joined.
 */

const DEFAULT_MAX_CHARS = 4500;

function hardSplit(text, max) {
  const out = [];
  let rest = text.trim();
  while (rest.length > max) {
    let cut = rest.lastIndexOf(' ', max);
    if (cut < max * 0.5) cut = max;
    out.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) out.push(rest);
  return out;
}

/** Chunks of at most `max` characters, cutting by paragraph, then by sentence. */
function splitForTts(text, max = DEFAULT_MAX_CHARS) {
  const clean = String(text || '').trim();
  if (clean.length <= max) return clean ? [clean] : [];

  const pieces = [];
  for (const paragraph of clean.split(/\n\s*\n/)) {
    const p = paragraph.trim();
    if (!p) continue;
    if (p.length <= max) { pieces.push({ text: p, sep: '\n\n' }); continue; }
    const sentences = p.match(/[^.!?…]+[.!?…]+["»”)]?(?:\s*<break[^>]*\/>)?|[^.!?…]+$/g) || [p];
    for (const s of sentences) {
      for (const part of hardSplit(s, max)) pieces.push({ text: part, sep: ' ' });
    }
  }

  const chunks = [];
  let current = '';
  for (const { text: piece, sep } of pieces) {
    const next = current ? `${current}${sep}${piece}` : piece;
    if (next.length > max && current) {
      chunks.push(current.trim());
      current = piece;
    } else {
      current = next;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

/**
 * Joins each chunk's per-character alignments by shifting their times by the real duration of
 * the previous audio. Puts a space between chunks so the words at the edges don't stick
 * together.
 * @param {{alignment: object|null, duration: number}[]} parts
 */
function mergeAlignments(parts) {
  if (!parts.length || parts.some(p => !p.alignment?.characters)) return null;
  const characters = [];
  const starts = [];
  const ends = [];
  let offset = 0;
  parts.forEach((part, index) => {
    const a = part.alignment;
    if (index > 0) { characters.push(' '); starts.push(offset); ends.push(offset); }
    a.characters.forEach((c, i) => {
      characters.push(c);
      starts.push(Number(a.character_start_times_seconds[i]) + offset);
      ends.push(Number(a.character_end_times_seconds[i]) + offset);
    });
    const lastEnd = Number(a.character_end_times_seconds.at(-1) || 0);
    offset += part.duration > 0 ? part.duration : lastEnd;
  });
  return { characters, character_start_times_seconds: starts, character_end_times_seconds: ends };
}

module.exports = { splitForTts, mergeAlignments, DEFAULT_MAX_CHARS };
