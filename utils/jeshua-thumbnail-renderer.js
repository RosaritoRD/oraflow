const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const sharp = require('./safe-sharp');
const { BRAND, validatePlan } = require('./jeshua-thumbnail-plan');

const FONT_FILE = path.join(__dirname, '..', 'assets', 'fonts', 'BarlowCondensed-ExtraBold.ttf');
const COLUMN_WIDTH = Math.floor(BRAND.width * BRAND.textFraction) - BRAND.safeMargin;
const DURATION_BOX = { x: 1100, y: 620, width: 180, height: 100 };

function escapeMarkup(value) {
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]);
}

function overlaps(a, b) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function subjectPixels(region) {
  if (!region) return null;
  if (['x', 'y', 'width', 'height'].some(key => !Number.isFinite(region[key]) || region[key] < 0 || region[key] > 1) ||
      region.width <= 0 || region.height <= 0 || region.x + region.width > 1 || region.y + region.height > 1) {
    throw new Error('subjectRegion must be a normalized rectangle inside the image.');
  }
  return { x: region.x * BRAND.width, y: region.y * BRAND.height, width: region.width * BRAND.width, height: region.height * BRAND.height };
}

async function lettering(text, size, color) {
  const glyphs = await sharp({ text: {
    text: `<span foreground="#ffffff">${escapeMarkup(text)}</span>`,
    // The comma keeps Pango from interpreting "Condensed" as a style and
    // silently substituting the system font for the bundled font family.
    font: `${BRAND.fontFamily}, ExtraBold ${size}`, fontfile: FONT_FILE, dpi: 72, rgba: true,
  } }).png().toBuffer({ resolveWithObject: true });
  // Use only Pango's alpha mask: some libvips/Pango builds produce coloured
  // edge pixels when rasterising coloured spans. Paint the exact brand colour.
  const mask = await sharp(glyphs.data).extractChannel('alpha').png().toBuffer();
  const data = await sharp({ create: { width: glyphs.info.width, height: glyphs.info.height, channels: 3, background: color } })
    .joinChannel(mask).png().toBuffer();
  return { data, info: glyphs.info, mask };
}

async function fitCopy(text, { maxSize, minSize, maxHeight, maxLines, color }) {
  if (!text) return { lines: [], height: 0, fontSize: 0 };
  const words = text.trim().split(/\s+/);
  for (let size = maxSize; size >= minSize; size -= 2) {
    const lines = [];
    let current = '';
    let currentImage;
    let tooWide = false;
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      const rendered = await lettering(candidate, size, color);
      if (rendered.info.width <= COLUMN_WIDTH) {
        current = candidate;
        currentImage = rendered;
      } else {
        if (current) lines.push({ text: current, ...currentImage });
        current = word;
        currentImage = await lettering(word, size, color);
        if (currentImage.info.width > COLUMN_WIDTH) { tooWide = true; break; }
      }
    }
    if (tooWide) continue;
    if (current) lines.push({ text: current, ...currentImage });
    const gap = Math.round(size * 0.14);
    const height = lines.reduce((sum, line) => sum + line.info.height, 0) + (lines.length - 1) * gap;
    if (lines.length <= maxLines && height <= maxHeight) return { lines, height, fontSize: size, gap };
  }
  throw new Error(`Copy cannot fit at a readable mobile size; shorten it: ${text}`);
}

async function prepareCopy(plan) {
  const validation = validatePlan(plan);
  if (!validation.isValid) throw new Error(`Invalid thumbnail plan: ${validation.errors.join(' ')}`);
  const primary = await fitCopy(plan.thumbnail_headline, { maxSize: 132, minSize: 88, maxHeight: 370, maxLines: 4, color: BRAND.palette.sunrise });
  const secondary = await fitCopy(plan.thumbnail_subheadline, { maxSize: 48, minSize: 40, maxHeight: 92, maxLines: 2, color: BRAND.palette.ivory });
  const totalHeight = primary.height + (secondary.lines.length ? 30 + secondary.height : 0);
  const top = Math.max(140, Math.round((720 - totalHeight) / 2));
  if (top + totalHeight > 616) throw new Error('Copy exceeds the safe thumbnail area; shorten the headline.');
  return { primary, secondary, top };
}

async function assertCopyFits(plan) {
  await prepareCopy(plan);
}

async function analyzeNegativeSpace(artwork) {
  const { data, info } = await sharp(artwork).resize(160, 90).greyscale().raw().toBuffer({ resolveWithObject: true });
  const scores = {};
  for (const side of ['left', 'right']) {
    const start = side === 'left' ? 8 : 100;
    let detail = 0;
    let count = 0;
    for (let y = 16; y < 73; y++) {
      for (let x = start; x < start + 51; x++) {
        const index = y * info.width + x;
        detail += Math.abs(data[index] - data[index + 1]) + Math.abs(data[index] - data[index + info.width]);
        count++;
      }
    }
    scores[side] = Number((detail / count).toFixed(3));
  }
  return scores;
}

function luminance(r, g, b) {
  const values = [r, g, b].map(value => value / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
}

function colorLuminance(hex) {
  return luminance(...hex.slice(1).match(/../g).map(value => parseInt(value, 16)));
}

async function minimumContrast(background, boxes) {
  const { data, info } = await sharp(background).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let minimum = Infinity;
  for (const box of boxes) {
    const foreground = colorLuminance(box.color);
    for (let y = box.y; y < box.y + box.height; y += 2) {
      for (let x = box.x; x < box.x + box.width; x += 2) {
        const offset = (y * info.width + x) * info.channels;
        const base = luminance(data[offset], data[offset + 1], data[offset + 2]);
        minimum = Math.min(minimum, (Math.max(base, foreground) + 0.05) / (Math.min(base, foreground) + 0.05));
      }
    }
  }
  return Number(minimum.toFixed(2));
}

function scrimSvg(side, opacity) {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720">
    <defs><linearGradient id="shade" x1="${side === 'left' ? '0' : '1'}" x2="${side === 'left' ? '1' : '0'}" y1="0" y2="0">
      <stop offset="0" stop-color="${BRAND.palette.navyDeep}" stop-opacity="${opacity}"/>
      <stop offset="0.40" stop-color="${BRAND.palette.navyDeep}" stop-opacity="${opacity}"/>
      <stop offset="0.67" stop-color="${BRAND.palette.navyDeep}" stop-opacity="0"/>
    </linearGradient></defs><rect width="1280" height="720" fill="url(#shade)"/>
  </svg>`);
}

async function renderThumbnail({ plan, artworkPath, outputDir, textSide = 'auto', subjectRegion = null, approveArtwork = false }) {
  const validation = validatePlan(plan);
  if (!validation.isValid) throw new Error(`Invalid thumbnail plan: ${validation.errors.join(' ')}`);
  if (!['auto', 'left', 'right'].includes(textSide)) throw new Error('textSide must be auto, left or right.');
  await fs.access(FONT_FILE);
  const original = await fs.readFile(artworkPath);
  const metadata = await sharp(original, { limitInputPixels: 40000000 }).metadata();
  if (!['jpeg', 'png', 'webp'].includes(metadata.format) || metadata.pages > 1) throw new Error('Artwork must be a single JPEG, PNG or WebP image.');
  const artwork = await sharp(original, { limitInputPixels: 40000000 }).rotate().resize(BRAND.width, BRAND.height, { fit: 'cover' }).flatten({ background: BRAND.palette.navy }).png().toBuffer();
  const scores = await analyzeNegativeSpace(artwork);
  const subject = subjectPixels(subjectRegion);
  let side = textSide;
  if (side === 'auto') {
    side = Math.abs(scores.left - scores.right) < 0.5 ? plan.composition.text_side : scores.left < scores.right ? 'left' : 'right';
    if (subject) {
      const candidates = [side, side === 'left' ? 'right' : 'left'];
      side = candidates.find(candidate => !overlaps({ x: candidate === 'left' ? 64 : BRAND.width - 64 - COLUMN_WIDTH, y: 64, width: COLUMN_WIDTH, height: 552 }, subject));
      if (!side) throw new Error('No safe text column remains outside the supplied subject region.');
    }
  }
  const { primary, secondary, top } = await prepareCopy(plan);
  let y = top;
  const x = side === 'left' ? 64 : BRAND.width - 64 - COLUMN_WIDTH;
  const boxes = [];
  const layers = [];
  for (const [level, block, color] of [['headline', primary, BRAND.palette.sunrise], ['subheadline', secondary, BRAND.palette.ivory]]) {
    if (level === 'subheadline' && block.lines.length) y += 30 - primary.gap;
    for (const line of block.lines) {
      const box = { x, y, width: line.info.width, height: line.info.height, text: line.text, level, color };
      if (x < 64 || y < 64 || x + box.width > 1216 || y + box.height > 616 || overlaps(box, DURATION_BOX)) throw new Error('Copy exceeds the safe thumbnail area; shorten the headline.');
      if (subject && overlaps(box, subject)) throw new Error('Text would overlap the supplied subject region.');
      boxes.push(box);
      const shadow = await sharp({ create: { width: line.info.width, height: line.info.height, channels: 3, background: BRAND.palette.softBlack } })
        .joinChannel(line.mask).extend({ top: 4, bottom: 4, left: 4, right: 4, background: '#00000000' }).blur(2).png().toBuffer();
      layers.push({ input: shadow, left: x - 2, top: y - 1 }, { input: line.data, left: x, top: y });
      y += line.info.height + block.gap;
    }
  }
  let background;
  let contrast;
  let opacity;
  for (opacity of [0.78, 0.88, 0.95]) {
    background = await sharp(artwork).composite([{ input: scrimSvg(side, opacity) }]).png().toBuffer();
    contrast = await minimumContrast(background, boxes);
    if (contrast >= 4.5) break;
  }
  if (contrast < 4.5) throw new Error('Artwork cannot support sufficient lettering contrast.');
  const markX = x + 18;
  const mark = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720">
    <circle cx="${markX}" cy="86" r="17" fill="${BRAND.palette.navy}" fill-opacity="0.65" stroke="${BRAND.palette.gold}" stroke-opacity="0.55"/>
    <path d="M${markX} 76v21m-7-14h14" fill="none" stroke="${BRAND.palette.gold}" stroke-width="3" stroke-linecap="round"/>
  </svg>`);
  layers.push({ input: mark, left: 0, top: 0 });
  const label = await lettering('JESHUA', 24, BRAND.palette.ivory);
  layers.push({ input: label.data, left: x + 48, top: 77 });
  const composed = await sharp(background).composite(layers).png().toBuffer();
  let jpeg;
  for (const quality of [92, 85, 76, 65]) {
    jpeg = await sharp(composed).jpeg({ quality, progressive: true, chromaSubsampling: '4:4:4' }).toBuffer();
    if (jpeg.length < 2 * 1024 * 1024) break;
  }
  if (jpeg.length >= 2 * 1024 * 1024) throw new Error('Thumbnail exceeds the 2 MB output budget.');
  await fs.mkdir(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, 'thumbnail.jpg');
  const pngPath = path.join(outputDir, 'thumbnail.png');
  await fs.writeFile(outputPath, jpeg);
  await fs.writeFile(pngPath, composed);
  const previews = {};
  for (const width of [320, 160]) {
    previews[width] = path.join(outputDir, `mobile-${width}.jpg`);
    await sharp(jpeg).resize(width).jpeg({ quality: 90 }).toFile(previews[width]);
  }
  const warnings = [...validation.warnings];
  if (metadata.width < 1280 || metadata.height < 720) warnings.push('Source artwork is smaller than the final canvas and was upscaled.');
  if (Math.abs(metadata.width / metadata.height - 16 / 9) > 0.05) warnings.push('Source artwork was cropped to 16:9; inspect the subject framing.');
  if (!subject) warnings.push('Negative-space selection measures image detail, not faces. Inspect subject/text separation.');
  const qa = {
    automaticChecksPassed: true,
    artworkReview: approveArtwork ? 'operator-confirmed' : 'pending',
    requiresVisualReview: true,
    checks: { dimensions: { width: 1280, height: 720 }, fileSizeBytes: jpeg.length, safeMargins: true, timestampClear: true,
      minTextContrast: contrast, contrastThreshold: 4.5, headlineFontSize: primary.fontSize,
      headlineMobileFontSize160: primary.fontSize / 8 },
    layout: { textSide: side, boxes, subjectRegion, negativeSpaceScores: scores, scrimOpacity: opacity },
    artwork: { sha256: crypto.createHash('sha256').update(original).digest('hex'), sourcePath: path.resolve(artworkPath) },
    warnings,
    limitations: ['Geometry and contrast checks do not establish semantic legibility, anatomy or absence of generated lettering. Review both mobile previews.'],
  };
  const qaPath = path.join(outputDir, 'qa.json');
  await fs.writeFile(qaPath, JSON.stringify(qa, null, 2));
  return { path: outputPath, pngPath, previews, qaPath, qa, dimensions: { width: 1280, height: 720 }, fileSize: jpeg.length };
}

module.exports = { renderThumbnail, analyzeNegativeSpace, assertCopyFits };
