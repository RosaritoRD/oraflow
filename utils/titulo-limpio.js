/**
 * Red de seguridad del título publicado (02/10/2026). Las reglas del prompt de
 * SEO ya piden títulos sin fecha, pero si la IA falla el respaldo usa el título
 * del guion, que llegó a publicarse como «ORACIÓN DE LA MAÑANA — JUEVES 1 DE
 * OCTUBRE | … PARA HOY». Un título con fecha parece viejo a la mañana siguiente.
 */
const DIAS = 'lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo';
const MESES = 'enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre';
const NOMBRES = ['Dios', 'Señor', 'Jesús', 'Jesucristo', 'Cristo', 'Espíritu Santo', 'Padre', 'Biblia', 'Salmo', 'Salmos',
  'Proverbios', 'Isaías', 'Jeremías', 'Mateo', 'Marcos', 'Lucas', 'Juan', 'Romanos', 'Filipenses', 'Efesios', 'Pedro', 'Hebreos'];

/* `conservaMayusculas`: el formato de los largos del canal de oración va en
   mayúsculas a propósito (utils/titulo-oracion.js, 03/10/2026). */
function tituloLimpio(titulo = '', { conservaMayusculas = false } = {}) {
  let t = String(titulo || '');
  t = t.replace(new RegExp(`(?:\\s*[—–-]\\s*|\\s*:\\s*|\\s+)(?:(?:${DIAS}),?\\s+)?\\d{1,2}\\s+de\\s+(?:${MESES})(?:\\s+de\\s+\\d{4})?`, 'gi'), '');
  t = t.replace(new RegExp(`(?:\\s*[—–-]\\s*|\\s+)(?:${DIAS})(?=\\s*[|—–-]|$)`, 'gi'), '');
  t = t.replace(/\s+para\s+hoy\b/gi, '');
  // Separadores que quedaron juntos o al borde («— |», «| |»).
  t = t.replace(/\s*([|—–])\s*(?:[|—–]\s*)+/g, ' $1 ').replace(/^\s*[|—–:-]\s*|\s*[|—–:-]\s*$/g, '').replace(/\s{2,}/g, ' ').trim();
  const letras = t.replace(/[^\p{L}]/gu, '');
  const mayus = letras.replace(/[^\p{Lu}]/gu, '').length;
  if (!conservaMayusculas && letras.length > 10 && mayus / letras.length > 0.7) t = frase(t);
  return t;
}

/** Mayúscula inicial y la de los nombres propios; el resto en minúscula. */
function frase(t) {
  let s = t.toLowerCase();
  s = s.charAt(0).toUpperCase() + s.slice(1);
  // Tras un separador también empieza frase («… | Salmo 118»).
  s = s.replace(/([|—–]\s*)(\p{Ll})/gu, (_, sep, c) => sep + c.toUpperCase());
  for (const n of NOMBRES) s = s.replace(new RegExp(`(?<![\\p{L}])${n.toLowerCase()}(?![\\p{L}])`, 'gu'), n);
  return s;
}

module.exports = { tituloLimpio };
