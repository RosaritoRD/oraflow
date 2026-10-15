#!/usr/bin/env node
const fs = require('fs').promises;
const path = require('path');
const { parseArgs } = require('node:util');
const { JeshuaThumbnailService } = require('../utils/jeshua-thumbnail-service');

async function main(args = process.argv.slice(2)) {
  const { values } = parseArgs({ args, options: {
    input: { type: 'string' }, artwork: { type: 'string' }, out: { type: 'string', default: 'data/thumbnails/jeshua' },
    variants: { type: 'string', default: '1' }, 'plan-only': { type: 'boolean' }, generate: { type: 'boolean' },
    'approve-artwork': { type: 'boolean' }, 'text-side': { type: 'string', default: 'auto' }, help: { type: 'boolean' },
  } });
  if (values.help) {
    console.log('Usage: npm run thumbnail:jeshua -- --input brief.json [--plan-only | --artwork image.jpg | --generate] [--variants 1..4] [--out directory] [--text-side auto|left|right] [--approve-artwork]');
    return;
  }
  if (!values.input) throw new Error('--input is required. Use --help for usage.');
  const input = JSON.parse(await fs.readFile(values.input, 'utf8'));
  const variants = Number(values.variants);
  const serviceOptions = {};
  if (values.generate && !values['plan-only'] && !values.artwork) {
    // Explicit generation opts into the application's existing providers.
    require('dotenv').config({ quiet: true });
    const { AIVideoGenerator } = require('../utils/ai-video-generator');
    const { AITextService } = require('../utils/ai-text-service');
    serviceOptions.imageGenerator = new AIVideoGenerator({});
    serviceOptions.aiTextService = new AITextService({});
  }
  const result = await new JeshuaThumbnailService(serviceOptions).create(input, {
    outputDir: path.resolve(values.out), artworkPath: values.artwork ? path.resolve(values.artwork) : null,
    variants, planOnly: Boolean(values['plan-only']), generate: Boolean(values.generate),
    approveArtwork: Boolean(values['approve-artwork']), textSide: values['text-side'],
    subjectRegion: input.subject_region || null,
  });
  console.log(JSON.stringify({ manifest: result.manifestPath, variants: result.variants.map(item => ({ plan: item.planPath, thumbnail: item.path, mobile: item.previews, qa: item.qaPath })) }, null, 2));
  return result;
}

if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { main };
