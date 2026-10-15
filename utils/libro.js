/**
 * El ebook en los textos de las publicaciones (05/10/2026). La línea se edita en
 * el panel (Redes → Textos y enlaces, utils/textos-canal.js); vacía o
 * LIBRO_EN_TEXTOS=off = no se pone.
 */
const textos = require('./textos-canal');

const lineaLibro = (env = process.env) => (String(env.LIBRO_EN_TEXTOS || '').toLowerCase() === 'off' ? '' : String(textos.texto('libro_linea') || '').trim());

module.exports = { lineaLibro, get URL_LIBRO() { return textos.texto('libro_url'); }, get LINEA() { return textos.texto('libro_linea'); } };
