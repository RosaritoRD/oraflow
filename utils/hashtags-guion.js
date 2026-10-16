const { esShort } = require('./formato');
const { franjaDelContenido } = require('./franja');

const limpio = value => String(value || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const etiqueta = value => limpio(value).replace(/[^a-z0-9]/g, '');
const libros = new Map();
for (const aliases of [
  'Genesis', 'Exodo', 'Levitico', 'Numeros', 'Deuteronomio', 'Josue', 'Jueces', 'Rut',
  '1 Samuel', '2 Samuel', '1 Reyes', '2 Reyes', '1 Cronicas', '2 Cronicas', 'Esdras', 'Nehemias', 'Ester', 'Job',
  'Salmo|Salmos', 'Proverbios', 'Eclesiastes', 'Cantares|Cantar de los Cantares', 'Isaias', 'Jeremias', 'Lamentaciones',
  'Ezequiel', 'Daniel', 'Oseas', 'Joel', 'Amos', 'Abdias', 'Jonas', 'Miqueas', 'Nahum', 'Habacuc', 'Sofonias',
  'Hageo', 'Zacarias', 'Malaquias', 'Mateo', 'Marcos', 'Lucas', 'Juan', 'Hechos|Hechos de los Apostoles',
  'Romanos', '1 Corintios', '2 Corintios', 'Galatas', 'Efesios', 'Filipenses', 'Colosenses',
  '1 Tesalonicenses', '2 Tesalonicenses', '1 Timoteo', '2 Timoteo', 'Tito', 'Filemon', 'Hebreos', 'Santiago',
  '1 Pedro', '2 Pedro', '1 Juan', '2 Juan', '3 Juan', 'Judas', 'Apocalipsis'
]) {
  const names = aliases.split('|');
  for (const name of names) libros.set(etiqueta(name), etiqueta(names[0]));
}

// It only extracts the chapter from the declared reference. Verifying the biblical
// text is the provenance check's job, not the hashtags'.
function hashtagReferencia(reference) {
  const match = String(reference || '').trim().match(/^(.+?)\s+([1-9]\d{0,2})\s*:\s*[1-9]\d*(?:\s*[-–]\s*[1-9]\d*)?$/u);
  const book = match && libros.get(etiqueta(match[1]));
  return book ? `#${book}${Number(match[2])}` : null;
}

function esCapitulo(value) {
  const match = value.match(/^#(.+?)(\d+)$/);
  return Boolean(match && libros.has(match[1]));
}

function hashtagsDelGuion(candidates, script = {}, strategy = {}) {
  const references = (script.scriptures || []).map(s => hashtagReferencia(s.reference)).filter(Boolean);
  const prayer = references.length > 0 || /oracion|salmo|jeshua/.test(limpio(`${script.title || ''} ${strategy.topic || ''}`));
  const franja = etiqueta(franjaDelContenido(script, strategy));
  const defaults = prayer
    ? [franja ? `#oraciondela${franja}` : '#oracion', '#oracion', '#fe']
    : [];
  const supplied = (candidates || []).map(etiqueta).filter(Boolean).map(h => `#${h}`);
  // Chapter tags are rebuilt from the script; it never guesses whether «salmo48»
  // means chapter 48 or chapter 4, verse 8.
  const topical = [...new Set([...supplied, ...defaults])].filter(h => h !== '#shorts' && !esCapitulo(h));
  const first = esShort(strategy) ? ['#shorts'] : [];
  const scripture = references.slice(0, 1);
  return [...first, ...topical.slice(0, 3 - first.length - scripture.length), ...scripture];
}

module.exports = { hashtagsDelGuion, hashtagReferencia };
