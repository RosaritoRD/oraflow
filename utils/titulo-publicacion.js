// Keeps words and numbers: only ignores presentation differences.
function normalizaTituloPublicacion(title) {
  return String(title || '').normalize('NFKD').replace(/\p{M}/gu, '')
    .toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

module.exports = { normalizaTituloPublicacion };
