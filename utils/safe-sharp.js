const sharp = require('sharp');

// Mitigaciones oficiales de GHSA-f88m-g3jw-g9cj y GHSA-rgj7-g3m4-5g8c.
// Bloquea los decodificadores y sus variantes de archivo/buffer antes de
// procesar imágenes externas, aunque tengan una extensión engañosa.
// PNG, JPEG, WebP y SVG siguen disponibles para fondos y miniaturas.
sharp.block({ operation: [
  'VipsForeignLoadNsgif',
  'VipsForeignLoadTiff',
  'VipsForeignLoadVips',
  'VipsForeignLoadHeif'
] });

module.exports = sharp;
