/**
 * Library of thumbnails made by the owner (11/10/2026). The owner designs finished
 * thumbnails (text included) and the system picks the one that fits the video's
 * topic:
 *   data/assets/miniaturas-propias/  16:9, long videos (uploaded to YouTube)
 *   data/assets/portadas-propias/    9:16, Shorts (set by hand from /portadas)
 * Each folder carries _textos.json ({file: text}) and _uso.json (rotation).
 * If no topic fits or the image is missing, it returns null and the generated one is
 * used.
 */
const fs = require('fs').promises;
const path = require('path');

const RAIZ = path.join(__dirname, '..', 'data', 'assets');
const CARPETA = { largo: 'miniaturas-propias', short: 'portadas-propias' };

// From the most specific to the most general. [regex, long, shorts]. «milagro» and
// «sanidad» only come out if the video talks about that: putting them on another one
// would be misleading.
const TEMAS = [
  [/milagro/i, ['milagro-urgente'], ['necesito-un-milagro']],
  [/salud|sanidad|sanar|enferm/i, ['oracion-de-sanidad', 'jesus-sana-hoy', 'sanidad-poderosa'], ['sana-mi-corazon']],
  [/cadena|opresi|atadura|liberaci/i, ['rompe-cadenas'], ['sueltalo-en-dios']],
  [/justicia|injusticia/i, ['dios-hara-justicia'], ['vence-el-temor']],
  [/batalla|enemig|pelea/i, ['dios-peleara-por-ti'], ['vence-el-temor', 'sin-miedo']],
  [/salmo\s*23|pastor|oveja/i, ['jesus-mi-pastor'], ['dios-va-contigo']],
  [/salmo\s*91/i, ['salmo-91'], ['cubreme-senor', 'protegeme-hoy']],
  [/noche|dormir|acostar|descansar/i, ['descansa-en-jesus', 'antes-de-dormir', 'descansa-en-dios'], ['duerme-en-paz', 'recibe-paz']],
  [/miedo|temor|p[aá]nico/i, ['no-temas-jesus-va', 'no-temas', 'dios-tiene-el-control'], ['vence-el-temor', 'sin-miedo', 'no-estas-solo']],
  [/tormenta|dif[ií]cil|prueba|crisis|control/i, ['paz-en-la-tormenta', 'dios-tiene-el-control'], ['dios-va-contigo', 'no-estas-solo']],
  [/ansiedad|preocupa|angusti|inquiet|agobi|estr[eé]s|mente/i, ['jesus-trae-paz', 'entrega-tu-ansiedad', 'paz-en-la-tormenta'], ['calma-mi-mente', 'sueltalo-en-dios', 'recibe-paz']],
  [/des[aá]nimo|desanimad|triste|tristeza/i, ['rompe-el-desanimo', 'jesus-te-abraza', 'restaura-mi-corazon'], ['dame-fuerzas', 'no-estas-solo']],
  [/solo\b|sola\b|abandon|dejar[aá]/i, ['jesus-no-te-deja', 'jesus-esta-contigo', 'dios-no-te-dejara', 'jesus-te-abraza'], ['no-estas-solo']],
  [/coraz[oó]n|herida|restaur/i, ['jesus-restaura', 'restaura-mi-corazon'], ['sana-mi-corazon', 'no-estas-solo']],
  [/cansad|carga|sostendr|sostiene|sustent|fuerza|fortale|no\s+puedo/i, ['jesus-te-sostiene', 'jesus-te-fortalece', 'jesus-te-levanta', 'fortaleceme-senor', 'levantame-senor', 'ya-no-puedo-mas'], ['dame-fuerzas', 'no-estas-solo']],
  [/familia|hijo|hija|matrimonio/i, ['bendice-mi-familia', 'proteccion-divina'], ['bendice-mi-casa', 'protegeme-hoy']],
  [/hogar|casa|morada/i, ['proteccion-divina', 'bendice-mi-familia'], ['bendice-mi-casa', 'protegeme-hoy']],
  [/protecc|proteg|guarda|cuida/i, ['proteccion-divina', 'salmo-91'], ['protegeme-hoy', 'cubreme-senor', 'bendice-mi-casa']],
  [/puerta|bendici[oó]n|trabajo|empleo|provisi[oó]n|finanz|prosper/i, ['abre-puertas', 'dios-abrira-puertas'], ['abre-caminos']],
  [/camino|pasos|gu[ií]a|direcci[oó]n|sabidur|palabras/i, ['jesus-esta-contigo', 'camina-con-jesus', 'guia-mis-pasos'], ['abre-caminos', 'dios-va-contigo']],
  [/espera|tiempo\s+de\s+dios|paciencia|conf[ií]a|confiar/i, ['fe-en-jesus', 'confia-en-jesus', 'espera-en-dios'], ['dios-esta-aqui', 'dios-va-contigo']],
  [/respuesta|responde|petici[oó]n|escucha/i, ['dios-respondera', 'jesus-te-escucha'], ['dios-responde', 'escucha-esto']],
  [/semana|lunes|nuevo\s+(d[ií]a|comienzo)|empezar\s+de\s+nuevo|renov/i, ['nuevo-comienzo'], ['buenos-dias-dios']],
  [/gratitud|gracias|agradec/i, ['recibe-paz-hoy'], ['gracias-dios']],
  [/amor|ama\b|perd[oó]n|arrepent|volver|regres|ven\s+a/i, ['mira-a-jesus', 'ven-a-jesus', 'jesus-te-ama'], ['dios-esta-aqui']],
  [/presencia/i, ['ven-a-jesus', 'recibe-paz-hoy'], ['dios-esta-aqui']],
  [/paz/i, ['jesus-trae-paz', 'paz-en-jesus', 'recibe-paz-hoy'], ['recibe-paz']]
];
const POR_DEFECTO = { largo: ['mira-a-jesus', 'fe-en-jesus', 'oracion-de-la-manana', 'oracion-poderosa-para-hoy'], short: ['buenos-dias-dios', 'dios-va-contigo'] };

const leeJson = async (ruta, defecto) => { try { return JSON.parse(await fs.readFile(ruta, 'utf8')); } catch { return defecto; } };

/** Candidates in order of preference for this video (only the ones that exist). */
async function candidatos({ title = '', topic = '', formato = 'largo', raiz = RAIZ } = {}) {
  const dir = path.join(raiz, CARPETA[formato] || CARPETA.largo);
  const hay = new Set((await fs.readdir(dir).catch(() => [])).filter((n) => /\.(jpe?g|png)$/i.test(n)).map((n) => n.replace(/\.\w+$/, '')));
  if (!hay.size) return { dir, lista: [], tema: [] };
  // The title rules (it's what gets published); the topic helps if the title says nothing.
  const textos = [String(title).split('|').slice(1).join(' ') || String(title), String(title), String(topic)];
  const idx = formato === 'short' ? 2 : 1;
  let lista = [];
  for (const texto of textos) {
    const tema = TEMAS.find(([re]) => re.test(texto));
    if (tema) { lista = tema[idx]; break; }
  }
  const tema = lista.filter((s) => hay.has(s));
  const todos = [...tema, ...(POR_DEFECTO[formato] || [])].filter((s, i, a) => a.indexOf(s) === i && hay.has(s));
  return { dir, lista: todos, tema, hay };
}

/**
 * Picks the image (the least used for the topic, without repeating the last one)
 * and notes it in _uso.json. Returns { ruta, slug, texto, alternativas } or null.
 */
async function eligeDeBiblioteca({ title = '', topic = '', formato = 'largo', raiz = RAIZ, logger = console } = {}) {
  const { dir, lista, tema } = await candidatos({ title, topic, formato, raiz });
  if (!lista.length) return null;
  const uso = await leeJson(path.join(dir, '_uso.json'), {});
  const textos = await leeJson(path.join(dir, '_textos.json'), {});
  // It rotates within the topic (without repeating the last one); the fallback only if the topic has no image.
  const base = tema.length ? tema : lista;
  const pool = base.length > 1 ? base.filter((s) => s !== uso._ultimo) : base;
  pool.sort((a, b) => (uso[a]?.usos || 0) - (uso[b]?.usos || 0) || String(uso[a]?.en || '').localeCompare(String(uso[b]?.en || '')));
  const slug = pool[0];
  const archivo = (await fs.readdir(dir)).find((n) => n.replace(/\.\w+$/, '') === slug);
  uso[slug] = { usos: (uso[slug]?.usos || 0) + 1, en: new Date().toISOString() };
  uso._ultimo = slug;
  await fs.writeFile(path.join(dir, '_uso.json'), JSON.stringify(uso, null, 1)).catch(() => {});
  logger.info?.(`Thumbnail from the owner's library (${formato}): ${slug}`);
  return {
    ruta: path.join(dir, archivo), slug, texto: textos[archivo] || slug,
    alternativas: lista.filter((s) => s !== slug).map((s) => path.join(dir, `${s}.jpg`))
  };
}

module.exports = { eligeDeBiblioteca, candidatos, TEMAS, POR_DEFECTO, CARPETA };
