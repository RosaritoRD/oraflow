// 02/10/2026: YouTube Analytics v2 rejects «impressions» («Unknown identifier»), and since
// it was in the same query as views, ALL analytics fell back to simulated data and the
// channel's learning discarded the video. Views are requested on their own; no impressions.
const test = require('node:test');
const assert = require('node:assert');
const { AnalyticsOptimizationAgent } = require('../../agents/analytics-optimization-agent');

function agenteCon(respuestas) {
  const agent = new AnalyticsOptimizationAgent({}, {});
  agent.youtubeAnalytics = {
    reports: {
      query: async params => {
        if (/impression/i.test(params.metrics)) throw new Error('Unknown identifier (impressions) given in field parameters.metrics.');
        return { data: { rows: respuestas[params.metrics] || [] } };
      }
    }
  };
  return agent;
}

test('daily views are requested without impressions and add up correctly', async () => {
  const agent = agenteCon({ views: [['2026-10-01', 100], ['2026-10-02', 50]] });
  const v = await agent.getViewsAnalytics('abc', '2026-10-01', '2026-10-02');
  assert.strictEqual(v.totalViews, 150);
  assert.strictEqual(v.totalImpressions, 0);
  assert.strictEqual(v.impressionsAvailable, false);
});

test('thumbnail performance doesn\'t query a metric that doesn\'t exist', async () => {
  let consultas = 0;
  const agent = agenteCon({});
  const original = agent.youtubeAnalytics.reports.query;
  agent.youtubeAnalytics.reports.query = async p => { consultas++; return original(p); };
  const t = await agent.analyzeThumbnailPerformance('abc');
  assert.strictEqual(consultas, 0);
  assert.strictEqual(t.ctrQuality, 'unknown');
});
