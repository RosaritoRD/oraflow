/* global i18n */
/* global ui, api, escapeHTML, empty, showToast, refreshDashboard, switchView */
(() => {
  'use strict';

  const $ = selector => document.querySelector(selector);
  const $$ = selector => Array.from(document.querySelectorAll(selector));
  const research = ui.research = {
    tab: 'radar',
    loaded: false,
    loading: false,
    error: null,
    state: { nichos: [], notas: [] },
    ideas: { temas: [], nichos: [], titulos: [] },
    templates: { plantillas: [], nichos: [] },
    lastVerdict: null,
    templateReady: false,
    opportunities: {
      status: null,
      runs: [],
      selectedRun: null,
      loading: false,
      error: null,
      pollTimer: null
    }
  };

  const unwrap = response => response?.result ?? response;

  function setResearchTab(tab) {
    research.tab = tab;
    $$('[data-research-tab]').forEach(button => {
      button.setAttribute('aria-selected', String(button.dataset.researchTab === tab));
    });
    $$('[data-research-pane]').forEach(pane => {
      pane.classList.toggle('hidden', pane.dataset.researchPane !== tab);
    });
    if (tab === 'prompts') renderTemplateBuilder();
    if (tab === 'radar') renderOpportunityRadar();
  }

  function renderConnection() {
    const connection = $('#research-connection');
    if (!connection) return;
    const status = research.loading ? 'connecting' : research.error ? 'offline' : research.loaded ? 'connected' : 'waiting';
    connection.className = `status research-${status}`;
    connection.textContent = i18n.t(status);
    $('#research-refresh-button').disabled = research.loading;
    const error = $('#research-error');
    error.classList.toggle('hidden', !research.error);
    error.textContent = research.error || '';
  }

  function opportunityRun() {
    const opportunities = research.opportunities;
    if (opportunities.selectedRun) return opportunities.selectedRun;
    return opportunities.runs.find(run => ['queued', 'running'].includes(run.status)) || opportunities.runs[0] || null;
  }

  function opportunityStatusTone(status = '') {
    if (status === 'complete') return 'pass';
    if (status === 'failed') return 'fail';
    if (['queued', 'running'].includes(status)) return 'warn';
    return '';
  }

  function scoreValue(value) {
    return Number.isFinite(Number(value)) ? `${Math.round(Number(value))}%` : '—';
  }

  function renderOpportunityResults(run) {
    const container = $('#opportunity-results');
    if (!container) return;
    if (!run) {
      container.innerHTML = i18n.html`<div class="opportunity-empty"><span aria-hidden="true">⌁</span><strong>The radar is ready for a market.</strong><p>Try “prayer and spiritual wellness”, “retirement health”, or another broad direction.</p></div>`;
      return;
    }
    if (run.status === 'failed') {
      container.innerHTML = i18n.html`<div class="opportunity-empty opportunity-failed"><span aria-hidden="true">×</span><strong>Scan could not finish.</strong><p>${escapeHTML(run.error || i18n.t('The research provider returned an error.'))}</p></div>`;
      return;
    }
    if (['queued', 'running'].includes(run.status)) {
      container.innerHTML = i18n.html`<div class="opportunity-scan-skeleton">${Array.from({ length: Math.min(Number(run.maxCandidates) || 3, 5) }, (_, index) => i18n.html`<div style="--fade:${(0.85 - index * 0.07).toFixed(2)}"><i></i><span></span><small></small></div>`).join('')}</div>`;
      return;
    }
    const results = run.results || [];
    container.innerHTML = results.length ? results.map((item, index) => {
      const direction = item.nextMonth?.direction || 'steady';
      const rising = (item.risingSearches || []).map(term => i18n.html`<span>${escapeHTML(term)}</span>`).join('');
      return i18n.html`<article class="opportunity-card" data-opportunity-rank="${escapeHTML(item.rank || index + 1)}">
        <div class="opportunity-card-rank"><span>${String(item.rank || index + 1).padStart(2, '0')}</span><i class="signal-arrow ${direction}" aria-hidden="true">${direction === 'up' ? '↗' : direction === 'down' ? '↘' : '→'}</i></div>
        <div class="opportunity-card-main">
          <div class="opportunity-card-title"><div><p>${escapeHTML(item.candidateSource || i18n.t('engine discovery'))}</p><h3>${escapeHTML(item.topic)}</h3></div><span class="opportunity-outlook ${direction}">${escapeHTML(item.nextMonth?.label || i18n.t('Signal unavailable'))}</span></div>
          <div class="signal-runway" aria-label="Opportunity score ${scoreValue(item.opportunity)} and next month signal ${scoreValue(item.nextMonth?.score)}">
            <div><span>Now</span><i><b style="width:${Math.max(0, Math.min(100, Number(item.opportunity) || 0))}%"></b></i><strong>${scoreValue(item.opportunity)}</strong></div>
            <div><span>30 days</span><i><b class="future" style="width:${Math.max(0, Math.min(100, Number(item.nextMonth?.score) || 0))}%"></b></i><strong>${scoreValue(item.nextMonth?.score)}</strong></div>
          </div>
          <div class="opportunity-metrics">
            <div><span>Demand</span><strong>${scoreValue(item.demand)}</strong></div>
            <div><span>Low supply</span><strong>${scoreValue(item.lowSupply)}</strong></div>
            <div><span>Monetization</span><strong>${scoreValue(item.monetization)}</strong></div>
            <div><span>Confidence</span><strong>${scoreValue(item.confidence)}</strong></div>
          </div>
          ${rising ? i18n.html`<div class="opportunity-rising"><small>Rising searches</small>${rising}</div>` : i18n.html`<div class="opportunity-evidence"><span>${Number(item.medianViewsPerDay || 0).toLocaleString(i18n.locale)} median views/day</span><span>${escapeHTML(item.recentHits || 0)} recent hits</span><span>${escapeHTML(item.credibleCompetitors || 0)} credible competitors</span></div>`}
          <div class="research-card-actions">
            <button class="text-button" type="button" data-opportunity-validate="${index}">Validate evidence</button>
            <button class="button secondary small" type="button" data-opportunity-queue="${index}">Add to backlog</button>
            <button class="button primary small" type="button" data-opportunity-produce="${index}">Produce now</button>
          </div>
        </div>
      </article>`;
    }).join('') : empty(i18n.t('This scan has no ranked opportunities.'));
  }

  function renderOpportunityRadar() {
    const opportunities = research.opportunities;
    const status = opportunities.status;
    const run = opportunityRun();
    const engineStatus = $('#opportunity-engine-status');
    if (!engineStatus) return;
    const authReady = Boolean(status?.auth?.configured);
    const authVerified = Boolean(status?.auth?.verified);
    engineStatus.className = `status research-verdict-chip ${authVerified ? 'pass' : authReady ? 'warn' : 'fail'}`;
    engineStatus.textContent = opportunities.loading ? i18n.t('Checking') : authVerified ? i18n.t('Ready') : authReady ? i18n.t('Configured') : i18n.t('Setup needed');
    $('#opportunity-engine-detail').innerHTML = opportunities.error
      ? i18n.html`<p class="opportunity-engine-error">${escapeHTML(opportunities.error)}</p>`
      : status
        ? i18n.html`<div><span>Source</span><strong>sentien-labs/youtube-niche</strong></div><div><span>YouTube access</span><strong>${escapeHTML(status.auth?.message || i18n.t('Not configured'))}</strong></div><div><span>Forecast</span><strong>Directional · 30 days</strong></div>`
        : i18n.markup('<p>Connecting to the private research engine…</p>');

    const active = run && ['queued', 'running'].includes(run.status);
    const scanButton = $('#opportunity-scan-button');
    scanButton.disabled = opportunities.loading || active || !authReady;
    scanButton.textContent = active ? i18n.t('Scan in progress…') : i18n.t('Scan niche opportunities');

    const history = opportunities.runs || [];
    $('#opportunity-run-history').innerHTML = history.length ? i18n.html`<small>Recent scans</small>${history.slice(0, 5).map(item => i18n.html`<button type="button" data-opportunity-run="${escapeHTML(item.id)}" class="${run?.id === item.id ? 'active' : ''}"><span>${escapeHTML(item.seed)}</span><i class="${opportunityStatusTone(item.status)}">${escapeHTML(item.status)}</i></button>`).join('')}` : i18n.markup('<p>No scans saved yet.</p>');

    $('#opportunity-results-title').textContent = run ? run.seed : i18n.t('No scan selected');
    $('#opportunity-results-summary').textContent = run?.status === 'complete'
      ? i18n.msg`${run.resultCount || run.results?.length || 0} opportunities ranked from live demand and supply evidence.`
      : run?.status === 'failed'
        ? i18n.t('The previous scan stopped before a reliable ranking was produced.')
        : run
          ? i18n.t('The engine is expanding candidates and collecting comparable evidence.')
          : i18n.t('Start with a broad market. The engine will expand and rank specific niches.');
    const runStatus = $('#opportunity-run-status');
    runStatus.className = `status research-verdict-chip ${opportunityStatusTone(run?.status)}`;
    runStatus.textContent = run?.status || i18n.t('Idle');
    const progress = $('#opportunity-progress');
    progress.classList.toggle('hidden', !active);
    progress.querySelector('span').textContent = `${Math.round(Number(run?.progress) || 0)}%`;
    progress.querySelector('i').style.width = `${Math.max(0, Math.min(100, Number(run?.progress) || 0))}%`;
    renderOpportunityResults(run);
  }

  function stopOpportunityPolling() {
    if (research.opportunities.pollTimer) window.clearTimeout(research.opportunities.pollTimer);
    research.opportunities.pollTimer = null;
  }

  function scheduleOpportunityPoll() {
    stopOpportunityPolling();
    const run = opportunityRun();
    if (!run || !['queued', 'running'].includes(run.status)) return;
    research.opportunities.pollTimer = window.setTimeout(async () => {
      if (document.hidden || ui.currentView !== 'research') return scheduleOpportunityPoll();
      try {
        const response = await api(`/api/research/opportunities/runs/${encodeURIComponent(run.id)}`);
        const updated = unwrap(response);
        research.opportunities.runs = research.opportunities.runs.map(item => item.id === updated.id ? updated : item);
        research.opportunities.selectedRun = updated;
        renderOpportunityRadar();
        if (['queued', 'running'].includes(updated.status)) scheduleOpportunityPoll();
        else await loadOpportunityRadar();
      } catch (error) {
        research.opportunities.error = error.message;
        renderOpportunityRadar();
      }
    }, 5000);
  }

  async function loadOpportunityRadar() {
    const opportunities = research.opportunities;
    opportunities.loading = true;
    opportunities.error = null;
    renderOpportunityRadar();
    try {
      const [statusResponse, runsResponse] = await Promise.all([
        api('/api/research/opportunities/status'),
        api('/api/research/opportunities/runs')
      ]);
      opportunities.status = unwrap(statusResponse);
      opportunities.runs = unwrap(runsResponse)?.runs || [];
      const current = opportunityRun();
      opportunities.selectedRun = current;
    } catch (error) {
      opportunities.error = error.message;
    } finally {
      opportunities.loading = false;
      renderOpportunityRadar();
      scheduleOpportunityPoll();
    }
  }

  function verdictTone(verdict = '') {
    if (verdict.startsWith('ADELANTE')) return 'pass';
    if (verdict.startsWith('ACEPTABLE')) return 'warn';
    return 'fail';
  }

  function renderVerdict(result = research.lastVerdict) {
    const container = $('#research-niche-result');
    if (!container) return;
    if (!result) {
      container.innerHTML = empty(i18n.t('Add the first comparable channel to calculate a niche verdict.'));
      return;
    }
    const filters = result.filtros || {};
    const filterRows = [
      [i18n.t('Winning channels'), filters.ganadores],
      [i18n.t('Under 12 months'), filters.antiguedad],
      [i18n.t('English winners'), filters.ingles],
      [i18n.t('Spanish demand'), filters.demanda]
    ];
    const channels = [...(result.refs || []), ...(result.comps || [])];
    container.innerHTML = i18n.html`
      <div class="research-verdict ${verdictTone(result.veredicto)}">
        <span>Current verdict</span><strong>${escapeHTML(result.veredicto || i18n.t('Unverified'))}</strong>
        <p>${escapeHTML(result.mensaje || '')}</p>
      </div>
      <div class="research-filter-list">${filterRows.map(([name, filter = {}]) => i18n.html`
        <div><i class="${filter.ok ? 'ok' : ''}">${filter.ok ? '✓' : '×'}</i><span>${escapeHTML(name)}</span><strong>${escapeHTML(filter.valor ?? 0)}${filter.pide ? ` / ${escapeHTML(filter.pide)}` : ''}</strong></div>`).join('')}</div>
      <div class="research-channel-list">${channels.length ? channels.map(channel => i18n.html`
        <div><strong>${escapeHTML(channel.nombre)}</strong><span>${escapeHTML(channel.idioma)} · ${Number(channel.vistasMes || 0).toLocaleString(i18n.locale)} views/month · ${escapeHTML(channel.duracionMin || 0)} min</span></div>`).join('') : i18n.markup('<small>No channels saved yet.</small>')}</div>`;
  }

  function renderCandidates() {
    const themes = $('#research-theme-filter');
    const currentTheme = themes.value;
    themes.innerHTML = i18n.html`<option value="">All themes</option>${(research.ideas.temas || []).map(theme => i18n.html`<option value="${escapeHTML(theme)}">${escapeHTML(theme)}</option>`).join('')}`;
    themes.value = currentTheme;

    const container = $('#research-candidates');
    const candidates = research.ideas.nichos || [];
    container.innerHTML = candidates.length ? candidates.map((candidate, index) => i18n.html`
      <article class="research-candidate">
        <div class="research-candidate-path">${escapeHTML(candidate.tema)} <span>→</span> ${escapeHTML(candidate.clic1)}</div>
        <h3>${escapeHTML(candidate.clic2)}</h3>
        <p>${escapeHTML(candidate.porque)}</p>
        <div class="research-candidate-meta"><span>Emotion</span><strong>${escapeHTML(candidate.emocion)}</strong></div>
        <div class="research-card-actions">
          <button class="text-button" type="button" data-research-use-candidate="${index}">Validate niche</button>
          <button class="button secondary small" type="button" data-research-queue-candidate="${index}">Add to backlog</button>
          <button class="button primary small" type="button" data-research-produce-candidate="${index}">Produce now</button>
        </div>
      </article>`).join('') : empty(i18n.t('No candidates match this theme.'));
  }

  function renderTitleHooks() {
    const container = $('#research-title-hooks');
    const titles = research.ideas.titulos || [];
    container.innerHTML = titles.length ? titles.map((title, index) => i18n.html`
      <article class="research-title-hook">
        <strong>${escapeHTML(title)}</strong>
        <div class="research-card-actions">
          <button class="button secondary small" type="button" data-research-queue-title="${index}">Add to backlog</button>
          <button class="button primary small" type="button" data-research-produce-title="${index}">Produce now</button>
        </div>
      </article>`).join('') : empty(i18n.t('Enter a subject to generate six title directions.'));
  }

  function renderSaved() {
    const niches = research.state.nichos || [];
    $('#research-saved-niches').innerHTML = niches.length ? niches.map(item => i18n.html`
      <article class="research-saved-item">
        <div><span class="status research-verdict-chip ${verdictTone(item.veredicto)}">${escapeHTML(item.veredicto)}</span><strong>${escapeHTML(item.nicho)}</strong><small>${escapeHTML(item.ganadores)} winners from ${escapeHTML(item.canales)} channels</small></div>
        <button class="text-button" type="button" data-research-open-niche="${escapeHTML(item.slug)}">Open evidence</button>
      </article>`).join('') : empty(i18n.t('No niche evidence has been saved yet.'));
    const notes = research.state.notas || [];
    $('#research-saved-notes').innerHTML = notes.length ? notes.map(note => i18n.html`
      <article class="research-note-item"><span aria-hidden="true">↳</span><strong>${escapeHTML(note)}</strong></article>`).join('') : empty(i18n.t('No research notes have been saved yet.'));
  }

  function assemblePrompt() {
    const templates = research.templates.plantillas || [];
    const selected = templates[Number($('#research-template-select').value) || 0];
    if (!selected) {
      $('#research-prompt-text').value = '';
      return;
    }
    let text = selected.cuerpo;
    $$('#research-template-variables [data-research-variable]').forEach(input => {
      if (input.value.trim()) text = text.split(`{{${input.dataset.researchVariable}}}`).join(input.value.trim());
    });
    $('#research-prompt-text').value = text;
  }

  function renderTemplateVariables() {
    const templates = research.templates.plantillas || [];
    const selected = templates[Number($('#research-template-select').value) || 0];
    const container = $('#research-template-variables');
    if (!selected) {
      container.innerHTML = empty(i18n.t('No prompt templates are available.'));
      assemblePrompt();
      return;
    }
    const nicheOptions = (research.templates.nichos || []).map(niche => i18n.html`<option value="${escapeHTML(niche)}"></option>`).join('');
    container.innerHTML = (selected.variables || []).map(variable => i18n.html`
      <label><span>${escapeHTML(variable)}</span><input data-research-variable="${escapeHTML(variable)}" placeholder="${escapeHTML(variable)}" ${variable === 'NICHO' ? 'list="research-niche-options"' : ''}></label>`).join('') +
      i18n.html`<datalist id="research-niche-options">${nicheOptions}</datalist>`;
    assemblePrompt();
  }

  function renderTemplateBuilder(force = false) {
    if (!research.loaded || (research.templateReady && !force)) return;
    const templates = research.templates.plantillas || [];
    $('#research-template-select').innerHTML = templates.map((template, index) => i18n.html`<option value="${index}">${escapeHTML(template.titulo)}</option>`).join('');
    research.templateReady = true;
    renderTemplateVariables();
  }

  function renderResearch() {
    renderConnection();
    setResearchTab(research.tab);
    renderOpportunityRadar();
    if (!research.loaded) {
      renderVerdict();
      return;
    }
    renderVerdict();
    renderCandidates();
    renderTitleHooks();
    renderSaved();
  }

  async function ensureResearchLoaded(force = false) {
    if (research.loading || (research.loaded && !force)) return;
    research.loading = true;
    research.error = null;
    renderConnection();
    try {
      const [state, ideas, templates] = await Promise.all([
        api('/api/research/state'),
        api('/api/research/ideas'),
        api('/api/research/templates'),
        loadOpportunityRadar()
      ]);
      research.state = unwrap(state) || { nichos: [], notas: [] };
      research.ideas = unwrap(ideas) || { temas: [], nichos: [], titulos: [] };
      research.templates = unwrap(templates) || { plantillas: [], nichos: [] };
      research.loaded = true;
      research.templateReady = false;
    } catch (error) {
      research.error = i18n.msg`${error.message}. Check the private yt-inbox connection.`;
    } finally {
      research.loading = false;
      renderResearch();
    }
  }

  async function refreshResearchState() {
    const state = await api('/api/research/state');
    research.state = unwrap(state) || { nichos: [], notas: [] };
    renderSaved();
  }

  async function handoffIdea(input, produceNow = false) {
    const created = await api('/api/ideas', {
      method: 'POST',
      body: JSON.stringify({
        topic: input.topic,
        angle: input.angle || '',
        rationale: input.rationale || i18n.t('Selected in Research Inbox'),
        style: input.style || 'story'
      })
    });
    const idea = created.result;
    if (produceNow) {
      await api(`/api/ideas/${encodeURIComponent(idea.id)}/generate`, {
        method: 'POST',
        body: JSON.stringify({ length: 'short' })
      });
      showToast(i18n.t('Research idea sent to the production pipeline.'));
      await refreshDashboard(true);
      switchView('pipeline');
      return;
    }
    showToast(i18n.t('Research idea added to the editorial backlog.'));
    await refreshDashboard(true);
  }

  document.addEventListener('click', async event => {
    const tab = event.target.closest('[data-research-tab]');
    if (tab) return setResearchTab(tab.dataset.researchTab);

    const runButton = event.target.closest('[data-opportunity-run]');
    if (runButton) {
      research.opportunities.selectedRun = research.opportunities.runs.find(run => run.id === runButton.dataset.opportunityRun) || null;
      renderOpportunityRadar();
      scheduleOpportunityPoll();
      return;
    }

    const opportunityAction = event.target.closest('[data-opportunity-validate], [data-opportunity-queue], [data-opportunity-produce]');
    if (opportunityAction) {
      const index = Number(opportunityAction.dataset.opportunityValidate ?? opportunityAction.dataset.opportunityQueue ?? opportunityAction.dataset.opportunityProduce);
      const opportunity = opportunityRun()?.results?.[index];
      if (!opportunity) return;
      if (opportunityAction.hasAttribute('data-opportunity-validate')) {
        $('#research-niche-form [name="niche"]').value = opportunity.topic;
        setResearchTab('niche');
        $('#research-niche-form [name="channelName"]').focus();
        return;
      }
      opportunityAction.disabled = true;
      const outlook = opportunity.nextMonth?.label || '30-day signal unavailable';
      await handoffIdea({
        topic: opportunity.topic,
        angle: i18n.msg`${outlook}; demand ${scoreValue(opportunity.demand)}; low supply ${scoreValue(opportunity.lowSupply)}`,
        rationale: i18n.msg`Opportunity radar ${scoreValue(opportunity.opportunity)} · 30-day potential ${scoreValue(opportunity.nextMonth?.score)}`
      }, opportunityAction.hasAttribute('data-opportunity-produce')).catch(error => showToast(error.message, 'error'));
      opportunityAction.disabled = false;
      return;
    }

    const candidateButton = event.target.closest('[data-research-use-candidate]');
    if (candidateButton) {
      const candidate = research.ideas.nichos[Number(candidateButton.dataset.researchUseCandidate)];
      if (!candidate) return;
      $('#research-niche-form [name="niche"]').value = candidate.clic2;
      setResearchTab('niche');
      $('#research-niche-form [name="channelName"]').focus();
      return;
    }

    const openNiche = event.target.closest('[data-research-open-niche]');
    if (openNiche) {
      try {
        const response = await api(`/api/research/niche?slug=${encodeURIComponent(openNiche.dataset.researchOpenNiche)}`);
        research.lastVerdict = unwrap(response);
        $('#research-niche-form [name="niche"]').value = research.lastVerdict.nicho || '';
        setResearchTab('niche');
        renderVerdict();
      } catch (error) {
        showToast(error.message, 'error');
      }
      return;
    }

    const queueCandidate = event.target.closest('[data-research-queue-candidate], [data-research-produce-candidate]');
    if (queueCandidate) {
      const index = Number(queueCandidate.dataset.researchQueueCandidate ?? queueCandidate.dataset.researchProduceCandidate);
      const candidate = research.ideas.nichos[index];
      if (!candidate) return;
      queueCandidate.disabled = true;
      await handoffIdea({
        topic: candidate.clic2,
        angle: candidate.porque,
        rationale: `${candidate.tema} · ${candidate.emocion}`
      }, queueCandidate.hasAttribute('data-research-produce-candidate')).catch(error => showToast(error.message, 'error'));
      queueCandidate.disabled = false;
      return;
    }

    const queueTitle = event.target.closest('[data-research-queue-title], [data-research-produce-title]');
    if (queueTitle) {
      const index = Number(queueTitle.dataset.researchQueueTitle ?? queueTitle.dataset.researchProduceTitle);
      const title = research.ideas.titulos[index];
      if (!title) return;
      queueTitle.disabled = true;
      await handoffIdea({
        topic: title,
        angle: $('#research-title-form [name="titleTopic"]').value,
        rationale: i18n.t('Title hook selected in Research Inbox')
      }, queueTitle.hasAttribute('data-research-produce-title')).catch(error => showToast(error.message, 'error'));
      queueTitle.disabled = false;
    }
  });

  $('#research-refresh-button').addEventListener('click', () => ensureResearchLoaded(true));

  $('#opportunity-scan-form').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    research.opportunities.error = null;
    try {
      const response = await api('/api/research/opportunities/scan', {
        method: 'POST',
        body: JSON.stringify({
          seed: values.seed,
          region: values.region,
          language: values.language,
          maxCandidates: Number(values.maxCandidates)
        })
      });
      const run = unwrap(response);
      research.opportunities.runs = [run, ...research.opportunities.runs.filter(item => item.id !== run.id)];
      research.opportunities.selectedRun = run;
      renderOpportunityRadar();
      scheduleOpportunityPoll();
      showToast(i18n.t('Niche scan started. You can keep using the dashboard while it runs.'));
    } catch (error) {
      research.opportunities.error = error.message;
      renderOpportunityRadar();
      showToast(error.message, 'error');
    } finally {
      button.disabled = false;
    }
  });

  $('#research-theme-filter').addEventListener('change', async event => {
    try {
      const response = await api(`/api/research/ideas?topic=${encodeURIComponent(event.target.value)}`);
      research.ideas = unwrap(response);
      renderCandidates();
    } catch (error) {
      showToast(error.message, 'error');
    }
  });

  $('#research-title-form').addEventListener('submit', async event => {
    event.preventDefault();
    const subject = new FormData(event.currentTarget).get('titleTopic');
    const button = event.currentTarget.querySelector('button');
    button.disabled = true;
    try {
      const response = await api(`/api/research/ideas?title=${encodeURIComponent(subject)}`);
      research.ideas.titulos = unwrap(response).titulos || [];
      renderTitleHooks();
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      button.disabled = false;
    }
  });

  $('#research-niche-form').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      const response = await api('/api/research/niche', {
        method: 'POST',
        body: JSON.stringify({
          nicho: values.niche,
          canal: {
            nombre: values.channelName,
            tipo: values.type === 'competition' ? 'competencia' : 'referencia',
            idioma: values.language,
            vistasMes: Number(values.monthlyViews || 0),
            duracionMin: Number(values.durationMinutes || 0),
            primerVideo: values.firstVideo
          }
        })
      });
      research.lastVerdict = unwrap(response);
      renderVerdict();
      await refreshResearchState();
      form.elements.channelName.value = '';
      form.elements.monthlyViews.value = '';
      form.elements.durationMinutes.value = '';
      showToast(i18n.t('Channel evidence saved and niche verdict updated.'));
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      button.disabled = false;
    }
  });

  $('#research-note-form').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    const button = form.querySelector('button');
    button.disabled = true;
    try {
      await api('/api/research/note', {
        method: 'POST',
        body: JSON.stringify({ titulo: values.title, texto: values.text })
      });
      form.reset();
      await refreshResearchState();
      showToast(i18n.t('Research note saved in the shared archive.'));
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      button.disabled = false;
    }
  });

  $('#research-template-select').addEventListener('change', renderTemplateVariables);
  $('#research-template-variables').addEventListener('input', event => {
    if (event.target.matches('[data-research-variable]')) assemblePrompt();
  });
  $('#research-copy-prompt').addEventListener('click', async () => {
    const textarea = $('#research-prompt-text');
    try {
      await window.navigator.clipboard.writeText(textarea.value);
      showToast(i18n.t('Completed prompt copied.'));
    } catch (_error) {
      textarea.removeAttribute('readonly');
      textarea.select();
      showToast(i18n.t('Prompt selected. Use your browser copy command.'), 'warning');
    }
  });

  window.renderResearch = renderResearch;
  window.ensureResearchLoaded = ensureResearchLoaded;
  window.setResearchTab = setResearchTab;

  if (ui.currentView === 'research') ensureResearchLoaded();
})();
