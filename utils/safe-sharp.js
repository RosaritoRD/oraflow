const sharp = require('sharp');

// Official mitigations for GHSA-f88m-g3jw-g9cj and GHSA-rgj7-g3m4-5g8c.
// Blocks the decoders and their file/buffer variants before processing
// external images, even with a misleading extension.
// PNG, JPEG, WebP and SVG remain available for backgrounds and thumbnails.
sharp.block({ operation: [
  'VipsForeignLoadNsgif',
  'VipsForeignLoadTiff',
  'VipsForeignLoadVips',
  'VipsForeignLoadHeif'
] });

module.exports = sharp;
