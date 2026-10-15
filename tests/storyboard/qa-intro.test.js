// 02/10/2026: la intro de marca (8 s) se pegaba sumándola a la narración y la QA
// comparaba la cobertura de planos contra esa cifra: «Shots end before the narration
// does» falso en el primer largo con marca. La intro solo cuenta para la duración total.
const test = require('node:test');
const assert = require('node:assert');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const { runProductionQA } = require('../../utils/production-qa');
const { getFFmpegPath } = require('../../utils/ffmpeg');

const video = path.join(os.tmpdir(), `qa-intro-${process.pid}.mp4`);
test.before(() => execFileSync(getFFmpegPath(), ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=s=320x180:r=30:d=7', '-f', 'lavfi', '-i', 'sine=d=7',
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', video]));
test.after(() => fs.rmSync(video, { force: true }));

const storyboard = { scenes: [{ shots: [{ start: 0, end: 2, duration: 2 }] }], visualTiming: {} };

test('con 5 s de intro, un vídeo de 7 s y 2 s de narración cuadra', async () => {
  const qa = await runProductionQA({ videoPath: video, storyboard, narrationDurationSec: 2, introSec: 5, expectedWidth: 320, expectedHeight: 180, logger: { info() {}, warn() {}, error() {} } });
  const por = id => qa.checks.find(c => c.id === id);
  assert.strictEqual(por('duration').status, 'passed', por('duration').message);
  assert.ok(!por('shot_coverage') || por('shot_coverage').status !== 'failed');
});
