/* global i18n */
/* global ui, api, escapeHTML, empty, showToast */
// Outliers tab: videos that beat their channel's median by a wide margin (GET /api/outliers).
(() => {
  'use strict';

  const $ = selector => document.querySelector(selector);
  const state = ui.outliers = { last: null, loading: false };
  const fmt = n => Intl.NumberFormat(i18n.language === 'es' ? 'es' : 'en').format(Math.round(n));

  function duration(s) {
    if (s == null) return '';
    const m = Math.floor(s / 60);
    return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : m ? `${m}:${String(s % 60).padStart(2, '0')}` : `${s} s`;
  }

  function row(r) {
    const tier = r.score >= 20 ? 'hot' : r.score >= 8 ? 'warm' : '';
    return `<li class="outlier-row">
      <a class="outlier-thumb" href="${escapeHTML(r.url)}" target="_blank" rel="noopener noreferrer">
        ${r.thumbnail ? `<img src="${escapeHTML(r.thumbnail)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ''}
        <span>${escapeHTML(duration(r.seconds))}</span>
      </a>
      <div class="outlier-body">
        <a class="outlier-title" href="${escapeHTML(r.url)}" target="_blank" rel="noopener noreferrer">${escapeHTML(r.title)}</a>
        <p class="meta-line">${escapeHTML(r.channel)} · ${escapeHTML(fmt(r.subs))} ${escapeHTML(i18n.t('subs'))} · ${escapeHTML(r.publishedAt)}</p>
        <p class="meta-line">${escapeHTML(fmt(r.views))} ${escapeHTML(i18n.t('views'))} · ${escapeHTML(i18n.t('channel median'))} ${escapeHTML(fmt(r.baseline))}</p>
      </div>
      <strong class="outlier-score ${tier}">${escapeHTML(r.score.toFixed(1))}×</strong>
    </li>`;
  }

  function render() {
    const box = $('#outliers-results');
    const r = state.last;
    $('#outliers-status').textContent = state.loading ? i18n.t('Searching') : i18n.t('Ready');
    $('#outliers-status').className = `status ${state.loading ? 'running' : 'ready'}`;
    $('#outliers-search').disabled = state.loading;
    if (!r) { box.innerHTML = empty(i18n.t('Type a topic and search. Each search uses about 150–300 of the 10,000 daily YouTube API units.')); return; }
    $('#outliers-summary').textContent = i18n.msg`${r.results.length} of ${r.scanned} videos beat their channel ${r.minScore}× or more · ${r.quota} quota units`
      + (r.cached ? ` · ${i18n.t('from cache')}` : '');
    box.innerHTML = r.results.length
      ? `<ol class="outlier-list">${r.results.map(row).join('')}</ol>`
      : empty(i18n.t('No video beats its channel by that much. Lower the minimum or widen the dates.'));
  }

  async function search(event) {
    event?.preventDefault();
    if (state.loading) return;
    const form = new FormData($('#outliers-form'));
    const params = new URLSearchParams();
    for (const [k, v] of form) if (String(v).trim() !== '') params.set(k, String(v).trim());
    state.loading = true;
    render();
    try {
      state.last = (await api(`/api/outliers?${params}`)).result;
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      state.loading = false;
      render();
    }
  }

  $('#outliers-form').addEventListener('submit', search);
  document.querySelectorAll('[data-outliers-example]').forEach(chip => chip.addEventListener('click', () => {
    const [q, lang] = chip.dataset.outliersExample.split('|');
    $('#outliers-q').value = q;
    $('#outliers-lang').value = lang;
    search();
  }));
  window.renderOutliers = render;
})();
