// Conserva palabras y números: solo ignora diferencias de presentación.
function normalizaTituloPublicacion(title) {
  return String(title || '').normalize('NFKD').replace(/\p{M}/gu, '')
    .toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

module.exports = { normalizaTituloPublicacion };
