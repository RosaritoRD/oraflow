/**
 * The ebook in the posts' texts (05/10/2026). The line is edited in the panel
 * (Social → Texts and links, utils/textos-canal.js); empty or LIBRO_EN_TEXTOS=off =
 * it's not added.
 */
const textos = require('./textos-canal');

const lineaLibro = (env = process.env) => (String(env.LIBRO_EN_TEXTOS || '').toLowerCase() === 'off' ? '' : String(textos.texto('libro_linea') || '').trim());

module.exports = { lineaLibro, get URL_LIBRO() { return textos.texto('libro_url'); }, get LINEA() { return textos.texto('libro_linea'); } };
