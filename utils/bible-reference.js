/**
 * Bible references on screen always use digits.
 *
 * The narrator reads "Salmo ciento veintiuno, versículos siete y ocho" because
 * that is how it sounds natural; the verse card and the captions show
 * "Salmo 121:7-8". Works on Spanish and English spelled-out numbers, and leaves
 * a reference that already uses digits untouched.
 */

const ES_NUMBERS = new Map(Object.entries({
  cero: 0, un: 1, uno: 1, una: 1, primero: 1, primera: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7,
  ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16,
  diecisiete: 17, dieciocho: 18, diecinueve: 19, veinte: 20, veintiun: 21, veintiuno: 21, veintiuna: 21,
  veintidos: 22, veintitres: 23, veinticuatro: 24, veinticinco: 25, veintiseis: 26, veintisiete: 27,
  veintiocho: 28, veintinueve: 29, treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70,
  ochenta: 80, noventa: 90, cien: 100, ciento: 100, doscientos: 200, trescientos: 300, cuatrocientos: 400,
  quinientos: 500, seiscientos: 600, setecientos: 700, ochocientos: 800, novecientos: 900
}));

const EN_NUMBERS = new Map(Object.entries({
  zero: 0, one: 1, first: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90
}));

const JOINERS = new Set(['y', 'and', 'e']);
const VERSE_WORDS = new Set(['versiculo', 'versiculos', 'verso', 'versos', 'verse', 'verses', 'v', 'vv']);
const CHAPTER_WORDS = new Set(['capitulo', 'capitulos', 'chapter', 'chapters']);
const RANGE_WORDS = new Set(['a', 'al', 'hasta', 'to', 'through']);

const fold = word => String(word || '').toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^\p{L}\p{N}]/gu, '');

function wordValue(word) {
  const key = fold(word);
  if (!key) return null;
  if (/^\d+$/.test(key)) return Number(key);
  if (ES_NUMBERS.has(key)) return ES_NUMBERS.get(key);
  if (EN_NUMBERS.has(key)) return EN_NUMBERS.get(key);
  if (key === 'hundred') return 100;
  // "twenty-one", "treinta-y-cuatro"
  const parts = String(word).toLowerCase().split(/[-–]/).map(fold).filter(Boolean);
  if (parts.length > 1) {
    let sum = 0;
    for (const part of parts) {
      if (JOINERS.has(part)) continue;
      const value = ES_NUMBERS.get(part) ?? EN_NUMBERS.get(part);
      if (value === undefined) return null;
      sum += value;
    }
    return sum || null;
  }
  return null;
}

/**
 * Read one spelled-out number starting at `i`.
 * @returns {{ value: number, next: number } | null}
 */
function readNumber(tokens, i) {
  let total = 0;
  let consumed = 0;
  let cursor = i;
  let pendingJoiner = false;

  while (cursor < tokens.length) {
    const key = fold(tokens[cursor]);
    if (JOINERS.has(key)) {
      // "treinta y cuatro": only a joiner INSIDE a number, never at its start
      if (!consumed || pendingJoiner) break;
      const nextValue = wordValue(tokens[cursor + 1]);
      if (nextValue === null || nextValue >= 10 || total % 10 !== 0) break;
      pendingJoiner = true;
      cursor += 1;
      continue;
    }
    const value = wordValue(tokens[cursor]);
    if (value === null) break;
    if (/^\d+$/.test(key)) {
      if (consumed) break;             // a digit group is a number on its own
      total = value; consumed += 1; cursor += 1;
      break;
    }
    // English multiplier: "one hundred", "two hundred"
    if (value === 100 && fold(tokens[cursor]) === 'hundred' && consumed && total < 10) {
      total *= 100;
      consumed += 1;
      cursor += 1;
      pendingJoiner = false;
      continue;
    }
    // hundreds + tens + units, each strictly smaller than the previous part
    if (consumed && value >= 100) break;
    if (consumed && !pendingJoiner && value >= 10 && total % 100 !== 0) break;
    total += value;
    consumed += 1;
    cursor += 1;
    pendingJoiner = false;
    if (total % 10 !== 0 && total > 0 && value < 10 && fold(tokens[cursor]) !== 'hundred') {
      if (fold(tokens[cursor]) === 'hundred') continue;
      break;  // units end the number
    }
  }

  if (!consumed) return null;
  return { value: total, next: cursor };
}

function formatVerses(values) {
  if (!values.length) return '';
  const consecutive = values.every((value, i) => i === 0 || value === values[i - 1] + 1);
  return consecutive && values.length > 1 ? `${values[0]}-${values[values.length - 1]}` : values.join(',');
}

/**
 * Turn one reference into its on-screen form.
 * "Salmo ciento veintiuno, versículos siete y ocho" → "Salmo 121:7-8"
 * "Juan 3:16" → "Juan 3:16" (already fine)
 * Returns the original text when no chapter number is found.
 */
function normalizeReference(reference) {
  const raw = String(reference || '').trim();
  if (!raw) return raw;
  // Already in "Book 121:7-8" form (or any digit form): leave it exactly as is.
  if (/\d+\s*[:.]\s*\d+/.test(raw) || /\d+\s*[-–]\s*\d+/.test(raw)) return raw.replace(/\s*([:.-])\s*/g, '$1');
  const tokens = raw.split(/\s+/);

  // book = every word before the first number word
  let i = 0;
  const book = [];
  while (i < tokens.length) {
    const key = fold(tokens[i]);
    if (wordValue(tokens[i]) !== null && !(book.length === 0 && /^[1-3]$/.test(key))) break;
    if (CHAPTER_WORDS.has(key) || VERSE_WORDS.has(key)) break;
    book.push(tokens[i].replace(/[,;:]+$/, ''));
    i += 1;
  }
  while (i < tokens.length && CHAPTER_WORDS.has(fold(tokens[i]))) i += 1;

  const chapter = readNumber(tokens, i);
  if (!chapter) return raw;
  // "Una oración" is not a reference: the number must follow a book name.
  if (!book.length) return raw;
  i = chapter.next;

  // ":" / "verse" / "versículo" then one or more verse numbers
  while (i < tokens.length && (VERSE_WORDS.has(fold(tokens[i])) || fold(tokens[i]) === '')) i += 1;
  const verses = [];
  let range = false;
  while (i < tokens.length) {
    const key = fold(tokens[i]);
    if (JOINERS.has(key) || RANGE_WORDS.has(key) || VERSE_WORDS.has(key)) {
      if (RANGE_WORDS.has(key)) range = true;
      i += 1;
      continue;
    }
    const verse = readNumber(tokens, i);
    if (!verse) break;
    verses.push(verse.value);
    i = verse.next;
  }

  const name = book.join(' ').replace(/\s+/g, ' ').trim();
  const verseText = range && verses.length === 2 ? `${verses[0]}-${verses[1]}` : formatVerses(verses);
  return `${name}${name ? ' ' : ''}${chapter.value}${verseText ? `:${verseText}` : ''}`.trim();
}

// A reference inside running text: book word(s) + number words, optionally
// followed by verse words and more numbers.
const BOOK_HINT = /(salmo?s?|proverbios?|isaias|isaías|jeremias|jeremías|mateo|marcos|lucas|juan|hechos|romanos|corintios|galatas|gálatas|efesios|filipenses|colosenses|tesalonicenses|timoteo|tito|hebreos|santiago|pedro|apocalipsis|genesis|génesis|exodo|éxodo|levitico|levítico|numeros|números|deuteronomio|josue|josué|jueces|rut|samuel|reyes|cronicas|crónicas|esdras|nehemias|nehemías|ester|job|eclesiastes|eclesiastés|cantares|ezequiel|daniel|oseas|joel|amos|amós|abdias|abdías|jonas|jonás|miqueas|nahum|habacuc|sofonias|sofonías|hageo|zacarias|zacarías|malaquias|malaquías|psalms?|proverbs|isaiah|jeremiah|matthew|mark|luke|john|acts|romans|corinthians|galatians|ephesians|philippians|colossians|thessalonians|timothy|titus|hebrews|james|peter|revelation|genesis|exodus|leviticus|numbers|deuteronomy)/i;

/**
 * Rewrite every spelled-out Bible reference inside a line of text so the
 * numbers show as digits. Leaves the rest of the sentence untouched.
 */
function digitizeReferences(text) {
  const tokens = String(text || '').split(/(\s+)/);          // keep the whitespace
  const words = tokens.filter((_, i) => i % 2 === 0);
  const gaps = tokens.filter((_, i) => i % 2 === 1);
  const out = [];

  for (let i = 0; i < words.length; i += 1) {
    const word = words[i];
    if (!BOOK_HINT.test(fold(word))) { out.push(word); continue; }

    // collect the book (this word plus an ordinal prefix already emitted) and
    // everything that looks like the numeric part of a reference
    let j = i + 1;
    const tail = [];
    while (j < words.length) {
      const key = fold(words[j]);
      if (wordValue(words[j]) !== null || JOINERS.has(key) || RANGE_WORDS.has(key) || VERSE_WORDS.has(key) || CHAPTER_WORDS.has(key)) {
        tail.push(words[j]); j += 1; continue;
      }
      break;
    }
    // drop trailing joiners that belong to the sentence, not the reference
    while (tail.length && (JOINERS.has(fold(tail[tail.length - 1])) || RANGE_WORDS.has(fold(tail[tail.length - 1])) || VERSE_WORDS.has(fold(tail[tail.length - 1])))) {
      tail.pop(); j -= 1;
    }
    if (!tail.length) { out.push(word); continue; }

    const prefix = out.length && /^[1-3]$|^(primera|primero|segunda|segundo|tercera|tercero|first|second|third|i|ii|iii)$/.test(fold(out[out.length - 1]))
      ? out.pop() : '';
    const trailing = (tail[tail.length - 1].match(/[.,;:!?)"»]+$/) || [''])[0];
    const reference = `${prefix ? `${prefix} ` : ''}${word} ${tail.join(' ')}`.replace(/[.,;:!?)"»]+$/, '');
    out.push(normalizeReference(reference) + trailing);
    i = j - 1;
  }

  // rebuild with the original spacing where it still lines up
  return out.map((word, i) => word + (i < out.length - 1 ? (gaps[i] || ' ') : '')).join('');
}

module.exports = { normalizeReference, digitizeReferences, readNumber, wordValue, formatVerses };
