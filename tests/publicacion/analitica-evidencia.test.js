const test = require('node:test');
const assert = require('node:assert/strict');
const { AnalyticsOptimizationAgent } = require('../../agents/analytics-optimization-agent');

const agent = () => new AnalyticsOptimizationAgent({}, {});
const measured = () => ({
  simulated: false,
  views: { totalViews: 10000, impressionsAvailable: false, averageCTR: 0 },
  watchTime: { available: true, averageViewPercentage: 100 },
  engagement: { engagementRate: 5 }
});

test('an unknown CTR doesn\'t raise a thumbnail alarm', async () => {
  const a = agent();
  const insights = await a.generateInsights({}, measured(), await a.analyzeThumbnailPerformance('id'), { overallSEOScore: 60 });
  assert.equal(insights.some(i => i.category === 'thumbnail' && i.type === 'warning'), false);
});

test('a measured zero CTR does keep the warning', async () => {
  const insights = await agent().generateInsights({}, measured(), { available: true, clickThroughRate: 0, ctrQuality: 'poor' }, { overallSEOScore: 60 });
  assert.equal(insights.some(i => i.category === 'thumbnail' && i.type === 'warning'), true);
});

test('missing CTR doesn\'t subtract twenty points; the breakdown leaves it without data', () => {
  const score = agent().calculatePerformanceScore(measured());
  assert.equal(score.score, 100);
  assert.equal(score.breakdown.ctr, null);
});

test('Shorts retention above 100% doesn\'t overflow the score', () => {
  const data = measured();
  data.watchTime.averageViewPercentage = 180;
  data.views.impressionsAvailable = true;
  data.views.averageCTR = 10;
  assert.equal(agent().calculatePerformanceScore(data).score, 100);
});

test('without retention rows the absence is kept, not a bad retention', async () => {
  const a = agent();
  a.youtubeAnalytics = { reports: { query: async () => ({ data: { rows: [] } }) } };
  const watch = await a.getWatchTimeAnalytics('id', '2026-09-29', '2026-10-02');
  assert.equal(watch.available, false);
  assert.equal(watch.retentionQuality, 'unknown');
  const data = measured(); data.watchTime = watch;
  const insights = await a.generateInsights({}, data, { ctrQuality: 'unknown' }, { overallSEOScore: 60 });
  assert.equal(insights.some(i => i.category === 'retention'), false);
});

test('a retention row measured at zero isn\'t confused with absence', async () => {
  const a = agent();
  a.youtubeAnalytics = { reports: { query: async () => ({ data: { rows: [[0, 0, 0]] } }) } };
  const watch = await a.getWatchTimeAnalytics('id', '2026-09-29', '2026-10-02');
  assert.equal(watch.available, true);
  assert.equal(watch.retentionQuality, 'poor');
});

test('a report without analytics views doesn\'t get a score or negative alerts yet', async () => {
  const a = agent(); const data = measured();
  data.views.totalViews = 0; data.watchTime.available = false;
  assert.equal(a.calculatePerformanceScore(data).score, null);
  const insights = await a.generateInsights({}, data, { ctrQuality: 'unknown' }, { overallSEOScore: 20 });
  assert.equal(insights.some(i => ['critical', 'warning'].includes(i.type)), false);
});

test('simulated analytics produce no editorial recommendations or score', async () => {
  const a = agent(); const data = measured(); data.simulated = true;
  assert.equal(a.calculatePerformanceScore(data).score, null);
  assert.deepEqual(await a.generateInsights({}, data, { clickThroughRate: 10 }, { overallSEOScore: 90 }), []);
});

test('missing demographics don\'t invent age or gender; it picks maxima, not the first row', async () => {
  const a = agent();
  assert.equal(a.identifyPrimaryAudience([], []), null);
  assert.equal(a.identifyPrimaryAudience([['18-24', 10], ['45-54', 80]], [['male', 20], ['female', 80]]), 'females 45-54');
  a.youtubeAnalytics = { reports: { query: async () => { throw new Error('unavailable'); } } };
  assert.deepEqual(await a.getDemographicsAnalytics('id', '2026-09-29', '2026-10-02'), { available: false, ageGroups: [], gender: [], primaryAudience: null });
});

test('the ranking uses performance and excludes reports without evidence', async () => {
  const a = agent();
  const report = (id, score, data = measured()) => ({ videoId: id, analyzedAt: new Date().toISOString(), analytics: data, performance: { score } });
  a.performanceData.set('new', report('new', 30));
  a.performanceData.set('best', report('best', 80));
  a.performanceData.set('fake', report('fake', 100, { ...measured(), simulated: true }));
  a.performanceData.set('pending', report('pending', null, { ...measured(), views: { totalViews: 0 } }));
  const summary = await a.getRecentAnalytics();
  assert.deepEqual(summary.topPerformers.map(r => r.videoId), ['best', 'new']);
  assert.equal(summary.averagePerformanceScore, 55);
  assert.deepEqual(a.generateChannelInsights([report('pending', null, { ...measured(), views: { totalViews: 0 } })]), []);
});

test('on restart it keeps the latest report per video and recomputes without penalizing missing CTR', async () => {
  const a = agent();
  a.db.getAnalyticsHistory = async () => [
    { video_id: 'id', analyzed_at: '2026-10-02T13:00:00Z', analytics: measured(), performance_score: 80 },
    { video_id: 'id', analyzed_at: '2026-10-01T13:00:00Z', analytics: { ...measured(), simulated: true }, performance_score: 90 }
  ];
  await a.loadHistoricalData();
  assert.equal(a.performanceData.size, 1);
  assert.equal(a.performanceData.get('id').analyzedAt, '2026-10-02T13:00:00Z');
  assert.equal(a.performanceData.get('id').performance.score, 100);
});
