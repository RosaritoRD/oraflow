const test = require('node:test');
const assert = require('node:assert/strict');
const { AnalyticsOptimizationAgent } = require('../../agents/analytics-optimization-agent');

function agent(rows = []) {
  const a = new AnalyticsOptimizationAgent({}, {});
  a.youtubeAnalytics = { reports: { query: async () => ({ data: { rows } }) } };
  return a;
}
const period = ['video', '2026-10-01', '2026-10-03'];

test('the main source is picked by views; it recognizes search and related from the real API', async () => {
  const a = agent([['NO_LINK_OTHER', 0], ['YT_SEARCH', 300], ['RELATED_VIDEO', 600], ['EXT_URL', 100]]);
  const traffic = await a.getTrafficSourcesAnalytics(...period);
  assert.equal(traffic.topSource, 'RELATED_VIDEO');
  assert.equal(traffic.organicPercentage, 90);
  assert.equal(a.analyzeSearchPerformance(traffic).searchPercentage, 30);
  assert.equal(a.analyzeSearchPerformance(traffic).searchQuality, 'good');
});

test('without traffic views it doesn\'t invent a main source or NaN percentages', async () => {
  for (const rows of [[], [['YT_SEARCH', 0], ['SHORTS', 0]]]) {
    const a = agent(rows);
    const traffic = await a.getTrafficSourcesAnalytics(...period);
    assert.equal(traffic.available, false);
    assert.equal(traffic.topSource, 'unknown');
    assert.equal(traffic.organicPercentage, null);
    assert.ok(traffic.sources.every(s => s.percentage === null));
    const search = a.analyzeSearchPerformance(traffic);
    assert.equal(search.searchQuality, 'unknown');
    assert.equal(search.searchPercentage, null);
    assert.ok(!a.generateSEORecommendations(100, 100, 100, search).some(r => /search optimization/i.test(r)));
  }
});

test('reloading old reports fixes the source and the search recommendation', async () => {
  const a = agent();
  a.db.getAnalyticsHistory = async () => [{
    video_id: 'old', analyzed_at: '2026-10-03T13:00:00Z',
    analytics: { views: { totalViews: 100 }, trafficSources: {
      sources: [{ source: 'NO_LINK_OTHER', views: 0, percentage: '0' }, { source: 'YT_SEARCH', views: 30, percentage: '30' }, { source: 'SHORTS', views: 70, percentage: '70' }], topSource: 'NO_LINK_OTHER', organicPercentage: 0
    } },
    seoMetrics: { titleScore: 100, descriptionScore: 100, tagScore: 100, searchPerformance: { searchPercentage: 0 }, recommendations: ['Focus on search optimization to improve organic discovery'] }
  }];
  await a.loadHistoricalData();
  const report = a.performanceData.get('old');
  assert.equal(report.analytics.trafficSources.topSource, 'SHORTS');
  assert.equal(report.seoMetrics.searchPerformance.searchPercentage, 30);
  assert.deepEqual(report.seoMetrics.recommendations, []);
});

test('missing or invalid subscriber and revenue rows stay without data, not as zero', async () => {
  for (const rows of [undefined, [], [[]], [[null, null, null]], [['', '', '']], [[NaN, 0, 0]]]) {
    const result = await agent(rows).getOutcomeAnalytics(...period);
    assert.equal(result.subscribersAvailable, false);
    assert.equal(result.netSubscribers, null);
    assert.equal(result.revenueAvailable, false);
    assert.equal(result.estimatedRevenue, null);
  }
});

test('a measured zero and a net subscriber loss are valid results', async () => {
  const a = agent();
  a.youtubeAnalytics.reports.query = async query => ({ data: { rows: query.metrics.includes('estimatedRevenue')
    ? [[0, 0, 0]] : [['2026-10-01', 100, 50, 0, 0]] } });
  const zero = await a.getOutcomeAnalytics(...period);
  assert.equal(zero.subscribersAvailable, true);
  assert.equal(zero.revenueAvailable, true);
  assert.equal(zero.netSubscribers, 0);
  assert.equal(zero.estimatedRevenue, 0);
  assert.equal((await agent([['2026-10-01', 100, 50, 2, 5]]).getOutcomeAnalytics(...period)).netSubscribers, -3);
});

function measuredAgent() {
  const a = agent();
  a.getViewsAnalytics = async () => ({ available: true, totalViews: 250, impressionsAvailable: false });
  a.getWatchTimeAnalytics = async () => ({ available: true, totalWatchTime: 100, averageViewPercentage: 60 });
  a.getDemographicsAnalytics = async () => ({ available: true, ageGroups: [], gender: [] });
  a.getTrafficSourcesAnalytics = async () => ({ available: true, sources: [{ source: 'SHORTS', views: 250, percentage: '100' }], topSource: 'SHORTS' });
  a.getDeviceAnalytics = async () => ({ available: true, devices: [] });
  a.getOutcomeAnalytics = async () => ({ subscribersAvailable: true, netSubscribers: 4 });
  a.calculateEngagementMetrics = async () => ({ available: true, engagementRate: 4 });
  return a;
}

for (const [method, field] of [
  ['getWatchTimeAnalytics', 'watchTime'], ['getTrafficSourcesAnalytics', 'trafficSources'],
  ['getDeviceAnalytics', 'devices'], ['calculateEngagementMetrics', 'engagement']
]) {
  test(`a failure in ${field} keeps the real views and flags only that group as missing`, async () => {
    const a = measuredAgent();
    a[method] = async () => { throw new Error('temporary API error'); };
    const result = await a.getVideoAnalytics('video', { startDate: period[1], endDate: period[2] });
    assert.equal(result.simulated, false);
    assert.equal(result.available, true);
    assert.equal(result.partial, true);
    assert.equal(result.views.totalViews, 250);
    assert.equal(result.outcomes.netSubscribers, 4);
    assert.equal(result[field].available, false);
    assert.ok(result.unavailableMetrics.includes(field));
    if (field === 'engagement') {
      assert.equal(a.calculatePerformanceScore(result).breakdown.engagement, null);
      const insights = await a.generateInsights({}, result, { available: false }, { overallSEOScore: 100 });
      assert.ok(!insights.some(i => i.category === 'engagement'));
    }
  });
}

test('if the views query fails it doesn\'t fabricate views or ratings', async () => {
  const a = measuredAgent();
  a.getViewsAnalytics = async () => { throw new Error('unavailable'); };
  const result = await a.getVideoAnalytics('video');
  assert.equal(result.available, false);
  assert.equal(result.views.totalViews, null);
  assert.equal(result.outcomes.netSubscribers, 4, 'conserva los grupos que sí llegaron');
  assert.equal(a.calculatePerformanceScore(result).score, null);
});

test('a total failure doesn\'t create random figures', async () => {
  const a = agent();
  a.youtubeAnalytics.reports.query = async () => { throw new Error('offline'); };
  a.getVideoDetails = async () => { throw new Error('offline'); };
  const result = await a.getVideoAnalytics('video');
  assert.equal(result.available, false);
  assert.equal(result.views.totalViews, null);
  assert.equal(result.watchTime.averageViewPercentage, null);
  assert.equal(result.engagement.engagementRate, null);
  assert.equal(result.outcomes.netSubscribers, null);
});

test('an empty views query isn\'t treated as a zero measurement', async () => {
  const empty = await agent([]).getViewsAnalytics(...period);
  assert.equal(empty.available, false);
  assert.equal(empty.totalViews, null);
  const zero = await agent([['2026-10-01', 0]]).getViewsAnalytics(...period);
  assert.equal(zero.available, true);
  assert.equal(zero.totalViews, 0);
});

test('a report without measurable views is stored as a diagnostic, without feeding learning or retention', async () => {
  const a = agent();
  let saved = 0;
  a.db.getPublishedContentContext = async () => ({});
  a.db.saveAnalyticsReport = async () => { saved++; };
  a.getVideoDetails = async () => ({ title: 'Oración para descansar', description: 'Oración.', tags: [], duration: 'PT1M', publishedAt: '2026-10-01T23:00:00Z' });
  a.getVideoAnalytics = async () => a.unavailableAnalytics();
  a.learning.capture = async () => { assert.fail('no debe enseñar con datos ausentes'); };
  a.getAudienceRetention = async () => { assert.fail('no debe pedir curvas sin vistas medibles'); };
  const report = await a.analyzeVideoPerformance('video');
  assert.equal(saved, 1);
  assert.equal(report.performance.score, null);
  assert.equal(report.learningSnapshot, undefined);
  assert.equal(report.retention.available, false);
});

test('indicators don\'t rate or rank data explicitly flagged as unavailable', async () => {
  const a = agent();
  const analytics = { available: false, views: { totalViews: 1000 }, watchTime: { averageViewPercentage: 80 } };
  assert.equal(a.calculatePerformanceScore(analytics).score, null);
  assert.equal(a.hasRetention(analytics), false);
  assert.deepEqual(a.scoredReports([{ analytics, performance: { score: 100 } }]), []);
  assert.deepEqual(await a.generateInsights({}, analytics, {}, { overallSEOScore: 100 }), []);
});
