/**
 * Words the ElevenLabs voice mispronounces (07/10/2026).
 *
 * In the long video «Antes de mirar el teléfono» it said «teléfene». The script
 * was fine; it's the voice that trips over that proparoxytone word. Only what is
 * NARRATED is changed (captions come from the narration, so they match): the
 * script, title and description stay as they were.
 *
 * To add another one: one more entry in CAMBIOS, with its test.
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
