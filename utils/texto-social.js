/**
 * Texto para Facebook e Instagram (04/10/2026). Cada red premia otra cosa:
 *
 * - instagram: Reel. Tope de 5 hashtags (Instagram, dic. 2025) y las palabras
 *   del texto cuentan para su buscador. La señal que más empuja son los envíos
 *   por mensaje, así que la invitación es "envíala a alguien".
 * - facebook: Reel. Paga por vistas que se quedan y por compartir/comentar
 *   rápido; los hashtags pesan poco (3).
 * - facebook_video: vídeo largo de la Página (lleva título aparte). A partir
 *   de 3 min entra en anuncios dentro del vídeo; se invita a seguir la página.
 *
 * Sale de la descripción de YouTube, sin lo que solo vale allí (#shorts, la
 * línea 🔔 del canal, capítulos con minuto).
 */

const { lineaLibro } = require('./libro');

const TOPE_TEXTO = 2200;
const HASHTAGS_MARCA = ['#oracion', '#fe', '#oraciondiaria', '#Dios', '#Jesus'];
const CUANTOS = { instagram: 5, facebook: 3, facebook_video: 3 };
const INVITACION = {
  // Intercesión (04/10/2026): copiado de @misteriosdivinos05, la cuenta con más
  // comentarios del nicho (10-25 % de las reproducciones).
  // 07/10/2026: Instagram es la palanca de YouTube (la oración larga) y del libro.
  instagram: '🙏 Escribe «Amén» y el nombre de alguien por quien quieres orar: hoy oramos por ti.\n📩 Envía esta oración a alguien que la necesite hoy.\n▶️ La oración completa, cada mañana y cada noche, en YouTube: en el enlace del perfil.',
  facebook: '🙏 Escribe «Amén» y el nombre de alguien por quien quieres orar: hoy oramos por ti.\n🤍 Comparte esta oración con alguien que la necesite.\n👉 Sigue la página: una oración nueva cada mañana y cada noche.',
  facebook_video: '👉 Sigue la página para orar con nosotros cada mañana y cada noche.\n🙏 Escribe "Amén" en los comentarios si esta oración te bendijo.'
};
const VARIABLE_ENV = { instagram: 'INSTAGRAM_REEL_CTA', facebook: 'FACEBOOK_REEL_CTA', facebook_video: 'FACEBOOK_VIDEO_CTA' };

const esDeYouTube = linea => /🔔|suscr[ií]b|youtube|youtu\.be|#shorts|\/libro|^¡Te invitamos a ver/i.test(linea); // /libro: el libro va en su propia línea (utils/libro.js)
const soloHashtags = linea => /^(#\S+\s*)+$/.test(linea.trim());
const esCapitulo = linea => /^\d{1,2}:\d{2}(:\d{2})?\s/.test(linea.trim());

function hashtagsPara(seo = {}, red = 'facebook') {
  const delVideo = [
    ...(Array.isArray(seo.hashtags) ? seo.hashtags : []),
    ...(String(seo.description || '').match(/#[\p{L}\p{N}_]+/gu) || [])
  ];
  const vistos = new Set();
  const lista = [];
  for (const h of [...delVideo, ...HASHTAGS_MARCA]) {
    const tag = `#${String(h).replace(/^#+/, '').replace(/\s+/g, '')}`;
    const clave = tag.toLowerCase();
    if (tag.length < 2 || clave === '#shorts' || vistos.has(clave)) continue;
    vistos.add(clave);
    lista.push(tag);
  }
  // Siempre cabe al menos uno de marca (#oracion) aunque el vídeo traiga muchos.
  const cuantos = CUANTOS[red] || 3;
  const propios = lista.filter(t => !HASHTAGS_MARCA.some(m => m.toLowerCase() === t.toLowerCase()));
  const marca = lista.filter(t => !propios.includes(t));
  return [...propios.slice(0, cuantos - 1), ...marca].slice(0, cuantos);
}

// Lo que va desde esta raya es el pie de YouTube (libro, suscribirse, redes):
// en Instagram y Facebook no tiene sentido (05/10/2026).
const RAYA_PIE = /^\s*━{3,}/m;

function cuerpoDe(seo = {}) {
  return String(seo.description || '').split(RAYA_PIE)[0]
    .split('\n')
    .map(l => l.trim())
    .filter(l => !esDeYouTube(l) && !soloHashtags(l) && !esCapitulo(l))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function textoParaRed(seo = {}, red = 'facebook', env = process.env) {
  // El vídeo largo de Facebook lleva el título en su propio campo.
  const titulo = red === 'facebook_video' ? '' : String(seo.title || '').trim();
  const cuerpo = cuerpoDe(seo);
  const invitacion = env[VARIABLE_ENV[red]] || INVITACION[red] || '';
  const cola = [invitacion, lineaLibro(env), hashtagsPara(seo, red).join(' ')].filter(Boolean).join('\n\n');

  const espacio = TOPE_TEXTO - cola.length - titulo.length - 4;
  const cuerpoCabe = cuerpo.length > espacio ? `${cuerpo.slice(0, Math.max(0, espacio - 1)).trim()}…` : cuerpo;
  return [titulo, cuerpoCabe, cola].filter(Boolean).join('\n\n');
}

module.exports = { textoParaRed, hashtagsPara };
