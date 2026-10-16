/**
 * Bible references read aloud (requested 03/10/2026).
 *
 * The script carries «Salmo 5:3» or «Jn 3,16» and the voice read it like a time
 * or a number. Here it's converted to how it's said: «Juan, capítulo tres,
 * versículo dieciséis». The owner prefers the video running a bit longer to the
 * reference sounding wrong. Rules:
 *   - abbreviation → the book's full name;
 *   - first number → «capítulo» + the number in words (Psalms don't say
 *     «capítulo»: «Salmo veintitrés, versículo uno»);
 *   - after «,» or «:» → «versículo» + the number in words; a range is said
 *     «versículos tres a diez» and a list «versículos dieciséis y dieciocho».
 *
 * Spanish scripts only. Only what is shaped like a reference is touched (book +
 * chapter + verse, or «Salmo N»): «Juan tiene 3 hijos» or «a las 5:30» don't
 * change.
 */

const UNIDADES = ['cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve',
  'diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve',
  'veinte', 'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete',
  'veintiocho', 'veintinueve'];
const DECENAS = { 3: 'treinta', 4: 'cuarenta', 5: 'cincuenta', 6: 'sesenta', 7: 'setenta', 8: 'ochenta', 9: 'noventa' };
const CENTENAS = { 1: 'ciento', 2: 'doscientos', 3: 'trescientos', 4: 'cuatrocientos', 5: 'quinientos',
  6: 'seiscientos', 7: 'setecientos', 8: 'ochocientos', 9: 'novecientos' };

/** 0-999 in words. That's enough: the highest chapter is 150 and the verse, 176. */
function numeroEnLetras(n) {
  n = Number(n);
  if (!Number.isInteger(n) || n < 0 || n > 999) return String(n);
  if (n < 30) return UNIDADES[n];
  if (n < 100) {
    const d = Math.floor(n / 10);
    const u = n % 10;
    return u ? `${DECENAS[d]} y ${UNIDADES[u]}` : DECENAS[d];
  }
  if (n === 100) return 'cien';
  const c = Math.floor(n / 100);
  const resto = n % 100;
  return resto ? `${CENTENAS[c]} ${numeroEnLetras(resto)}` : (c === 1 ? 'cien' : CENTENAS[c]);
}

/* Book → [name as said, ...written forms]. The short forms are
   case-sensitive («Mi 6:8» is Micah; «mi» in a sentence isn't). */
const LIBROS = [
  ['Génesis', 'Génesis', 'Genesis', 'Gn', 'Gén', 'Gen'],
  ['Éxodo', 'Éxodo', 'Exodo', 'Ex', 'Éx'],
  ['Levítico', 'Levítico', 'Levitico', 'Lv', 'Lev'],
  ['Números', 'Números', 'Numeros', 'Nm', 'Núm', 'Num'],
  ['Deuteronomio', 'Deuteronomio', 'Dt', 'Deut'],
  ['Josué', 'Josué', 'Josue', 'Jos'],
  ['Jueces', 'Jueces', 'Jue', 'Jc'],
  ['Rut', 'Rut', 'Rt'],
  ['Samuel', 'Samuel', 'Sam', 'S'],
  ['Reyes', 'Reyes', 'Re', 'R'],
  ['Crónicas', 'Crónicas', 'Cronicas', 'Cr', 'Crón'],
  ['Esdras', 'Esdras', 'Esd'],
  ['Nehemías', 'Nehemías', 'Nehemias', 'Neh'],
  ['Ester', 'Ester', 'Est'],
  ['Job', 'Job', 'Jb'],
  ['Salmo', 'Salmos', 'Salmo', 'Sal', 'Sl'],
  ['Proverbios', 'Proverbios', 'Prov', 'Pr'],
  ['Eclesiastés', 'Eclesiastés', 'Eclesiastes', 'Ecl', 'Ec', 'Qo'],
  ['Cantares', 'Cantares', 'Cantar de los Cantares', 'Cnt', 'Cant'],
  ['Isaías', 'Isaías', 'Isaias', 'Is'],
  ['Jeremías', 'Jeremías', 'Jeremias', 'Jer', 'Jr'],
  ['Lamentaciones', 'Lamentaciones', 'Lam', 'Lm'],
  ['Ezequiel', 'Ezequiel', 'Ez'],
  ['Daniel', 'Daniel', 'Dn', 'Dan'],
  ['Oseas', 'Oseas', 'Os'],
  ['Joel', 'Joel', 'Jl'],
  ['Amós', 'Amós', 'Amos', 'Am'],
  ['Abdías', 'Abdías', 'Abdias', 'Abd'],
  ['Jonás', 'Jonás', 'Jonas', 'Jon'],
  ['Miqueas', 'Miqueas', 'Miq', 'Mi'],
  ['Nahúm', 'Nahúm', 'Nahum', 'Nah'],
  ['Habacuc', 'Habacuc', 'Hab', 'Ha'],
  ['Sofonías', 'Sofonías', 'Sofonias', 'Sof'],
  ['Hageo', 'Hageo', 'Hag', 'Ag'],
  ['Zacarías', 'Zacarías', 'Zacarias', 'Zac', 'Za'],
  ['Malaquías', 'Malaquías', 'Malaquias', 'Mal', 'Ml'],
  ['Mateo', 'Mateo', 'Mt', 'Mat'],
  ['Marcos', 'Marcos', 'Mc', 'Mr', 'Mar'],
  ['Lucas', 'Lucas', 'Lc', 'Luc'],
  ['Juan', 'Juan', 'Jn'],
  ['Hechos', 'Hechos', 'Hch', 'Hech'],
  ['Romanos', 'Romanos', 'Rom', 'Ro', 'Rm'],
  ['Corintios', 'Corintios', 'Cor', 'Co'],
  ['Gálatas', 'Gálatas', 'Galatas', 'Gál', 'Gal', 'Gá'],
  ['Efesios', 'Efesios', 'Ef'],
  ['Filipenses', 'Filipenses', 'Flp', 'Fil'],
  ['Colosenses', 'Colosenses', 'Col'],
  ['Tesalonicenses', 'Tesalonicenses', 'Tes', 'Ts'],
  ['Timoteo', 'Timoteo', 'Tim', 'Tm', 'Ti'],
  ['Tito', 'Tito', 'Tit'],
  ['Filemón', 'Filemón', 'Filemon', 'Flm'],
  ['Hebreos', 'Hebreos', 'Heb', 'Hb'],
  ['Santiago', 'Santiago', 'Stg', 'St'],
  ['Pedro', 'Pedro', 'Pe', 'Pd', 'P'],
  ['Judas', 'Judas', 'Jud', 'Jds'],
  ['Apocalipsis', 'Apocalipsis', 'Ap', 'Apoc']
];

const NOMBRE_DE = new Map();
for (const [dicho, ...formas] of LIBROS) for (const f of formas) NOMBRE_DE.set(f.toLowerCase(), dicho);

/* Long forms first, so «Juan» isn't swallowed as «Jn» and «Salmos» doesn't end
   up as «Salmo» + «s». */
const FORMAS = [...NOMBRE_DE.keys()].sort((a, b) => b.length - a.length)
  .map(f => f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
const LIBRO = `(?:${FORMAS.join('|')})`;
const ORDINAL = { 1: 'Primera', 2: 'Segunda', 3: 'Tercera' };

/* [1-3] book[.] chapter (,|:) verses   —   verses: 16 | 3-10 | 16.18 | 1,27 */
const CITA = new RegExp(
  `(?<![\\p{L}\\d])(?:([1-3])\\s?)?(${LIBRO})\\.?\\s+(\\d{1,3})(?:\\s?:\\s?|,)(\\d{1,3}(?:\\s?[-–—]\\s?\\d{1,3}|(?:[.,]\\d{1,3})+)?)(?![\\d\\p{L}])`,
  'giu');
/* «Salmo 23» with no verse. */
const SALMO_SOLO = /(?<![\p{L}\d])(Salmos?|Sal)\.?\s+(\d{1,3})(?![\d\p{L}:,])/gu;

/* A short form has to arrive written as in the table (with its capital): «Mi 6:8»
   is Micah, «mi 6:8» is nothing. */
function esFormaValida(escrito) {
  const forma = escrito.replace(/\.$/, '');
  if (forma.length > 4) return true;
  return /^\p{Lu}/u.test(forma);
}

function versiculosDichos(v) {
  const rango = v.match(/^(\d{1,3})\s?[-–—]\s?(\d{1,3})$/);
  if (rango) return `versículos ${numeroEnLetras(+rango[1])} a ${numeroEnLetras(+rango[2])}`;
  const lista = v.split(/[.,]/).filter(Boolean).map(Number);
  if (lista.length > 1) {
    const letras = lista.map(numeroEnLetras);
    return `versículos ${letras.slice(0, -1).join(', ')} y ${letras[letras.length - 1]}`;
  }
  return `versículo ${numeroEnLetras(lista[0])}`;
}

function leeCitasBiblicas(texto) {
  if (typeof texto !== 'string' || !/\d/.test(texto)) return texto;
  let salida = texto.replace(CITA, (todo, num, libro, cap, vers) => {
    if (!esFormaValida(libro)) return todo;
    const dicho = NOMBRE_DE.get(libro.toLowerCase());
    if (!dicho) return todo;
    /* A numbered book only if it really has one (1 Juan, 2 Timoteo…). */
    const nombre = num ? `${ORDINAL[num]} de ${dicho}` : dicho;
    if (dicho === 'Salmo') return `Salmo ${numeroEnLetras(+cap)}, ${versiculosDichos(vers)}`;
    return `${nombre}, capítulo ${numeroEnLetras(+cap)}, ${versiculosDichos(vers)}`;
  });
  salida = salida.replace(SALMO_SOLO, (todo, _libro, n) => `Salmo ${numeroEnLetras(+n)}`);
  return salida;
}

/** Does the channel speak Spanish? (CONTENT_LANGUAGE = es, es-MX, …) */
function esEspanol(idioma = process.env.CONTENT_LANGUAGE) {
  return /^es\b/i.test(String(idioma || ''));
}

module.exports = { leeCitasBiblicas, numeroEnLetras, esEspanol };
