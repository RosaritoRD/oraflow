const test = require('node:test');
const assert = require('node:assert/strict');
const { AnalyticsOptimizationAgent } = require('../../agents/analytics-optimization-agent');
const { Database } = require('../../database/db');

function analytics(rows) {
  const agent = new AnalyticsOptimizationAgent({}, {});
  agent.youtubeAnalytics = { reports: { query: async query => {
    if (query.metrics.includes('estimatedRevenue')) throw new Error('not monetized');
    return { data: { rows } };
  } } };
  return agent;
}

test('queries views, engaged views and subscribers together, and keeps the days actually returned', async () => {
  const a = analytics();
  let request;
  a.youtubeAnalytics.reports.query = async query => {
    if (query.metrics.includes('estimatedRevenue')) throw new Error('not monetized');
    request = query;
    return { data: { rows: [['2026-10-01', 100, 40, 1, 0], ['2026-10-02', 900, 160, 3, 1]] } };
  };
  const result = await a.getOutcomeAnalytics('id', '2026-10-01', '2026-10-03');
  assert.equal(request.metrics, 'views,engagedViews,subscribersGained,subscribersLost');
  assert.equal(request.dimensions, 'day');
  assert.equal(result.subscribersGained, 4);
  assert.equal(result.netSubscribers, 3);
  assert.equal(result.conversion.views, 1000);
  assert.equal(result.conversion.engagedViews, 200);
  assert.deepEqual(result.conversion.period, { startDate: '2026-10-01', endDate: '2026-10-02' });
  assert.deepEqual(result.conversion.requestedPeriod, { startDate: '2026-10-01', endDate: '2026-10-03' });
});

test('a row measured with zeros is told apart from missing or invalid rows', async () => {
  const zero = await analytics([['2026-10-01', 100, 50, 0, 0]]).getOutcomeAnalytics('id', '2026-10-01', '2026-10-03');
  assert.equal(zero.subscribersAvailable, true);
  assert.equal(zero.subscribersGained, 0);
  for (const rows of [[], [['2026-10-01', null, 5, 0, 0]], [['bad-date', 10, 5, 0, 0]], [['2026-10-01', 10, -1, 0, 0]]]) {
    const result = await analytics(rows).getOutcomeAnalytics('id', '2026-10-01', '2026-10-03');
    assert.equal(result.subscribersAvailable, false);
    assert.equal(result.conversion.available, false);
  }
});

function report(id, contentFormat, conversion) {
  return { videoId: id, contentFormat, analyzedAt: new Date().toISOString(),
    videoDetails: { title: `Title ${id}`, statistics: { viewCount: 999999 } },
    analytics: { simulated: false, views: { totalViews: 88888 }, outcomes: { conversion } }
  };
}
const conversion = (gained = 4, engagedViews = 200) => ({
  available: true, views: 1000, engagedViews, subscribersGained: gained, subscribersLost: 1,
  period: { startDate: '2026-10-01', endDate: '2026-10-02' }
});

test('separates formats and computes with the joint query, never with public views or another report\'s', async () => {
  const a = analytics();
  for (const r of [report('short', 'short', conversion()), report('long', 'long_form', conversion()), report('unknown', null, conversion())]) a.performanceData.set(r.videoId, r);
  const growth = (await a.getRecentAnalytics()).subscriberGrowth;
  assert.equal(growth.groups.find(g => g.format === 'short').videos[0].ratePerThousand, 20);
  assert.equal(growth.groups.find(g => g.format === 'short').denominator, 'engagedViews');
  assert.equal(growth.groups.find(g => g.format === 'long_form').videos[0].ratePerThousand, 4);
  assert.equal(growth.groups.find(g => g.format === 'unknown').videos.length, 1);
});

test('keeps the real zero and leaves history, simulations and Shorts without engaged views pending', async () => {
  const a = analytics();
  const rows = [report('zero', 'short', conversion(0)), report('old', 'short', null), report('no-engaged', 'short', conversion(4, 0)), report('simulated', 'short', conversion())];
  rows[3].analytics.simulated = true;
  for (const r of rows) a.performanceData.set(r.videoId, r);
  const group = (await a.getRecentAnalytics()).subscriberGrowth.groups.find(g => g.format === 'short');
  assert.equal(group.measuredVideos, 1);
  assert.equal(group.pendingVideos, 3);
  assert.equal(group.videos.find(v => v.videoId === 'zero').ratePerThousand, 0);
  for (const id of ['old', 'no-engaged', 'simulated']) assert.equal(group.videos.find(v => v.videoId === id).ratePerThousand, null);
});

function contextDb(metadata, strategy = {}) {
  const db = new Database();
  db.getRow = async sql => sql.includes('FROM publish_schedule')
    ? { production_id: 'prod', title: 'Test', metadata: JSON.stringify(metadata) }
    : { strategy: JSON.stringify(strategy), script: '{}', thumbnail: '{}', seo: '{}' };
  db.listProductionScenes = async () => [{ duration: 30 }, { duration: 60 }];
  db.getShortClip = async () => ({ duration: 25 });
  return db;
}

test('a native Short is recognized even if contentType is long_form', async () => {
  const context = await contextDb({ contentType: 'long_form', contentFormat: 'short' }).getPublishedContentContext('id');
  assert.equal(context.contentFormat, 'short');
  assert.equal(context.strategy.requestedStyle, 'shorts');
  assert.equal(context.retentionDuration, 90);
});

test('the strategy format serves as a fallback and a clip keeps its trimmed duration', async () => {
  assert.equal((await contextDb({}, { contentFormat: 'short' }).getPublishedContentContext('id')).contentFormat, 'short');
  assert.equal((await contextDb({ contentType: 'short', shortClipId: 'clip' }).getPublishedContentContext('id')).retentionDuration, 25);
  assert.equal((await contextDb({ contentFormat: 'long' }).getPublishedContentContext('id')).contentFormat, 'long_form');
});

test('on restart it loads the format of the latest reports from their publishing data', async () => {
  const a = analytics();
  a.db.getAnalyticsHistory = async () => [{ video_id: 'native-short', analyzed_at: new Date().toISOString(), analytics: { outcomes: { conversion: conversion() } } }];
  a.db.getPublishedContentContext = async () => ({ contentFormat: 'short' });
  await a.loadHistoricalData();
  assert.equal(a.performanceData.get('native-short').contentFormat, 'short');
  assert.equal((await a.getRecentAnalytics()).subscriberGrowth.groups.find(g => g.format === 'short').measuredVideos, 1);
});
