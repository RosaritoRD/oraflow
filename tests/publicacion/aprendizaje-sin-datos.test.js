const test = require('node:test');
const assert = require('node:assert/strict');
const { ChannelLearningEngine } = require('../../utils/channel-learning-engine');
const { GrowthExperimentService } = require('../../utils/growth-experiment-service');

test('el aprendizaje conserva métricas ausentes como null hasta los indicadores derivados', () => {
  const metrics = new ChannelLearningEngine({}).normalizeMetrics({
    analytics: {
      views: { available: true, totalViews: 300, impressionsAvailable: false, totalImpressions: 0, averageCTR: 0 },
      watchTime: { available: false, totalWatchTime: 0, averageViewPercentage: 0 },
      engagement: { available: false, engagementRate: 0 },
      outcomes: { subscribersAvailable: false, netSubscribers: 0, revenueAvailable: false, estimatedRevenue: 0 }
    }, thumbnailMetrics: { available: false, impressions: 0, clickThroughRate: 0 }, performance: { score: null }
  });
  assert.equal(metrics.views, 300);
  for (const key of ['impressions', 'ctr', 'retention', 'watchMinutes', 'watchHours', 'watchHoursPerThousandViews', 'engagementRate', 'performanceScore', 'netSubscribers', 'estimatedRevenue']) {
    assert.equal(metrics[key], null, `${key} no debe convertirse en un cero medido`);
  }
});

test('el aprendizaje conserva ceros medidos', () => {
  const metrics = new ChannelLearningEngine({}).normalizeMetrics({ analytics: {
    views: { available: true, totalViews: 300, impressionsAvailable: true, totalImpressions: 1000, averageCTR: 0 },
    watchTime: { available: true, totalWatchTime: 0, averageViewPercentage: 0 },
    engagement: { available: true, engagementRate: 0 },
    outcomes: { subscribersAvailable: true, netSubscribers: 0 }
  }, performance: { score: 0 } });
  for (const key of ['ctr', 'retention', 'watchMinutes', 'engagementRate', 'performanceScore', 'netSubscribers']) assert.equal(metrics[key], 0);
});

test('no recomienda una duración ni un título por comparar datos ausentes con buenos resultados', () => {
  const engine = new ChannelLearningEngine({});
  const samples = [0, 1, 2, 3].map(i => ({
    contentAttributes: { length: i < 2 ? 'short' : 'long', titleLength: i < 2 ? 'concise' : 'long' },
    metrics: { impressions: 1000, retention: i < 2 ? null : 70, ctr: i < 2 ? null : 8 }
  }));
  assert.deepEqual(engine.buildDimensionRecommendations(samples), []);
  assert.deepEqual(engine.buildChannelRecommendations(samples.map(s => ({ ...s, metrics: { impressions: 1000, retention: null, ctr: null } }))), []);
});

function report() {
  return { analytics: {
    simulated: false, available: true,
    views: { totalViews: 100, totalImpressions: 1000, averageCTR: 5 },
    watchTime: { available: true, totalWatchTime: 60, averageViewPercentage: 50 },
    trafficSources: { available: true, sources: [{ source: 'YT_SEARCH', percentage: '100' }] },
    outcomes: { subscribersAvailable: false, netSubscribers: null, revenueAvailable: false, estimatedRevenue: null }
  }, thumbnailMetrics: { available: true, impressions: 1000, clickThroughRate: 5 } };
}

test('los experimentos mantienen ausentes suscriptores e ingresos en la captura y la diferencia', async () => {
  const service = new GrowthExperimentService({}, { analyzeVideoPerformance: async () => report() }, {});
  const { metrics } = await service.captureMetrics('video');
  assert.equal(metrics.netSubscribers, null);
  assert.equal(metrics.estimatedRevenue, null);
  const result = service.calculateArmResult({ views: 10, netSubscribers: null, estimatedRevenue: null }, { views: 100, netSubscribers: 8, estimatedRevenue: 3 });
  assert.equal(result.netSubscribers, null);
  assert.equal(result.estimatedRevenue, null);
  const measured = service.calculateArmResult({ netSubscribers: 3, estimatedRevenue: 0 }, { netSubscribers: 1, estimatedRevenue: 0 });
  assert.equal(measured.netSubscribers, -2);
  assert.equal(measured.estimatedRevenue, 0);
});

test('un experimento no avanza si faltan las métricas que determinan el ganador', async () => {
  for (const key of ['views', 'watchTime', 'trafficSources', 'ctr']) {
    const data = report();
    if (key === 'ctr') {
      data.thumbnailMetrics.available = false;
      data.analytics.views.impressionsAvailable = false;
    } else data.analytics[key].available = false;
    const service = new GrowthExperimentService({}, { analyzeVideoPerformance: async () => data }, {});
    await assert.rejects(service.captureMetrics('video'), { code: 'EXPERIMENT_EVIDENCE_UNAVAILABLE' });
  }
});
