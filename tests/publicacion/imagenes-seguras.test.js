const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const sharp = require('sharp');
// The real generation entry point must turn the protection on before reading images.
require('../../utils/ai-video-generator');

const canvas = () => sharp({ create: { width: 8, height: 8, channels: 3, background: '#204060' } });

for (const format of ['gif', 'tiff', 'avif']) {
  test(`rejects ${format} by content, even with a JPG extension`, async t => {
    const input = await canvas().toFormat(format).toBuffer();
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'safe-image-'));
    t.after(() => fs.rm(dir, { recursive: true, force: true }));
    const disguised = path.join(dir, 'imagen.jpg');
    await fs.writeFile(disguised, input);
    await assert.rejects(sharp(input).metadata(), /blocked|unsupported image format/i);
    await assert.rejects(sharp(disguised).png().toBuffer(), /blocked|unsupported image format/i);
  });
}

test('keeps PNG, JPEG, WebP and the thumbnails\' SVGs', async () => {
  for (const format of ['png', 'jpeg', 'webp']) {
    const input = await canvas().toFormat(format).toBuffer();
    const output = await sharp(input).resize(4, 4).png().toBuffer();
    assert.equal((await sharp(output).metadata()).width, 4);
  }
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="blue"/></svg>');
  assert.equal((await sharp(await sharp(svg).png().toBuffer()).metadata()).width, 8);
});
