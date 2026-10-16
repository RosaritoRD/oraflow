/* global i18n */
/* global ui, api, apiKey, requestApiKey, escapeHTML, empty, showToast */
// Shorts (verses) and Clipping tabs: they talk to /api/shorts/*.
(() => {
  'use strict';

  const $ = selector => document.querySelector(selector);
  const $$ = selector => Array.from(document.querySelectorAll(selector));
  const shorts = ui.shorts = { state: null, loading: false, pollTimer: null, dirty: false, lastJobId: null };
  const media = (area, name, download) =>
    `/api/shorts/media/${area}/${encodeURIComponent(name)}${download ? '?download=1' : ''}`;

  function bytes(n) {
    if (n >= 1024 * 1024 * 1024) return `${(n / 1024 / 1024 / 1024).toFixed(1)} GB`;
    if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
    return `${Math.max(1, Math.round(n / 1024))} KB`;
  }

  function when(iso) {
    try {
      return new Date(iso).toLocaleString(i18n.language === 'es' ? 'es' : 'en', { dateStyle: 'medium', timeStyle: 'short' });
    } catch (_) { return ''; }
  }

  async function load({ quiet = false } = {}) {
    if (shorts.loading) return;
    shorts.loading = true;
    try {
      shorts.state = (await api('/api/shorts')).result;
      render();
    } catch (error) {
      if (!quiet) showToast(error.message, 'error');
    } finally {
      shorts.loading = false;
    }
  }

  /* ---------- Render ---------- */

  function render() {
    const st = shorts.state;
    if (!st) return;
    const ok = st.available;
    $('#shorts-unavailable').classList.toggle('hidden', ok);
    for (const id of ['#shorts-status', '#clipping-status']) {
      const el = $(id);
      const running = st.job?.status === 'running';
      el.textContent = !ok ? i18n.t('Not available') : running ? i18n.t('Working') : i18n.t('Ready');
      el.className = `status ${!ok ? 'failed' : running ? 'running' : 'ready'}`;
    }
    if (!ok) return;

    const lote = $('#shorts-lote');
    if (!shorts.dirty && document.activeElement !== lote) lote.value = st.lote;
    $('#shorts-lote-state').textContent = shorts.dirty ? i18n.t('Unsaved changes') : '';

    renderFiles('#shorts-fondos', 'fondos', st.files.fondos, i18n.t('No backgrounds yet. Without one, shorts use a plain dark background.'));
    renderMusic(st.files.musica);
    renderClipVideos(st.files.clipping);
    renderShorts(st.outputs.shorts);
    renderClips(st.outputs.clips);
    renderJob(st.job);
  }

  function renderFiles(selector, area, files, emptyText) {
    $(selector).innerHTML = files.length ? files.map(f => i18n.html`
      <div class="file-row">
        <span class="file-name" title="${escapeHTML(f.name)}">${escapeHTML(f.name)}</span>
        <span class="file-meta">${escapeHTML(bytes(f.size))}</span>
        <button type="button" class="text-button danger-text" data-shorts-delete="${area}" data-name="${escapeHTML(f.name)}">Delete</button>
      </div>`).join('') : empty(emptyText);
  }

  function renderMusic(files) {
    $('#shorts-musica').innerHTML = files.length ? files.map(f => i18n.html`
      <div class="file-row music-row">
        <span class="file-name" title="${escapeHTML(f.name)}">${escapeHTML(f.name)}</span>
        <span class="file-meta">${escapeHTML(bytes(f.size))}</span>
        <button type="button" class="text-button danger-text" data-shorts-delete="musica" data-name="${escapeHTML(f.name)}">Delete</button>
        <input class="attribution-input" data-attribution="${escapeHTML(f.name)}" value="${escapeHTML(f.attribution)}" maxlength="2000"
          placeholder="Attribution, if the track requires it" aria-label="Attribution for ${escapeHTML(f.name)}">
      </div>`).join('') : empty(i18n.t('No music yet. Without music, shorts are silent.'));
  }

  function renderClipVideos(files) {
    $('#clipping-videos').innerHTML = files.length ? files.map(f => i18n.html`
      <div class="file-row clip-row" data-clip="${escapeHTML(f.name)}">
        <span class="file-name" title="${escapeHTML(f.name)}">${escapeHTML(f.name)}</span>
        <span class="file-meta">${escapeHTML(bytes(f.size))}</span>
        <label class="clip-time"><span>From</span><input data-field="desde" placeholder="0:00" inputmode="numeric" pattern="[0-9:.]*" maxlength="12"></label>
        <label class="clip-time"><span>To</span><input data-field="hasta" placeholder="end" inputmode="numeric" pattern="[0-9:.]*" maxlength="12"></label>
        <button type="button" class="button primary small" data-clip-run="${escapeHTML(f.name)}">Make clip</button>
        <button type="button" class="text-button danger-text" data-shorts-delete="clipping" data-name="${escapeHTML(f.name)}">Delete</button>
      </div>`).join('') : empty(i18n.t('Upload a campaign video to start.'));
  }

  function renderShorts(items) {
    $('#shorts-count').textContent = items.length ? i18n.msg`${items.length} shorts` : '';
    $('#shorts-results').innerHTML = items.length ? items.map(s => {
      const title = s.ficha?.title || s.name.replace(/\.mp4$/, '');
      return i18n.html`
      <figure class="vshort-card">
        <video src="${escapeHTML(media('shorts', s.name))}#t=1" controls preload="metadata" playsinline></video>
        <figcaption>
          <strong title="${escapeHTML(title)}">${escapeHTML(title)}</strong>
          <small>${escapeHTML(when(s.mtime))} · ${escapeHTML(bytes(s.size))}</small>
          <div class="vshort-actions">
            <a class="button primary small" href="${escapeHTML(media('shorts', s.name, true))}" download>Download</a>
            ${s.ficha ? i18n.html`<button type="button" class="button secondary small" data-copy="title" data-name="${escapeHTML(s.name)}">Copy title</button>
            <button type="button" class="button secondary small" data-copy="description" data-name="${escapeHTML(s.name)}">Copy description</button>` : ''}
            <button type="button" class="text-button danger-text" data-shorts-delete="shorts" data-name="${escapeHTML(s.name)}">Delete</button>
          </div>
        </figcaption>
      </figure>`;
    }).join('') : empty(i18n.t('Your shorts will appear here. Write the verses and press “Make all shorts”.'));
  }

  function renderClips(items) {
    $('#clips-count').textContent = items.length ? i18n.msg`${items.length} clips` : '';
    $('#clipping-results').innerHTML = items.length ? items.map(c => i18n.html`
      <figure class="vshort-card">
        <video src="${escapeHTML(media('clips', c.name))}#t=1" controls preload="metadata" playsinline></video>
        <figcaption>
          <strong title="${escapeHTML(c.name)}">${escapeHTML(c.name)}</strong>
          <small>${escapeHTML(when(c.mtime))} · ${escapeHTML(bytes(c.size))}</small>
          <div class="vshort-actions">
            <a class="button primary small" href="${escapeHTML(media('clips', c.name, true))}" download>Download</a>
            <button type="button" class="text-button danger-text" data-shorts-delete="clips" data-name="${escapeHTML(c.name)}">Delete</button>
          </div>
        </figcaption>
      </figure>`).join('') : empty(i18n.t('Finished clips will appear here.'));
  }

  function renderJob(job) {
    const running = job?.status === 'running';
    $$('#shorts-run, [data-clip-run], #clip-run-all').forEach(b => { b.disabled = running; });
    $$('[data-shorts-job]').forEach(panel => {
      // Each tab shows its own job; the other one only blocks the buttons.
      const mine = job && (panel.closest('#shorts-view') ? job.kind === 'versiculos' : job.kind === 'clipping');
      panel.classList.toggle('hidden', !mine);
      if (!mine) return;
      const titles = {
        running: job.kind === 'clipping' ? i18n.t('Transcribing and cutting…') : i18n.t('Making shorts…'),
        done: i18n.t('Finished'), failed: i18n.t('Finished with errors'), cancelled: i18n.t('Stopped')
      };
      panel.querySelector('[data-job-title]').textContent = titles[job.status] || job.status;
      panel.querySelector('[data-job-cancel]').classList.toggle('hidden', !running);
      panel.classList.toggle('job-failed', job.status === 'failed');
      const log = panel.querySelector('[data-job-log]');
      const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 30;
      log.textContent = job.log.join('\n') || i18n.t('Starting…');
      if (atBottom) log.scrollTop = log.scrollHeight;
    });
  }

  /* ---------- Jobs ---------- */

  function poll() {
    clearTimeout(shorts.pollTimer);
    shorts.pollTimer = setTimeout(async () => {
      try {
        const job = (await api('/api/shorts/job')).result;
        if (shorts.state) shorts.state.job = job;
        renderJob(job);
        if (job?.status === 'running') return poll();
        await load({ quiet: true });
        if (job && job.id !== shorts.lastJobId) {
          shorts.lastJobId = job.id;
          const msg = { done: i18n.t('Done. Your videos are ready below.'), failed: i18n.t('The job finished with errors. Check the progress log.'), cancelled: i18n.t('Job stopped.') }[job.status];
          if (msg) showToast(msg, job.status === 'done' ? 'success' : 'error');
        }
      } catch (_) {
        poll();
      }
    }, 2000);
  }

  async function run(kind, options = {}) {
    try {
      if (kind === 'versiculos' && shorts.dirty) await saveLote({ quiet: true });
      const job = (await api('/api/shorts/run', { method: 'POST', body: JSON.stringify({ kind, ...options }) })).result;
      shorts.state.job = job;
      renderJob(job);
      showToast(i18n.t('Started. You can keep using the dashboard.'));
      poll();
    } catch (error) {
      showToast(error.message, 'error');
    }
  }

  async function saveLote({ quiet = false } = {}) {
    await api('/api/shorts/lote', { method: 'PUT', body: JSON.stringify({ lote: $('#shorts-lote').value }) });
    shorts.dirty = false;
    $('#shorts-lote-state').textContent = i18n.t('Saved');
    if (!quiet) showToast(i18n.t('Batch saved.'));
  }

  /* ---------- Uploads (XHR to see the progress of large files) ---------- */

  function uploadOne(area, file, retry = true) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', `/api/shorts/files/${area}`);
      xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
      xhr.setRequestHeader('x-file-name', encodeURIComponent(file.name));
      xhr.setRequestHeader('x-rights-confirmed', 'true');
      const key = apiKey();
      if (key) xhr.setRequestHeader('x-api-key', key);
      xhr.upload.onprogress = e => {
        if (e.lengthComputable) setProgress(`${file.name} · ${Math.round(e.loaded / e.total * 100)}%`);
      };
      xhr.onload = () => {
        if (xhr.status === 401 && retry && requestApiKey() !== null) {
          return uploadOne(area, file, false).then(resolve, reject);
        }
        let data = {};
        try { data = JSON.parse(xhr.responseText); } catch (_) { /* empty response */ }
        if (xhr.status >= 200 && xhr.status < 300) resolve(data.result);
        else reject(new Error(data.error || (xhr.status === 413 ? i18n.t('The file is too large.') : i18n.t('Upload failed'))));
      };
      xhr.onerror = () => reject(new Error(i18n.t('Upload failed. Check your connection.')));
      xhr.send(file);
    });
  }

  function setProgress(text) {
    const bar = $('#loading');
    bar?.classList.toggle('active', Boolean(text));
    if (text) bar?.setAttribute('aria-label', text);
    if (text) showToast(text);
  }

  async function upload(area, files) {
    if (!files.length) return;
    const question = area === 'clipping'
      ? i18n.t('Confirm you have permission to clip these videos (campaign material or your own).')
      : i18n.t('Confirm these files are free to use (Pexels, Pixabay, YouTube Audio Library or your own).');
    if (!confirm(question)) return;
    let ok = 0;
    for (const file of files) {
      try { await uploadOne(area, file); ok += 1; } catch (error) { showToast(`${file.name}: ${error.message}`, 'error'); }
    }
    setProgress('');
    if (ok) showToast(i18n.msg`${ok} files uploaded.`);
    await load({ quiet: true });
  }

  /* ---------- Eventos ---------- */

  document.addEventListener('change', event => {
    const input = event.target.closest('[data-shorts-upload]');
    if (input) {
      upload(input.dataset.shortsUpload, Array.from(input.files || []));
      input.value = '';
      return;
    }
    const attribution = event.target.closest('[data-attribution]');
    if (attribution) {
      api('/api/shorts/attribution', { method: 'PUT', body: JSON.stringify({ name: attribution.dataset.attribution, text: attribution.value }) })
        .then(() => showToast(i18n.t('Attribution saved.')), error => showToast(error.message, 'error'));
    }
  });

  document.addEventListener('input', event => {
    if (event.target.id === 'shorts-lote') {
      shorts.dirty = true;
      $('#shorts-lote-state').textContent = i18n.t('Unsaved changes');
    }
  });

  document.addEventListener('click', async event => {
    const del = event.target.closest('[data-shorts-delete]');
    if (del) {
      if (!confirm(i18n.msg`Delete ${del.dataset.name}?`)) return;
      try {
        await api(`/api/shorts/files/${del.dataset.shortsDelete}/${encodeURIComponent(del.dataset.name)}`, { method: 'DELETE' });
        await load({ quiet: true });
      } catch (error) { showToast(error.message, 'error'); }
      return;
    }
    const copy = event.target.closest('[data-copy]');
    if (copy) {
      const item = shorts.state?.outputs.shorts.find(s => s.name === copy.dataset.name);
      const text = item?.ficha?.[copy.dataset.copy] || '';
      try { await navigator.clipboard.writeText(text); showToast(i18n.t('Copied.')); } catch (_) { prompt(i18n.t('Copy this text:'), text); }
      return;
    }
    const example = event.target.closest('[data-shorts-example]');
    if (example) {
      const box = $('#shorts-lote');
      const base = box.value.replace(/\s+$/, '');
      box.value = `${base}${base ? '\n---\n' : ''}${example.dataset.shortsExample}\n`;
      shorts.dirty = true;
      box.focus();
      $('#shorts-lote-state').textContent = i18n.t('Unsaved changes');
      return;
    }
    const clip = event.target.closest('[data-clip-run]');
    if (clip) {
      const row = clip.closest('[data-clip]');
      run('clipping', {
        video: clip.dataset.clipRun,
        desde: row.querySelector('[data-field="desde"]').value.trim() || undefined,
        hasta: row.querySelector('[data-field="hasta"]').value.trim() || undefined,
        ajuste: $('#clip-ajuste').value,
        modelo: $('#clip-modelo').value
      });
      return;
    }
    const cancel = event.target.closest('[data-job-cancel]');
    if (cancel) {
      try { await api('/api/shorts/cancel', { method: 'POST' }); poll(); } catch (error) { showToast(error.message, 'error'); }
    }
  });

  $('#shorts-save').addEventListener('click', () => saveLote().catch(error => showToast(error.message, 'error')));
  $('#shorts-run').addEventListener('click', () => run('versiculos'));

  // Ctrl/Cmd+S saves the batch while typing.
  $('#shorts-lote').addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      saveLote().catch(error => showToast(error.message, 'error'));
    }
  });

  window.renderShorts = () => {
    if (!shorts.state) load();
    else { render(); load({ quiet: true }); }
    if (shorts.state?.job?.status === 'running') poll();
  };
  window.addEventListener('beforeunload', event => {
    if (shorts.dirty) { event.preventDefault(); event.returnValue = ''; }
  });
  if (['shorts', 'clipping'].includes(location.hash.slice(1))) window.renderShorts();
})();
