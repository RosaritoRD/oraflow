// 02/10/2026: YouTube Analytics v2 rechaza «impressions» («Unknown identifier»), y como
// iba en la misma consulta que las vistas, TODA la analítica caía a datos simulados y el
// aprendizaje del canal descartaba el vídeo. Las vistas se piden solas; sin impresiones.
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

test('las vistas por día se piden sin impressions y suman bien', async () => {
  const agent = agenteCon({ views: [['2026-10-01', 100], ['2026-10-02', 50]] });
  const v = await agent.getViewsAnalytics('abc', '2026-10-01', '2026-10-02');
  assert.strictEqual(v.totalViews, 150);
  assert.strictEqual(v.totalImpressions, 0);
  assert.strictEqual(v.impressionsAvailable, false);
});

test('el rendimiento de miniatura no consulta una métrica que no existe', async () => {
  let consultas = 0;
  const agent = agenteCon({});
  const original = agent.youtubeAnalytics.reports.query;
  agent.youtubeAnalytics.reports.query = async p => { consultas++; return original(p); };
  const t = await agent.analyzeThumbnailPerformance('abc');
  assert.strictEqual(consultas, 0);
  assert.strictEqual(t.ctrQuality, 'unknown');
});
