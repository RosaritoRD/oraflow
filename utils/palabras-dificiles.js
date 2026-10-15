/**
 * Palabras que la voz de ElevenLabs pronuncia mal (07/10/2026).
 *
 * En el largo «Antes de mirar el teléfono» dijo «teléfene». El guion estaba
 * bien; es la voz la que tropieza con esa esdrújula. Solo se cambia lo que se
 * NARRA (los subtítulos salen de lo narrado, así que cuadran): el guion, el
 * título y la descripción se quedan como estaban.
 *
 * Para añadir otra: una entrada más en CAMBIOS, con su prueba.
 */
const CAMBIOS = [
  [/\btel[eé]fonos\b/giu, 'celulares'],
  [/\btel[eé]fono\b/giu, 'celular'],
];

function conLaMismaCaja(original, nueva) {
  if (original === original.toUpperCase() && original !== original.toLowerCase()) return nueva.toUpperCase();
  if (original[0] === original[0].toUpperCase() && original[0] !== original[0].toLowerCase()) return nueva[0].toUpperCase() + nueva.slice(1);
  return nueva;
}

function suavizaPalabras(texto) {
  let t = String(texto || '');
  for (const [patron, nueva] of CAMBIOS) t = t.replace(patron, (m) => conLaMismaCaja(m, nueva));
  return t;
}

module.exports = { suavizaPalabras };
