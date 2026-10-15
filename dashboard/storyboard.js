/* global i18n */
/* global api, escapeHTML, empty, statusChip, formatDate, label */
(() => {
  'use strict';

  let requestId = 0;
  let activeProductionId = null;

  function time(value) {
    const seconds = Number(value);
    if (!Number.isFinite(seconds)) return '—';
    return `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(2).padStart(5, '0')}`;
  }

  function range(start, end) {
    return `${time(start)} – ${time(end)}`;
  }

  function safePreview(value) {
    if (!value) return '';
    try {
      const url = new URL(value, location.origin);
      return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
    } catch (_) { return ''; }
  }

  function renderShot(shot, index) {
    const asset = shot.selectedAsset;
    const preview = safePreview(asset?.previewUrl);
    const type = asset?.type || shot.preferredAssetType;
    return i18n.html`<article class="storyboard-shot">
      <div class="storyboard-shot-preview">${preview ? type === 'video'
        ? i18n.html`<video controls preload="none" src="${escapeHTML(preview)}" aria-label="Selected video asset"></video>`
        : i18n.html`<img loading="lazy" src="${escapeHTML(preview)}" alt="${escapeHTML(asset.title || i18n.t('Selected image asset'))}">`
        : i18n.markup('<span>No preview available</span>')}</div>
      <div class="storyboard-shot-info"><strong>Shot ${index + 1}</strong><small>${range(shot.start, shot.end)}</small>
        ${asset ? i18n.html`<p>${escapeHTML(asset.title || asset.assetId || asset.id || i18n.t('Selected asset'))}</p><div class="meta-line">${escapeHTML(label(asset.source))} · ${escapeHTML(label(type))}</div>${asset.license ? i18n.html`<small>License: ${escapeHTML(typeof asset.license === 'string' ? asset.license : asset.license.name || asset.license.type || '—')}</small>` : ''}` : i18n.markup('<p class="storyboard-pending">No asset selected yet</p>')}
        <small>Motion: ${escapeHTML(label(shot.visualMotion?.type || 'none'))} · Transition: ${escapeHTML(label(shot.transition?.type || 'cut'))}</small>
        ${shot.query ? i18n.html`<small>Search: ${escapeHTML(shot.query)}</small>` : ''}
      </div>
    </article>`;
  }

  function render(data) {
    const storyboard = data.storyboard || {};
    const scenes = Array.isArray(storyboard.scenes) ? storyboard.scenes : [];
    if (!scenes.length) return empty(i18n.t('The storyboard has no scenes yet.'));
    const captions = Array.isArray(data.captions) ? data.captions : [];
    const checks = Array.isArray(data.qa?.checks) ? data.qa.checks : [];
    const shots = scenes.flatMap(scene => Array.isArray(scene.shots) ? scene.shots : []);
    const duration = storyboard.duration ?? data.timing?.duration;
    return i18n.html`<div class="storyboard-summary">
      <div><span>Scenes</span><strong>${scenes.length}</strong></div><div><span>Shots</span><strong>${shots.length}</strong></div>
      <div><span>Duration</span><strong>${time(duration)}</strong></div><div><span>Captions</span><strong>${captions.length || scenes.reduce((count, scene) => count + (scene.captions?.length || 0), 0)}</strong></div>
      <div><span>Timing source</span><strong>${escapeHTML(label(data.timing?.source || storyboard.timingSource))}</strong></div>
    </div><div class="meta-line storyboard-meta">${escapeHTML(storyboard.aspectRatio || '')} · ${escapeHTML(storyboard.resolution || '')}${data.updatedAt ? i18n.msg` · Updated ${formatDate(data.updatedAt)}` : ''}</div>
    ${checks.length ? i18n.html`<details class="storyboard-qa"><summary>Production checks ${statusChip(data.qa.passed ? 'passed' : 'failed')}</summary>${checks.map(check => i18n.html`<div>${statusChip(check.status)} <span>${escapeHTML(check.message)}</span></div>`).join('')}</details>` : ''}
    <div class="storyboard-scenes">${scenes.map((scene, index) => {
      const sceneShots = Array.isArray(scene.shots) ? scene.shots : [];
      const sceneCaptions = Array.isArray(scene.captions) && scene.captions.length ? scene.captions
        : captions.filter(caption => Number(caption.start) < Number(scene.audioEnd) && Number(caption.end) > Number(scene.audioStart));
      return i18n.html`<article class="storyboard-scene">
        <header><div><p class="eyebrow">Scene ${index + 1}</p><h3>${escapeHTML(scene.sectionTitle || scene.part || i18n.t('Scene'))}</h3></div><span class="storyboard-time">${range(scene.audioStart, scene.audioEnd)}</span></header>
        <dl class="storyboard-intent"><dt>Visual intent</dt><dd>${escapeHTML(scene.visualIntent || i18n.t('No visual intent recorded.'))}</dd><dt>Narration</dt><dd>${escapeHTML(scene.narration || i18n.t('No narration recorded.'))}</dd></dl>
        <div class="storyboard-shots">${sceneShots.length ? sceneShots.map(renderShot).join('') : empty(i18n.t('No shots planned yet.'))}</div>
        <details class="storyboard-captions" open><summary>Captions (${sceneCaptions.length})</summary>${sceneCaptions.length ? i18n.html`<ol>${sceneCaptions.map(caption => i18n.html`<li><time>${range(caption.start, caption.end)}</time><span>${escapeHTML(Array.isArray(caption.lines) ? caption.lines.join('\n') : caption.text || '')}</span></li>`).join('')}</ol>` : empty(i18n.t('No captions generated for this scene yet.'))}</details>
      </article>`;
    }).join('')}</div>`;
  }

  async function load(productionId) {
    const panel = document.querySelector('#storyboard-panel');
    if (!panel) return;
    const currentRequest = ++requestId;
    activeProductionId = productionId;
    panel.setAttribute('aria-busy', 'true');
    panel.innerHTML = empty(i18n.t('Loading storyboard…'));
    try {
      const response = await api(`/api/content/${encodeURIComponent(productionId)}/storyboard`);
      if (currentRequest !== requestId || panel !== document.querySelector('#storyboard-panel')) return;
      panel.innerHTML = render(response.result || {});
    } catch (error) {
      if (currentRequest !== requestId || panel !== document.querySelector('#storyboard-panel')) return;
      panel.innerHTML = error.status === 404 || error.data?.code === 'STORYBOARD_NOT_FOUND'
        ? empty(i18n.t('This production has no storyboard yet. It will appear after the storyboard production pipeline runs.'))
        : i18n.html`<div class="empty" role="alert"><p>Unable to load the storyboard.</p><p>${escapeHTML(error.message)}</p><button type="button" class="button secondary small" data-storyboard-retry>Try again</button></div>`;
    } finally {
      if (currentRequest === requestId) panel.removeAttribute('aria-busy');
    }
  }

  document.addEventListener('click', event => {
    const tab = event.target.closest('[data-content-tab]');
    if (tab) {
      const showStoryboard = tab.dataset.contentTab === 'storyboard';
      document.querySelectorAll('[data-content-tab]').forEach(button => button.setAttribute('aria-selected', String(button === tab)));
      document.querySelector('#content-review-form')?.classList.toggle('hidden', showStoryboard);
      const panel = document.querySelector('#storyboard-panel');
      panel?.classList.toggle('hidden', !showStoryboard);
      if (showStoryboard && panel && !panel.dataset.loaded) {
        panel.dataset.loaded = 'true';
        load(document.querySelector('#content-review-form').dataset.productionId);
      }
    }
    if (event.target.closest('[data-storyboard-retry]') && activeProductionId) load(activeProductionId);
  });
})();
