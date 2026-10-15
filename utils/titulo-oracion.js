/**
 * Títulos de los vídeos largos con el formato de los canales grandes del nicho
 * (pedido del autor, 03/10/2026, sobre @AbrazoDivino y Sol Naciente):
 *
 *   ORACIÓN DE LA MAÑANA | EL SEÑOR ES MI LUZ Y MI SALVACIÓN: NO TEMAS LO QUE TRAIGA ESTE DÍA | Salmo 27
 *
 * Cabecera fija con la franja que dice el CONTENIDO, la promesa del pasaje y lo
 * que el oyente recibe en mayúsculas, y la cita al final tal como se escribe.
 * 05/10/2026 (el autor): con la FECHA de publicación detrás de la franja, como la
 * competencia que más crece ("Oración de la mañana 5 de octubre de 2026"):
 *   ORACIÓN DE LA MAÑANA · 6 DE OCTUBRE | DIOS CUIDA DE TI: … | Isaías 26:3
 * La gente busca la oración "de hoy" con la fecha. Sin fecha si no hay hueco de publicación.
 * YouTube corta a 100: primero se sacrifica la cita, después se corta en palabra.
 */
const { tituloLimpio } = require('./titulo-limpio');
const { esShort } = require('./formato');

const MAX = 100;
const CABECERA = /^\s*ORACI[ÓO]N\s+DE\s+LA\s+(MAÑANA|MANANA|TARDE|NOCHE)(?:\s*[·•-]?\s*\d{1,2}\s+DE\s+\p{L}+(?:\s+DE\s+\d{4})?)?\s*(?:[|—–:·•-]\s*)*/iu;

/** «6 DE OCTUBRE» en la zona del canal (el día en que se publica, no en el que se genera). */
function fechaTitulo(fecha, tz = 'America/New_York') {
  const d = fecha ? new Date(fecha) : null;
  if (!d || Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('es', { day: 'numeric', month: 'long', timeZone: tz }).format(d).toLocaleUpperCase('es');
}
// «| Salmo 27», «| Salmos 4:8», «| 1 Pedro 5:7», «| Proverbios 3:5-6» al final.
const CITA_FINAL = /\s*[|—–]\s*(?:[1-3]\s*)?\p{L}[\p{L}\s]{1,24}?\s+\d{1,3}(?::\d{1,3}(?:\s*[-–]\s*\d{1,3})?)?\s*$/u;

const sinEmojis = t => String(t || '').replace(/\p{Extended_Pictographic}|️|‍/gu, '').replace(/\s+/g, ' ').trim();

/** «Salmos 32:8» → «Salmo 32:8» (así se titula en el nicho). */
function citaDelTitulo(ref) {
  const r = sinEmojis(ref).replace(/^Salmos\b/i, 'Salmo');
  return r || null;
}

function cortaEnPalabra(t, max) {
  if ([...t].length <= max) return t;
  let c = [...t].slice(0, max + 1).join('');
  c = c.slice(0, Math.max(c.lastIndexOf(' '), 1));
  return c.replace(/[\s|—–:,;-]+$/u, '').trim();
}

function tituloEstiloOracion({ titulo = '', franja = null, referencia = null, fecha = null, tz } = {}) {
  let cuerpo = tituloLimpio(sinEmojis(titulo), { conservaMayusculas: true });
  const franjaTitulo = (cuerpo.match(CABECERA) || [])[1];
  const f = String(franja || franjaTitulo || 'MAÑANA').toUpperCase().replace('MANANA', 'MAÑANA');
  cuerpo = cuerpo.replace(CABECERA, '').replace(CITA_FINAL, '').replace(/^[\s|—–:-]+|[\s|—–:,-]+$/g, '').trim();
  cuerpo = cuerpo.toLocaleUpperCase('es');
  const dia = fechaTitulo(fecha, tz);
  const cabeza = `ORACIÓN DE LA ${f}${dia ? ` · ${dia}` : ''}`;
  if (!cuerpo) return cabeza;
  const cita = citaDelTitulo(referencia);
  const conCita = cita ? `${cabeza} | ${cuerpo} | ${cita}` : null;
  if (conCita && [...conCita].length <= MAX) return conCita;
  return cortaEnPalabra(`${cabeza} | ${cuerpo}`, MAX);
}

/** Solo los vídeos largos del canal de oración en español. */
function usaEstiloOracion(strategy = {}, env = process.env) {
  return /^es\b/i.test(String(env.CONTENT_LANGUAGE || '')) &&
    String(env.CHANNEL_THEME || '').toLowerCase() === 'prayer' &&
    !esShort(strategy);
}

module.exports = { tituloEstiloOracion, usaEstiloOracion, fechaTitulo };
