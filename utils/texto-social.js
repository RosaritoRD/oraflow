/**
 * Text for Facebook and Instagram (04/10/2026). Each network rewards something
 * else:
 *
 * - instagram: Reel. A cap of 5 hashtags (Instagram, Dec. 2025) and the text's
 *   words count for its search. The strongest signal is sends by message, so the
 *   invitation is "send it to someone".
 * - facebook: Reel. Pays for views that stay and for quick shares/comments;
 *   hashtags weigh little (3).
 * - facebook_video: a long Page video (with a separate title). From 3 min on it's
 *   eligible for in-video ads; it invites people to follow the page.
 *
 * It comes from the YouTube description, without what only makes sense there
 * (#shorts, the channel's 🔔 line, chapters with timestamps).
 */

const { lineaLibro } = require('./libro');

const TOPE_TEXTO = 2200;
const HASHTAGS_MARCA = ['#oracion', '#fe', '#oraciondiaria', '#Dios', '#Jesus'];
const CUANTOS = { instagram: 5, facebook: 3, facebook_video: 3 };
const INVITACION = {
  // Intercession (04/10/2026): copied from @misteriosdivinos05, the account with the
  // most comments in the niche (10-25 % of views).
  // 07/10/2026: Instagram is the lever for YouTube (the long prayer) and for the book.
  instagram: '🙏 Escribe «Amén» y el nombre de alguien por quien quieres orar: hoy oramos por ti.\n📩 Envía esta oración a alguien que la necesite hoy.\n▶️ La oración completa, cada mañana y cada noche, en YouTube: en el enlace del perfil.',
  facebook: '🙏 Escribe «Amén» y el nombre de alguien por quien quieres orar: hoy oramos por ti.\n🤍 Comparte esta oración con alguien que la necesite.\n👉 Sigue la página: una oración nueva cada mañana y cada noche.',
  facebook_video: '👉 Sigue la página para orar con nosotros cada mañana y cada noche.\n🙏 Escribe "Amén" en los comentarios si esta oración te bendijo.'
};
const VARIABLE_ENV = { instagram: 'INSTAGRAM_REEL_CTA', facebook: 'FACEBOOK_REEL_CTA', facebook_video: 'FACEBOOK_VIDEO_CTA' };

const esDeYouTube = linea => /🔔|suscr[ií]b|youtube|youtu\.be|#shorts|\/libro|^¡Te invitamos a ver/i.test(linea); // /libro: the book goes on its own line (utils/libro.js)
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
  // There's always room for at least one brand hashtag (#oracion) even if the video brings many.
  const cuantos = CUANTOS[red] || 3;
  const propios = lista.filter(t => !HASHTAGS_MARCA.some(m => m.toLowerCase() === t.toLowerCase()));
  const marca = lista.filter(t => !propios.includes(t));
  return [...propios.slice(0, cuantos - 1), ...marca].slice(0, cuantos);
}

// What goes from this rule on is the YouTube footer (book, subscribe, networks):
// it makes no sense on Instagram and Facebook (05/10/2026).
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
  // The long Facebook video carries the title in its own field.
  const titulo = red === 'facebook_video' ? '' : String(seo.title || '').trim();
  const cuerpo = cuerpoDe(seo);
  const invitacion = env[VARIABLE_ENV[red]] || INVITACION[red] || '';
  const cola = [invitacion, lineaLibro(env), hashtagsPara(seo, red).join(' ')].filter(Boolean).join('\n\n');

  const espacio = TOPE_TEXTO - cola.length - titulo.length - 4;
  const cuerpoCabe = cuerpo.length > espacio ? `${cuerpo.slice(0, Math.max(0, espacio - 1)).trim()}…` : cuerpo;
  return [titulo, cuerpoCabe, cola].filter(Boolean).join('\n\n');
}

module.exports = { textoParaRed, hashtagsPara };
