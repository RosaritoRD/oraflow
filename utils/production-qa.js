/**
 * Production QA: checks a rendered video against the storyboard, captions and
 * narration before it is marked ready. Returns { passed, checks: [...] } where
 * each check is { id, status: 'passed'|'warning'|'failed', message }.
 * Failures block readiness; warnings are logged and shown for review.
 */
const { execFile } = require('child_process');
const { getFFmpegPath } = require('./ffmpeg');
const { probe } = require('./timeline-renderer');
const captionService = require('./caption-service');
const { allShots } = require('./storyboard-service');

function run(cmd, args) {
  return new Promise(resolve => execFile(cmd, args, { maxBuffer: 16 * 1024 * 1024 }, (error, stdout, stderr) => resolve(`${stdout || ''}${stderr || ''}`)));
}

async function blackAndVolume(videoPath) {
  const out = await run(getFFmpegPath(), ['-i', videoPath, '-vf', 'blackdetect=d=1.0:pix_th=0.05', '-af', 'volumedetect', '-f', 'null', '-']);
  const black = [...out.matchAll(/black_start:([\d.]+) black_end:([\d.]+)/g)].map(m => ({ start: Number(m[1]), end: Number(m[2]) }));
  const max = Number((out.match(/max_volume: (-?[\d.]+) dB/) || [])[1]);
  const mean = Number((out.match(/mean_volume: (-?[\d.]+) dB/) || [])[1]);
  return { black, maxVolumeDb: Number.isFinite(max) ? max : null, meanVolumeDb: Number.isFinite(mean) ? mean : null };
}

async function runProductionQA({ videoPath, storyboard, captions = [], timing = null, narrationDurationSec = 0, introSec = 0, expectedWidth = 1920, expectedHeight = 1080, logger = console }) {
  const checks = [];
  const add = (id, status, message) => checks.push({ id, status, message });

  const info = await probe(videoPath);
  if (!info) {
    add('file', 'failed', 'ffprobe could not read the final video');
    return { passed: false, checks };
  }
  const video = (info.streams || []).find(s => s.codec_type === 'video');
  const audio = (info.streams || []).find(s => s.codec_type === 'audio');
  const duration = Number(info.format?.duration) || 0;

  // resolution / fps / streams
  if (!video) add('video_stream', 'failed', 'No video stream');
  else if (video.width !== expectedWidth || video.height !== expectedHeight) add('resolution', 'failed', `Resolution ${video.width}x${video.height}, expected ${expectedWidth}x${expectedHeight}`);
  else add('resolution', 'passed', `${video.width}x${video.height}`);
  if (!audio) add('audio_stream', 'failed', 'No audio stream');
  else add('audio_stream', 'passed', 'Audio present');

  // audio is the source of truth
  if (narrationDurationSec > 0) {
    // The brand intro goes in front of the already mixed video: it only counts for the total duration.
    const diff = duration - narrationDurationSec - (Number(introSec) || 0);
    if (diff < -0.5) add('duration', 'failed', `Video (${duration.toFixed(1)}s) is shorter than the narration (${narrationDurationSec.toFixed(1)}s): the voice is cut`);
    else if (diff > 3) add('duration', 'warning', `Video runs ${diff.toFixed(1)}s past the narration`);
    else add('duration', 'passed', `Video ${duration.toFixed(1)}s vs narration ${narrationDurationSec.toFixed(1)}s`);
  }

  // shots: gaps, coverage, lengths, repetition
  const shots = allShots(storyboard);
  if (!shots.length) add('shots', 'failed', 'Storyboard has no shots');
  else {
    let gaps = 0;
    for (let i = 1; i < shots.length; i += 1) if (Math.abs(shots[i].start - shots[i - 1].end) > 0.05) gaps += 1;
    add('shot_gaps', gaps ? 'failed' : 'passed', gaps ? `${gaps} gaps between shots` : 'Shots are contiguous');
    if (shots[shots.length - 1].end < narrationDurationSec - 0.5) add('shot_coverage', 'failed', 'Shots end before the narration does');
    const vt = storyboard.visualTiming || {};
    const tooLong = shots.filter(s => s.duration > ((vt.hero?.max || 10) + 0.5)).length;
    const tooShort = shots.filter(s => s.duration < 2).length;
    add('shot_lengths', tooLong || tooShort ? 'warning' : 'passed', `${shots.length} shots, median ${median(shots.map(s => s.duration)).toFixed(1)}s${tooLong ? `, ${tooLong} over ${(vt.hero?.max || 10)}s` : ''}${tooShort ? `, ${tooShort} under 2s` : ''}`);
    const missing = shots.filter(s => !s.selectedAsset?.localPath).length;
    add('assets', missing ? (missing === shots.length ? 'warning' : 'warning') : 'passed', missing ? `${missing}/${shots.length} shots use a placeholder background` : 'Every shot has an asset');
    const ids = shots.map(s => s.selectedAsset?.assetId || s.selectedAsset?.localPath).filter(Boolean);
    const repeats = ids.length - new Set(ids).size;
    let consecutive = 0;
    for (let i = 1; i < ids.length; i += 1) if (ids[i] && ids[i] === ids[i - 1]) consecutive += 1;
    add('repetition', consecutive ? 'warning' : 'passed', consecutive ? `${consecutive} consecutive shots reuse the same asset (${repeats} repeats overall)` : `${repeats} repeated assets overall`);
  }

  // captions
  if (captions.length) {
    const problems = captionService.lint(captions);
    add('captions', problems.length ? 'warning' : 'passed', problems.length ? problems.slice(0, 5).join('; ') : `${captions.length} captions, max ${Math.max(...captions.map(c => c.lines.length))} lines`);
    const last = captions[captions.length - 1];
    if (narrationDurationSec && last.end > narrationDurationSec + 1) add('caption_sync', 'failed', 'Captions run past the narration');
    else add('caption_sync', 'passed', `Caption timing source: ${timing?.source || 'unknown'}`);
  } else add('captions', 'warning', 'No captions generated');

  // pace: words per minute of the real narration
  if (timing?.words?.length && narrationDurationSec) {
    const wpm = timing.words.length / (narrationDurationSec / 60);
    add('voice_pace', wpm > 175 ? 'warning' : 'passed', `${wpm.toFixed(0)} words/min`);
  }

  // black frames + clipping (one decode pass)
  try {
    const { black, maxVolumeDb } = await blackAndVolume(videoPath);
    const unexpected = black.filter(b => b.start > 1 && b.end < duration - 1);
    add('black_frames', unexpected.length ? 'failed' : 'passed', unexpected.length ? `Black screen at ${unexpected.map(b => b.start.toFixed(1)).join(', ')}s` : 'No black screen');
    if (maxVolumeDb !== null) add('audio_clipping', maxVolumeDb > -0.1 ? 'warning' : 'passed', `Peak ${maxVolumeDb} dB`);
  } catch (error) {
    add('black_frames', 'warning', `Could not scan: ${error.message}`);
  }

  const passed = !checks.some(c => c.status === 'failed');
  for (const check of checks) {
    if (check.status !== 'passed') (check.status === 'failed' ? logger.error : logger.warn)?.call(logger, `QA ${check.id}: ${check.message}`);
  }
  return { passed, checks, durationSec: duration };
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

module.exports = { runProductionQA, median };
