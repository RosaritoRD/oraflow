const validDay = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const count = value => Number.isFinite(value) && value >= 0;

// A single daily query guarantees the same data cut for the numerator and the
// denominators, even while YouTube is still processing the last few days.
function subscriberConversion(rows, requestedPeriod) {
  const empty = { available: false, requestedPeriod, period: null, views: null, engagedViews: null, subscribersGained: null, subscribersLost: null };
  if (!Array.isArray(rows) || !rows.length || rows.some(row => !Array.isArray(row) || row.length !== 5 ||
    !validDay(row[0]) || !row.slice(1).every(count) || row[0] < requestedPeriod.startDate || row[0] > requestedPeriod.endDate)) return empty;
  const days = rows.map(row => row[0]).sort();
  if (new Set(days).size !== days.length) return empty;
  const sum = index => rows.reduce((total, row) => total + row[index], 0);
  return {
    available: true, requestedPeriod,
    period: { startDate: days[0], endDate: days.at(-1) },
    views: sum(1), engagedViews: sum(2), subscribersGained: sum(3), subscribersLost: sum(4)
  };
}

function subscriberGrowthSummary(reports) {
  const groups = ['short', 'long_form', 'unknown'].map(format => ({
    format, denominator: format === 'short' ? 'engagedViews' : 'views', videos: []
  }));
  for (const report of reports) {
    const group = groups.find(g => g.format === report.contentFormat) || groups[2];
    const data = report.analytics?.outcomes?.conversion;
    const available = !report.analytics?.simulated && data?.available === true &&
      validDay(data.period?.startDate) && validDay(data.period?.endDate) && data.period.startDate <= data.period.endDate &&
      [data.views, data.engagedViews, data.subscribersGained, data.subscribersLost].every(count);
    const denominator = available ? data[group.denominator] : null;
    const measured = available && denominator > 0;
    group.videos.push({
      videoId: report.videoId,
      title: report.videoDetails?.title || report.title || '',
      analyzedAt: report.analyzedAt,
      status: measured ? 'measured' : 'pending',
      period: available ? data.period : null,
      views: available ? data.views : null,
      engagedViews: available ? data.engagedViews : null,
      subscribersGained: available ? data.subscribersGained : null,
      ratePerThousand: measured ? Number((data.subscribersGained / denominator * 1000).toFixed(2)) : null
    });
  }
  for (const group of groups) {
    group.measuredVideos = group.videos.filter(v => v.status === 'measured').length;
    group.pendingVideos = group.videos.length - group.measuredVideos;
  }
  return { groups: groups.filter(g => g.format !== 'unknown' || g.videos.length) };
}

module.exports = { subscriberConversion, subscriberGrowthSummary };
