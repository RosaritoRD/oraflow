/* global i18n */
const ui = {
  state: null,
  currentView: 'overview',
  refreshing: false,
  toastTimer: null,
  retentionSnapshotId: null,
  engagementVideoId: null,
  engagementDetail: null
};

const $ = selector => document.querySelector(selector);
const $$ = selector => Array.from(document.querySelectorAll(selector));

function escapeHTML(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function apiKey() {
  return localStorage.getItem('yaa_api_key') || '';
}

function requestApiKey() {
  const key = prompt(i18n.t('Enter the API_KEY value from your .env. It stays in this browser only.'), apiKey());
  if (key !== null) localStorage.setItem('yaa_api_key', key.trim());
  return key;
}

async function api(url, options = {}, retry = true) {
  const key = apiKey();
  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(key ? { 'x-api-key': key } : {}),
      ...(options.headers || {})
    }
  });
  if (response.status === 401 && retry && requestApiKey() !== null) return api(url, options, false);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || response.statusText || i18n.t('Request failed'));
    error.data = data;
    error.status = response.status;
    throw error;
  }
  return data;
}

function showToast(message, type = 'success') {
  const toast = $('#toast');
  toast.textContent = message;
  toast.className = `toast ${type}`;
  clearTimeout(ui.toastTimer);
  ui.toastTimer = setTimeout(() => toast.classList.add('hidden'), 4200);
}

function empty(message) {
  return i18n.html`<div class="empty">${escapeHTML(message)}</div>`;
}

function formatDate(value, includeTime = true) {
  if (!value) return i18n.t('Not scheduled');
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return i18n.t('Not scheduled');
  return new Intl.DateTimeFormat(i18n.locale, {
    month: 'short', day: 'numeric',
    ...(ui.state?.profile?.timezone ? { timeZone: ui.state.profile.timezone } : {}),
    ...(includeTime ? { hour: 'numeric', minute: '2-digit' } : {})
  }).format(date);
}

function timeAgo(value) {
  if (!value) return '';
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return i18n.t('just now');
  if (seconds < 3600) return i18n.msg`${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return i18n.msg`${Math.floor(seconds / 3600)}h ago`;
  return i18n.msg`${Math.floor(seconds / 86400)}d ago`;
}

function label(value) {
  return i18n.t(String(value || 'unknown').replaceAll('_', ' '));
}

function statusChip(value) {
  const safe = String(value || 'unknown').toLowerCase();
  return i18n.html`<span class="status ${escapeHTML(safe)}">${escapeHTML(label(safe))}</span>`;
}

async function refreshDashboard(silent = false) {
  if (ui.refreshing) return;
  ui.refreshing = true;
  $('#refresh-button').disabled = true;
  if (!silent) $('#loading').classList.add('active');
  try {
    ui.state = await api('/api/dashboard');
    renderDashboard();
    $('#connection-warning').classList.add('hidden');
    $('#sync-label').textContent = i18n.msg`Updated at ${new Date().toLocaleTimeString(i18n.locale, { hour: '2-digit', minute: '2-digit' })}`;
  } catch (error) {
    $('#connection-warning').classList.remove('hidden');
    $('#sync-label').textContent = i18n.t('Connection interrupted');
    $('#system-label').textContent = i18n.t('Dashboard unavailable');
    $('#system-dot').classList.remove('online');
    if (!silent) showToast(error.message, 'error');
  } finally {
    ui.refreshing = false;
    $('#refresh-button').disabled = false;
    $('#loading').classList.remove('active');
  }
}

function renderDashboard() {
  const state = ui.state;
  const reviews = state.pipeline.filter(item => ['needs_review', 'needs_attention'].includes(item.review_status));
  const scheduled = state.schedule.filter(item => item.status === 'scheduled');
  const actionableJobs = state.jobs.filter(job => ['queued', 'running', 'failed', 'interrupted'].includes(job.status));

  $('#brand-name').textContent = state.profile?.channel_name || i18n.t('Automation Studio');
  $('#setup-banner').classList.toggle('hidden', !state.system.setupRequired);
  $('#system-label').textContent = state.system.setupRequired
    ? i18n.t('Setup required')
    : state.system.automationPaused ? i18n.t('Automation paused') : i18n.msg`${state.system.agents.length} agents online`;
  $('#system-dot').classList.toggle('online', state.system.initialized && !state.system.automationPaused && !state.system.setupRequired);
  $('#automation-toggle').textContent = state.system.automationPaused ? i18n.t('Resume automation') : i18n.t('Pause automation');
  $('#automation-toggle').disabled = state.system.setupRequired;
  $('#generate-button').disabled = state.system.setupRequired;
  $('#review-badge').textContent = reviews.length;
  $('#review-badge').classList.toggle('hidden', reviews.length === 0);

  $('#stat-review').textContent = reviews.length;
  $('#stat-scheduled').textContent = scheduled.length;
  $('#stat-published').textContent = state.stats.published || 0;
  $('#stat-score').textContent = state.analytics.averagePerformanceScore ? `${state.analytics.averagePerformanceScore}/100` : '—';

  renderStudioBrief(state, reviews, scheduled);
  renderCurrentView({ reviews, actionableJobs });
}

function renderStudioBrief(state, reviews, scheduled) {
  const setup = state.system.setupRequired;
  const title = setup ? i18n.t('Connect your channel to get started.')
    : reviews.length ? i18n.msg`${reviews.length} videos need your attention.`
      : scheduled.length ? i18n.msg`${scheduled.length} videos are scheduled.`
        : i18n.t('Make room for your next idea.');
  $('#studio-brief-title').textContent = title;
  $('#studio-brief-detail').textContent = setup ? i18n.t('Review your channel settings before creating a video.')
    : reviews.length ? i18n.t('Check the video, script and thumbnail before approving.')
      : scheduled.length ? i18n.t('Open the calendar to review upcoming releases.')
        : i18n.t('Explore your research or turn a saved idea into a video.');
  const action = $('#studio-brief-action');
  action.disabled = false;
  action.textContent = setup ? i18n.t('Channel setup') : reviews.length ? i18n.t('Review content →') : scheduled.length ? i18n.t('Open calendar →') : i18n.t('Explore research →');
  action.onclick = () => {
    if (reviews.length && !setup) {
      $('#pipeline-filter').value = 'review_queue';
      $('#pipeline-search').value = '';
    }
    switchView(setup ? 'settings' : reviews.length ? 'pipeline' : scheduled.length ? 'calendar' : 'research');
  };
}

function renderCurrentView(derived = {}) {
  const state = ui.state;
  if (!state) return;

  switch (ui.currentView) {
    case 'overview': {
      window.renderRedesResumen?.();
      const reviews = derived.reviews || state.pipeline.filter(item => ['needs_review', 'needs_attention'].includes(item.review_status));
      const actionableJobs = derived.actionableJobs || state.jobs.filter(job => ['queued', 'running', 'failed', 'interrupted'].includes(job.status));
      renderReviews(reviews);
      renderJobs(actionableJobs.length ? actionableJobs : state.jobs.slice(0, 5));
      renderSchedule(state.schedule.filter(item => item.status === 'scheduled').sort((a, b) => new Date(a.publish_time) - new Date(b.publish_time)).slice(0, 5), '#next-schedule');
      renderNotifications(state.notifications, state.events);
      break;
    }
    case 'research':
      window.renderResearch?.();
      break;
    case 'shorts':
    case 'clipping':
      window.renderShorts?.();
      break;
    case 'accounts':
      window.renderAccounts?.();
      break;
    case 'redes':
      window.renderRedes?.();
      break;
    case 'docs':
      window.renderDocs?.();
      break;
    case 'operator':
      renderOperator(state.channelStrategy, state.operatorRuns || [], { ...state.system, readiness: state.readiness });
      break;
    case 'pipeline':
      renderPipeline(state.pipeline);
      break;
    case 'calendar':
      renderCalendar(state.schedule);
      renderIdeas(state.ideas);
      break;
    case 'analytics':
      renderAnalytics(state.analytics, state.learning);
      renderGrowthExperiments(state.experiments || {});
      renderActivation(state.activation);
      break;
    case 'engagement':
      renderEngagement(state.engagement || {});
      break;
    case 'readiness':
      renderReadiness(state.readiness);
      break;
    case 'settings':
      populateSettings(state.profile, state.settings, state.system.videoProviders || []);
      break;
  }
}

function renderReadiness(readiness = {}) {
  const status = readiness.status || 'unverified';
  const statusNode = $('#readiness-status');
  statusNode.className = `status ${escapeHTML(status)}`;
  statusNode.textContent = readiness.stale && status !== 'unverified' ? i18n.msg`${label(status)} · stale` : label(status);

  const titles = {
    passed: i18n.t('The production path is verified.'),
    warning: i18n.t('Core checks passed with warnings.'),
    failed: i18n.t('Automation is blocked until this is fixed.'),
    unverified: i18n.t('Prove the pipeline, without uploading.')
  };
  $('#readiness-title').textContent = titles[status] || titles.unverified;
  const counts = readiness.summary || {};
  $('#readiness-summary').textContent = status === 'unverified'
    ? i18n.t('The check makes small live text and narration requests, verifies channel access, builds a local audio/video MP4, and validates queued metadata. It never creates or uploads a YouTube video.')
    : i18n.msg`${counts.passed || 0} passed, ${counts.warnings || 0} warning${counts.warnings === 1 ? '' : 's'}, and ${counts.failed || 0} failed.`;
  $('#readiness-meta').textContent = readiness.completed_at
    ? i18n.msg`Last run ${formatDate(readiness.completed_at)}${readiness.stale ? ' · older than 24 hours' : ''}`
    : i18n.t('No readiness run recorded.');

  const checks = Array.isArray(readiness.checks) ? readiness.checks : [];
  $('#readiness-checks').innerHTML = checks.length ? checks.map(check => i18n.html`
    <article class="readiness-check ${escapeHTML(check.status)}">
      <div class="readiness-check-heading"><span class="readiness-icon" aria-hidden="true">${check.status === 'passed' ? '✓' : check.status === 'failed' ? '×' : '!'}</span><div><strong>${escapeHTML(check.label)}</strong><div class="meta-line">${escapeHTML(label(check.status))}${check.blocking ? ' · blocking' : ' · optional'} · ${(check.durationMs || 0) / 1000}s</div></div></div>
      <p>${escapeHTML(check.message)}</p>
      ${check.remediation ? i18n.html`<small><strong>Next:</strong> ${escapeHTML(check.remediation)}</small>` : ''}
    </article>`).join('') : empty(i18n.t('Run the verified check to inspect every production dependency.'));
}

function renderReviews(reviews) {
  const container = $('#review-list');
  if (!reviews.length) {
    container.innerHTML = empty(i18n.t('Nothing is waiting. New content will appear here after quality review.'));
    return;
  }
  container.innerHTML = reviews.slice(0, 5).map(item => i18n.html`
    <article class="review-card">
      <span class="review-artwork" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="m10 8 6 4-6 4Z"/></svg>${item.hasThumbnail ? i18n.html`<img class="review-thumb" src="/api/content/${encodeURIComponent(item.id)}/asset/thumbnail" alt="" loading="lazy">` : ''}</span>
      <div class="review-meta"><strong>${escapeHTML(item.title)}</strong><div class="meta-line">${statusChip(item.review_status)} · Quality ${qualityScore(item.qualityChecks)}%</div></div>
      <button class="button secondary small" data-open-content="${escapeHTML(item.id)}">Review</button>
    </article>`).join('');
}

function renderJobs(jobs) {
  const container = $('#job-list');
  if (!jobs.length) {
    container.innerHTML = empty(i18n.t('No generation runs yet.'));
    return;
  }
  const stages = ['strategy', 'script', 'thumbnail', 'seo', 'production', 'quality_review'];
  container.innerHTML = jobs.slice(0, 6).map(job => {
    const checkpoints = Array.isArray(job.checkpoints) ? job.checkpoints : [];
    const completed = new Set(checkpoints.filter(item => item.status === 'completed').map(item => item.stage));
    const mediaTasks = Array.isArray(job.mediaTasks) ? job.mediaTasks : [];
    const mediaCompleted = mediaTasks.filter(item => item.status === 'succeeded').length;
    const mediaProviders = [...new Set(mediaTasks.map(item => label(item.provider)))].join(', ');
    const resumeFrom = stages.find(stage => !completed.has(stage)) || 'quality_review';
    const recoverable = ['failed', 'interrupted'].includes(job.status);
    return i18n.html`
    <article class="job-card">
      <div class="job-meta">
        <strong>${escapeHTML(job.title || job.topic || i18n.t('Agent-selected topic'))}</strong>
        <div class="meta-line">${statusChip(job.status)} · ${escapeHTML(label(job.stage))} · ${timeAgo(job.updated_at)}</div>
        ${checkpoints.length ? i18n.html`<div class="checkpoint-line">${completed.size}/${stages.length} stages saved${job.details?.reusedStages?.length ? i18n.msg` · ${job.details.reusedStages.length} reused` : ''}</div>` : ''}
        ${mediaTasks.length ? i18n.html`<div class="checkpoint-line">Video: ${mediaCompleted}/${mediaTasks.length} clips ready · ${escapeHTML(mediaProviders)}</div>` : ''}
        <div class="progress"><i style="width:${Math.max(0, Math.min(100, job.progress || 0))}%"></i></div>
      </div>
      ${['queued', 'running'].includes(job.status) ? i18n.html`<button class="text-button" data-cancel-job="${escapeHTML(job.id)}">Cancel</button>` : ''}
      ${recoverable ? i18n.html`<div class="job-recovery"><select data-resume-stage-for="${escapeHTML(job.id)}" aria-label="Stage to resume from">${stages.map(stage => i18n.html`<option value="${stage}" ${stage === resumeFrom ? 'selected' : ''}>${escapeHTML(label(stage))}</option>`).join('')}</select><button class="button secondary small" data-resume-job="${escapeHTML(job.id)}">Resume</button></div>` : ''}
    </article>`;
  }).join('');
}

function renderSchedule(schedule, selector) {
  const container = $(selector);
  if (!schedule.length) {
    container.innerHTML = empty(i18n.t('No approved videos are scheduled.'));
    return;
  }
  container.innerHTML = schedule.map(item => i18n.html`
    <div class="timeline-item">
      <div class="date-chip"><small>${escapeHTML(new Date(item.publish_time).toLocaleDateString(i18n.locale, { month: 'short' }))}</small><strong>${escapeHTML(new Date(item.publish_time).getDate())}</strong></div>
      <div class="timeline-meta"><strong>${escapeHTML(item.title)}</strong><div class="meta-line">${formatDate(item.publish_time)} · ${statusChip(item.status)}</div></div>
      <button class="text-button" data-open-content="${escapeHTML(item.production_id)}">View</button>
    </div>`).join('');
}

function renderNotifications(notifications, events) {
  const items = notifications.length
    ? notifications
    : events.map(event => ({ level: event.status === 'error' ? 'error' : 'info', title: label(event.event_type), message: event.data?.error || label(event.status), created_at: event.created_at }));
  const container = $('#notification-list');
  if (!items.length) {
    container.innerHTML = empty(i18n.t('No activity has been recorded yet.'));
    return;
  }
  container.innerHTML = items.slice(0, 7).map(item => i18n.html`
    <div class="activity ${escapeHTML(item.level || 'info')}"><i></i><p><strong>${escapeHTML(item.title)}</strong><br><span class="meta-line">${escapeHTML(item.message)}</span></p><small>${timeAgo(item.created_at)}</small></div>`).join('');
}

function currentPipelineFilter() {
  return $('#pipeline-filter').value || 'all';
}

function renderPipeline(items) {
  const filter = currentPipelineFilter();
  const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase(i18n.locale);
  const query = normalize($('#pipeline-search').value.trim());
  const filtered = items.filter(item => {
    const matchesStatus = filter === 'all' || (filter === 'review_queue'
      ? ['needs_review', 'needs_attention'].includes(item.review_status)
      : item.review_status === filter || item.schedule_status === filter || item.status === filter);
    return matchesStatus && (!query || normalize(`${item.title} ${item.topic || ''}`).includes(query));
  });
  const sort = $('#pipeline-sort').value;
  filtered.sort((a, b) => sort === 'title' ? String(a.title || '').localeCompare(String(b.title || ''), i18n.locale)
    : (sort === 'oldest' ? 1 : -1) * ((Date.parse(a.created_at) || 0) - (Date.parse(b.created_at) || 0)));
  $('#pipeline-count').textContent = i18n.msg`${filtered.length} of ${items.length} videos`;
  const container = $('#pipeline-list');
  if (!filtered.length) {
    container.innerHTML = empty(i18n.t('No videos found. Try another search or clear the filters.'));
    return;
  }
  container.innerHTML = filtered.map(item => {
    const state = item.schedule_status || item.review_status || item.status;
    const next = nextAction(item);
    return i18n.html`<article class="pipeline-item" data-open-content="${escapeHTML(item.id)}">
      <div class="pipeline-title"><strong>${escapeHTML(item.title)}</strong><span>${escapeHTML(item.topic || i18n.t('No topic recorded'))} · ${formatDate(item.created_at)}</span></div>
      <div class="pipeline-col"><span>State</span><strong>${statusChip(state)}</strong></div>
      <div class="pipeline-col"><span>Quality</span><strong>${item.qualityChecks?.length ? `${qualityScore(item.qualityChecks)} / 100` : '—'}</strong></div>
      <button class="button secondary small" aria-label="${escapeHTML(next)}: ${escapeHTML(item.title)}">${escapeHTML(next)} →</button>
    </article>`;
  }).join('');
}

function qualityScore(checks) {
  if (!Array.isArray(checks) || !checks.length) return 0;
  return Math.round((checks.filter(check => check.passed).length / checks.length) * 100);
}

function nextAction(item) {
  if (item.schedule_status === 'published') return i18n.t('View');
  if (item.review_status === 'needs_attention') return i18n.t('Fix issues');
  if (item.review_status === 'needs_review') return i18n.t('Review');
  if (item.schedule_status === 'scheduled') return i18n.t('Scheduled');
  return i18n.t('Inspect');
}

function renderCalendar(schedule) {
  renderSchedule(schedule, '#calendar-list');
}

function renderIdeas(ideas) {
  const container = $('#idea-list');
  if (!ideas.length) {
    container.innerHTML = empty(i18n.t('Add promising topics here before spending generation credits.'));
    return;
  }
  container.innerHTML = ideas.map(idea => i18n.html`
    <article class="idea-card">
      <div class="idea-meta"><strong>${escapeHTML(idea.topic)}</strong><div class="meta-line">${escapeHTML(idea.angle || idea.rationale || i18n.t('No angle added'))} · ${statusChip(idea.status)}</div></div>
      ${idea.status === 'backlog' ? i18n.html`<button class="button secondary small" data-generate-idea="${escapeHTML(idea.id)}">Generate</button>` : ''}
    </article>`).join('');
}

function renderAnalytics(analytics, learning = {}) {
  $('#analytics-total').textContent = analytics.totalVideos || 0;
  $('#analytics-score').textContent = analytics.averagePerformanceScore ? `${analytics.averagePerformanceScore}/100` : '—';
  const insights = Array.isArray(analytics.insights) ? analytics.insights : [];
  const approved = (learning.recommendations || []).find(item => item.status === 'approved');
  const pending = (learning.recommendations || []).find(item => item.status === 'pending');
  $('#analytics-action').textContent = approved?.title || pending?.title || insights[0] || (analytics.totalVideos
    ? i18n.t('Keep collecting results; recommendations get stronger with more published videos.')
    : i18n.t('Publish and analyze the first video to unlock performance recommendations.'));
  const performers = Array.isArray(analytics.topPerformers) ? analytics.topPerformers : [];
  $('#top-performers').innerHTML = performers.length ? performers.map(item => i18n.html`
    <article class="performer-card"><strong>${escapeHTML(item.videoDetails?.title || item.title || i18n.t('Untitled video'))}</strong><div class="meta-line">Performance ${escapeHTML(item.performance?.score ?? item.performance_score ?? '—')} / 100</div></article>`).join('') : empty(i18n.t('No analyzed videos yet.'));
  renderOutcome(learning.outcome || {});
  renderSubscriberGrowth(analytics.subscriberGrowth || {});
  renderLearning(learning);
  renderRetention(learning.retention || {});
}

function renderSubscriberGrowth(summary = {}) {
  const groups = summary.groups || [];
  const names = { short: 'Shorts', long_form: 'Long videos', unknown: 'Format unavailable' };
  const value = (number, digits = 0) => Number.isFinite(number)
    ? new Intl.NumberFormat(undefined, { maximumFractionDigits: digits }).format(number) : '—';
  $('#subscriber-growth').innerHTML = groups.length ? groups.map(group => i18n.html`
    <section class="growth-group" data-growth-format="${escapeHTML(group.format)}">
      <div class="panel-heading"><h3>${escapeHTML(i18n.t(names[group.format] || names.unknown))}</h3>
        <span class="meta-line">${escapeHTML(i18n.msg`${group.measuredVideos} measured · ${group.pendingVideos} pending`)}</span></div>
      ${group.videos.length ? i18n.html`<div class="growth-table-wrap" tabindex="0" role="region" aria-label="${escapeHTML(i18n.t(names[group.format] || names.unknown))}">
        <table class="growth-table"><thead><tr><th scope="col">Video / measured period</th><th scope="col">Views</th><th scope="col">Engaged views</th><th scope="col">Subscribers gained</th>
          <th scope="col">${escapeHTML(i18n.t(group.denominator === 'engagedViews' ? 'Per 1,000 engaged views' : 'Per 1,000 views'))}</th></tr></thead>
        <tbody>${group.videos.map(video => i18n.html`<tr>
          <td><a href="https://www.youtube.com/watch?v=${encodeURIComponent(video.videoId || '')}" target="_blank" rel="noopener noreferrer">${escapeHTML(video.title || i18n.t('Untitled video'))}</a>
            <small>${video.period ? escapeHTML(`${video.period.startDate} – ${video.period.endDate}`) : escapeHTML(i18n.t('Awaiting measurement'))}</small></td>
          <td>${value(video.views)}</td><td>${value(video.engagedViews)}</td><td>${value(video.subscribersGained)}</td>
          <td><strong>${value(video.ratePerThousand, 2)}</strong>${video.status !== 'measured' ? i18n.html`<small>Awaiting measurement</small>` : ''}</td>
        </tr>`).join('')}</tbody></table></div>` : empty(i18n.t('No analyzed videos yet.'))}
    </section>`).join('') : empty(i18n.t('No analyzed videos yet.'));
}

function formatOutcomeValue(value, kind = 'number', currency = 'USD') {
  if (value === null || value === undefined) return i18n.t('Unavailable');
  const number = Number(value);
  if (!Number.isFinite(number)) return i18n.t('Unavailable');
  if (kind === 'currency') {
    try {
      return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 2 }).format(number);
    } catch (_error) {
      return `${currency} ${number.toFixed(2)}`;
    }
  }
  if (kind === 'percent') return `${number.toFixed(1)}%`;
  if (kind === 'hours') return `${number.toFixed(1)}h`;
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(number);
}

function renderOutcome(outcome = {}) {
  const status = $('#outcome-status');
  if (!outcome.configured || !outcome.goal) {
    status.textContent = i18n.t('Not configured');
    status.className = 'status';
    $('#outcome-summary').innerHTML = empty(i18n.t('Choose a measurable primary outcome in the Autonomous Operator strategy.'));
    $('#outcome-economics').innerHTML = '';
    $('#outcome-breakdowns').innerHTML = '';
    $('#outcome-policy').textContent = outcome.evidencePolicy || i18n.t('Configure a primary outcome to activate goal-aligned learning.');
    return;
  }
  const { goal, economics = {}, coverage = {}, breakdowns = {} } = outcome;
  status.textContent = outcome.available ? i18n.t('Measuring') : i18n.t('Awaiting evidence');
  status.className = `status ${outcome.available ? 'active' : ''}`;
  const target = goal.targetValue === null
    ? i18n.msg`No numeric target · ${goal.windowDays}-day evidence window`
    : i18n.msg`${formatOutcomeValue(goal.targetValue, goal.unit, goal.currency)} target · ${goal.windowDays} days`;
  const progress = outcome.progressPercent === null ? null : Math.min(100, Number(outcome.progressPercent));
  $('#outcome-summary').innerHTML = i18n.html`
    <div class="outcome-primary">
      <span>${escapeHTML(goal.label)}</span>
      <strong>${escapeHTML(outcome.formattedObserved || i18n.t('Unavailable'))}</strong>
      <small>${escapeHTML(target)} · ${Number(outcome.measuredVideoCount || 0)} measured videos</small>
      ${progress === null ? '' : i18n.html`<div class="outcome-progress" role="progressbar" aria-label="Outcome target progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress}"><span style="width:${progress}%"></span></div><small>${Number(outcome.progressPercent).toFixed(1)}% of target from stored measurement windows</small>`}
    </div>`;
  const economicsRows = [
    [i18n.t('Net subscribers'), economics.netSubscribers, 'number', coverage.subscribers],
    [i18n.t('Watch hours'), economics.watchHours, 'hours', null],
    [i18n.t('Estimated revenue'), economics.estimatedRevenue, 'currency', coverage.revenue],
    [i18n.t('Known production cost'), economics.knownProductionCost, 'currency', coverage.cost],
    [i18n.t('Estimated ROI'), economics.roi, 'percent', null],
    [i18n.t('Budget used'), economics.budgetUsedPercent, 'percent', null]
  ];
  $('#outcome-economics').innerHTML = economicsRows.map(([name, value, kind, metricCoverage]) => i18n.html`
    <div><span>${escapeHTML(name)}</span><strong>${escapeHTML(formatOutcomeValue(value, kind, economics.currency || goal.currency))}</strong>${metricCoverage ? i18n.html`<small>${Number(metricCoverage.measured || 0)}/${Number(metricCoverage.total || 0)} videos measured</small>` : ''}</div>`).join('');
  const dimensions = [
    ['pillar', i18n.t('Content pillars')], ['format', i18n.t('Formats')], ['provider', i18n.t('Production providers')]
  ].filter(([key]) => Array.isArray(breakdowns[key]) && breakdowns[key].length);
  $('#outcome-breakdowns').innerHTML = dimensions.length ? dimensions.map(([key, heading]) => i18n.html`
    <section><h3>${escapeHTML(heading)}</h3>${breakdowns[key].slice(0, 5).map(item => i18n.html`
      <div class="outcome-breakdown-row"><span>${escapeHTML(label(item.name))}<small>${Number(item.count || 0)} video${Number(item.count || 0) === 1 ? '' : 's'}</small></span><strong>${escapeHTML(formatOutcomeValue(item.average, goal.unit, goal.currency))} avg</strong></div>`).join('')}</section>`).join('') : empty(i18n.t('Breakdowns appear once measured videos carry comparable pillar, format, or provider evidence.'));
  $('#outcome-policy').textContent = outcome.evidencePolicy;
}

function renderLearning(learning = {}) {
  const baseline = learning.baseline || {};
  $('#learning-snapshot-count').textContent = i18n.msg`${learning.snapshotCount || 0} snapshots`;
  $('#learning-approved-count').textContent = i18n.msg`${learning.approvedCount || 0} approved`;
  const metrics = [
    ['CTR', baseline.ctr, '%'],
    [i18n.t('Retention'), baseline.retention, '%'],
    [i18n.t('Engagement'), baseline.engagementRate, '%'],
    [i18n.t('Performance'), baseline.performanceScore, '/100']
  ];
  $('#learning-baseline').innerHTML = learning.measuredVideos ? metrics.map(([name, value, suffix]) => i18n.html`
    <div><span>${escapeHTML(name)}</span><strong>${escapeHTML(value === null || value === undefined || !Number.isFinite(Number(value))
      ? i18n.t('Unavailable') : `${Number(value).toFixed(1)}${suffix}`)}</strong></div>`).join('') : empty(i18n.t('Two real measurements unlock evidence-backed recommendations.'));

  const recommendations = Array.isArray(learning.recommendations) ? learning.recommendations : [];
  $('#learning-recommendations').innerHTML = recommendations.length ? recommendations.map(item => i18n.html`
    <article class="learning-card">
      <div class="learning-card-heading"><strong>${escapeHTML(item.title)}</strong>${statusChip(item.status)}</div>
      <p>${escapeHTML(item.rationale)}</p>
      <div class="learning-meta"><span>${escapeHTML(label(item.category))} · ${escapeHTML(label(item.confidence))} confidence</span>
        <span class="learning-actions">
          ${item.status !== 'approved' ? i18n.html`<button class="text-button approve" data-learning-action="approve" data-learning-id="${escapeHTML(item.id)}">Approve</button>` : ''}
          ${item.status !== 'rejected' ? i18n.html`<button class="text-button" data-learning-action="reject" data-learning-id="${escapeHTML(item.id)}">Reject</button>` : ''}
        </span>
      </div>
    </article>`).join('') : empty(i18n.t('No recommendation yet. Oraflow needs at least two real, sufficiently exposed measurements.'));
}

function renderGrowthExperiments(summary = {}) {
  const experiments = Array.isArray(summary.experiments) ? summary.experiments : [];
  const candidates = Array.isArray(summary.candidates) ? summary.candidates : [];
  const candidate = $('#experiment-candidate');
  const create = $('#experiment-create-button');
  candidate.innerHTML = candidates.length
    ? candidates.map(item => i18n.html`<option value="${escapeHTML(item.productionId)}">${escapeHTML(item.title || item.productionId)}</option>`).join('')
    : i18n.markup('<option value="">No eligible published variants</option>');
  candidate.disabled = !candidates.length;
  create.disabled = !candidates.length;
  $('#experiment-status').textContent = i18n.msg`${Number(summary.activeCount || 0)} running · ${Number(summary.awaitingDecisionCount || 0)} decision${Number(summary.awaitingDecisionCount || 0) === 1 ? '' : 's'}`;
  $('#experiment-policy').textContent = summary.evidencePolicy || i18n.t('Only real YouTube evidence advances controlled tests.');

  $('#growth-experiments').innerHTML = experiments.length ? experiments.map(experiment => {
    const winner = experiment.arms?.find(arm => arm.id === experiment.winningArmId);
    const actions = [];
    if (experiment.status === 'draft') actions.push(i18n.html`<button class="text-button approve" data-experiment-action="approve" data-experiment-id="${escapeHTML(experiment.id)}">Approve plan</button>`);
    if (experiment.status === 'approved') actions.push(i18n.html`<button class="button primary small" data-experiment-action="start" data-experiment-id="${escapeHTML(experiment.id)}">Start live test</button>`);
    if (experiment.status === 'running') {
      actions.push(i18n.html`<button class="button secondary small" data-experiment-action="refresh" data-experiment-id="${escapeHTML(experiment.id)}">Refresh evidence</button>`);
      actions.push(i18n.html`<button class="text-button" data-experiment-action="cancel" data-experiment-id="${escapeHTML(experiment.id)}">Cancel &amp; restore control</button>`);
    }
    if (experiment.status === 'action_required') actions.push(i18n.html`<button class="text-button" data-experiment-action="cancel" data-experiment-id="${escapeHTML(experiment.id)}">Retry control restore</button>`);
    if (experiment.status === 'awaiting_winner') actions.push(i18n.html`<button class="button primary small" data-experiment-action="adopt" data-experiment-id="${escapeHTML(experiment.id)}">Adopt ${escapeHTML(winner?.label || 'winner')}</button>`);
    const arms = (experiment.arms || []).map(arm => {
      const result = arm.result || {};
      const active = arm.id === experiment.currentArmId && experiment.status === 'running';
      return i18n.html`<div class="experiment-arm ${active ? 'active' : ''} ${arm.id === experiment.winningArmId ? 'winner' : ''}">
        <div><strong>${escapeHTML(arm.label)}</strong>${arm.isControl ? i18n.markup('<small>Control</small>') : ''}</div>
        <span>${escapeHTML(arm.title)}</span>
        <div class="experiment-arm-metrics"><b>${Number(result.ctr || 0).toFixed(2)}% CTR</b><small>${Number(result.impressions || 0).toLocaleString(i18n.locale)} impressions</small></div>
      </div>`;
    }).join('');
    return i18n.html`<article class="growth-experiment-card">
      <div class="learning-card-heading"><strong>${escapeHTML(experiment.title)}</strong>${statusChip(experiment.status)}</div>
      <p>${escapeHTML(experiment.hypothesis)}</p>
      <div class="experiment-arm-list">${arms}</div>
      ${experiment.result?.reason ? i18n.html`<p class="experiment-result"><strong>Result:</strong> ${escapeHTML(experiment.result.reason)}${experiment.result.liftPercent !== undefined ? i18n.msg` · ${escapeHTML(experiment.result.liftPercent)}% lift` : ''}</p>` : ''}
      <div class="learning-meta"><span>${Number(experiment.armDurationHours || 0)}h per arm · ${Number(experiment.minImpressions || 0).toLocaleString(i18n.locale)} minimum impressions</span><span class="learning-actions">${actions.join('')}</span></div>
    </article>`;
  }).join('') : empty(i18n.t('Publish content with approved-learning title and thumbnail variants to create the first controlled test.'));
}

function renderRetention(retention = {}) {
  const snapshots = Array.isArray(retention.snapshots) ? retention.snapshots : [];
  const select = $('#retention-snapshot-select');
  const refresh = $('#refresh-retention-button');
  if (!snapshots.length) {
    ui.retentionSnapshotId = null;
    select.innerHTML = i18n.markup('<option value="">No measured curves yet</option>');
    select.disabled = true;
    refresh.disabled = true;
    $('#retention-meta').innerHTML = '';
    $('#retention-chart').innerHTML = empty(i18n.t('Retention curves appear after a published video reaches a real analytics measurement window.'));
    $('#retention-scenes').innerHTML = '';
    return;
  }

  if (!snapshots.some(item => item.id === ui.retentionSnapshotId)) ui.retentionSnapshotId = snapshots[0].id;
  select.disabled = false;
  refresh.disabled = false;
  select.innerHTML = snapshots.map(item => i18n.html`<option value="${escapeHTML(item.id)}" ${item.id === ui.retentionSnapshotId ? 'selected' : ''}>${escapeHTML(item.title || item.videoId)} · ${escapeHTML(label(item.surface))} · ${escapeHTML(item.measurementWindow)}</option>`).join('');
  const snapshot = snapshots.find(item => item.id === ui.retentionSnapshotId) || snapshots[0];
  refresh.dataset.videoId = snapshot.videoId;
  refresh.dataset.measurementWindow = snapshot.measurementWindow;

  const summary = snapshot.summary || {};
  $('#retention-meta').innerHTML = [
    i18n.msg`${snapshot.points?.length || 0} real points`,
    i18n.msg`${snapshot.sceneMetrics?.length || 0} scenes`,
    i18n.msg`${summary.dropoffCount || 0} drop-offs`,
    i18n.msg`${summary.rewatchCount || 0} rewatch signals`,
    i18n.msg`${escapeHTML(label(snapshot.confidence))} confidence`,
    i18n.msg`${escapeHTML(snapshot.measurementWindow)} window`
  ].map(item => i18n.html`<span>${item}</span>`).join('');
  $('#retention-chart').innerHTML = retentionChart(snapshot);
  $('#retention-scenes').innerHTML = (snapshot.sceneMetrics || []).map(scene => i18n.html`
    <article class="retention-scene ${escapeHTML(scene.signal)}">
      <div class="retention-scene-heading"><div><span>Scene ${Number(scene.position || 0) + 1}</span><strong>${escapeHTML(scene.label)}</strong></div>${statusChip(scene.signal)}</div>
      <div class="retention-metrics">
        <div><span>Average watching</span><strong>${(Number(scene.averageWatchRatio || 0) * 100).toFixed(1)}%</strong></div>
        <div><span>Scene change</span><strong>${Number(scene.changePoints || 0) > 0 ? '+' : ''}${Number(scene.changePoints || 0).toFixed(1)} pts</strong></div>
        <div><span>Relative retention</span><strong>${(Number(scene.averageRelativeRetention || 0) * 100).toFixed(1)}%</strong></div>
        <div><span>Sharpest drop</span><strong>${Number(scene.largestDropPoints || 0).toFixed(1)} pts</strong></div>
      </div>
    </article>`).join('') || empty(i18n.t('The saved curve could not be mapped to a scene timeline.'));
}

function renderEngagement(engagement = {}) {
  $('#engagement-policy').textContent = engagement.evidencePolicy || '';
  const posting = $('#engagement-posting-status');
  posting.textContent = engagement.postingEnabled ? i18n.t('posting enabled') : i18n.t('posting locked');
  posting.className = `status ${engagement.postingEnabled ? 'success' : 'warning'}`;
  posting.title = engagement.postingEnabled ? '' : i18n.t('Re-authorize YouTube (npm run walkthrough) to grant the comment permission.');
  $('#engagement-drafts-count').textContent = i18n.msg`${engagement.pendingDrafts || 0} drafts`;
  $('#engagement-attention-count').textContent = i18n.msg`${engagement.needsAttentionCount || 0} flagged`;
  $('#engagement-ideas-count').textContent = i18n.msg`${engagement.pendingAudienceIdeas || 0} pending`;

  const insights = Array.isArray(engagement.insights) ? engagement.insights : [];
  const select = $('#engagement-video-select');
  if (!insights.length) {
    ui.engagementVideoId = null;
    ui.engagementDetail = null;
    select.innerHTML = i18n.markup('<option value="">No synced videos yet</option>');
    select.disabled = true;
    $('#engagement-sync-button').disabled = true;
    $('#engagement-draft-button').disabled = true;
    $('#engagement-meta').innerHTML = '';
    $('#engagement-themes').innerHTML = empty(i18n.t('Comments appear after a published video is synced.'));
    $('#engagement-drafts').innerHTML = empty(i18n.t('Draft replies from a synced video to review them here.'));
    $('#engagement-attention').innerHTML = empty(i18n.t('Nothing flagged as spam, scam, or toxic.'));
  } else {
    if (!insights.some(item => item.videoId === ui.engagementVideoId)) ui.engagementVideoId = insights[0].videoId;
    select.disabled = false;
    select.innerHTML = insights.map(item => i18n.html`<option value="${escapeHTML(item.videoId)}" ${item.videoId === ui.engagementVideoId ? 'selected' : ''}>${escapeHTML(item.title || item.videoId)}</option>`).join('');
    $('#engagement-sync-button').disabled = false;
    $('#engagement-sync-button').dataset.videoId = ui.engagementVideoId;
    $('#engagement-draft-button').disabled = false;
    $('#engagement-draft-button').dataset.videoId = ui.engagementVideoId;
    renderEngagementDetail();
  }
  renderAudienceIdeas();
}

function renderEngagementDetail() {
  const detail = ui.engagementDetail;
  if (!detail || detail.insight?.videoId !== ui.engagementVideoId) {
    loadEngagementDetail(ui.engagementVideoId);
    return;
  }
  const insight = detail.insight || {};
  const sentiment = insight.sentiment || {};
  const fallback = insight.analysisMethod === 'fallback';
  $('#engagement-meta').innerHTML = [
    i18n.msg`${insight.commentCount || 0} comments`,
    i18n.msg`${insight.analyzedCount || 0} analyzed`,
    fallback ? i18n.t('AI analysis unavailable — mechanical facts only') : i18n.msg`${sentiment.positive || 0} positive · ${sentiment.neutral || 0} neutral · ${sentiment.negative || 0} negative`,
    insight.lastSyncedAt ? i18n.msg`synced ${new Date(insight.lastSyncedAt).toLocaleString(i18n.locale)}` : i18n.t('never synced')
  ].map(item => i18n.html`<span>${escapeHTML(item)}</span>`).join('');

  const themes = Array.isArray(insight.themes) ? insight.themes : [];
  $('#engagement-themes').innerHTML = themes.length ? themes.map(theme => i18n.html`
    <article class="learning-card">
      <div class="learning-card-heading"><strong>${escapeHTML(theme.title)}</strong>${statusChip(theme.kind)}</div>
      <p>${escapeHTML(theme.summary)}</p>
      <div class="learning-meta"><span>${escapeHTML(String(theme.count || 0))} comments</span></div>
    </article>`).join('') : empty(fallback ? i18n.t('Themes need a working AI text provider.') : i18n.t('No recurring themes yet.'));

  const commentsById = new Map((detail.comments || []).map(comment => [comment.commentId, comment]));
  const postingEnabled = ui.state?.engagement?.postingEnabled === true;
  const drafts = (detail.drafts || []).filter(draft => draft.status !== 'discarded');
  const draftsContainer = $('#engagement-drafts');
  // The 8s poll must not wipe a reply the operator is actively editing.
  const draftsHTML = drafts.length ? drafts.map(draft => {
    const comment = commentsById.get(draft.commentId) || {};
    const locked = draft.status === 'posted';
    return i18n.html`
    <article class="comment-card" data-reply-card="${escapeHTML(draft.id)}">
      <div class="learning-card-heading"><strong>${escapeHTML(comment.authorName || i18n.t('Viewer'))}</strong>${statusChip(draft.status)}</div>
      <p class="comment-original">${escapeHTML(comment.text || '')}</p>
      <label><span>Reply</span><textarea data-reply-text maxlength="1000" ${locked ? 'disabled' : ''}>${escapeHTML(draft.editedText || draft.draftText)}</textarea></label>
      ${draft.failureReason ? i18n.html`<p class="meta-line">Last attempt failed: ${escapeHTML(draft.failureReason)}</p>` : ''}
      <div class="learning-actions">
        ${locked ? '' : i18n.html`<button class="button primary small" data-reply-approve="${escapeHTML(draft.id)}" ${postingEnabled ? '' : 'disabled title="Re-authorize YouTube to enable posting"'}>Approve &amp; post</button>
        <button class="text-button" data-reply-save="${escapeHTML(draft.id)}">Save edit</button>
        <button class="text-button danger-text" data-reply-discard="${escapeHTML(draft.id)}">Discard</button>`}
      </div>
    </article>`;
  }).join('') : empty(i18n.t('No reply drafts for this video yet.'));
  // Guard the focused textarea only: a clicked action button also holds focus, and skipping
  // the rebuild for it would leave the panel showing pre-action state.
  const editingReply = draftsContainer.contains(document.activeElement)
    && document.activeElement.matches('[data-reply-text]');
  if (!editingReply) draftsContainer.innerHTML = draftsHTML;

  const attention = Array.isArray(insight.attentionFlags) ? insight.attentionFlags : [];
  $('#engagement-attention').innerHTML = attention.length ? attention.map(flag => {
    const comment = commentsById.get(flag.commentId) || {};
    return i18n.html`
    <article class="comment-card">
      <div class="learning-card-heading"><strong>${escapeHTML((flag.categories || []).join(', '))}</strong></div>
      <p class="comment-original">${escapeHTML(comment.text || '')}</p>
      <a class="text-button" href="${escapeHTML(flag.permalink || '#')}" target="_blank" rel="noopener noreferrer">Open on YouTube</a>
    </article>`;
  }).join('') : empty(i18n.t('Nothing flagged as spam, scam, or toxic.'));
}

async function loadEngagementDetail(videoId) {
  if (!videoId) return;
  try {
    const data = await api(`/api/engagement/${encodeURIComponent(videoId)}`);
    ui.engagementDetail = data.result;
    renderEngagementDetail();
  } catch (_error) { /* toast already shown by api() */ }
}

function renderAudienceIdeas() {
  const recommendations = (ui.state?.learning?.recommendations || []).filter(item => item.category === 'audience_demand');
  $('#engagement-ideas').innerHTML = recommendations.length ? recommendations.map(item => i18n.html`
    <article class="learning-card">
      <div class="learning-card-heading"><strong>${escapeHTML(item.title)}</strong>${statusChip(item.status)}</div>
      <p>${escapeHTML(item.rationale)}</p>
      <div class="learning-meta"><span>${escapeHTML(label(item.confidence))} confidence</span>
        <span class="learning-actions">
          ${item.status !== 'approved' ? i18n.html`<button class="text-button approve" data-learning-action="approve" data-learning-id="${escapeHTML(item.id)}">Approve</button>` : ''}
          ${item.status !== 'rejected' ? i18n.html`<button class="text-button" data-learning-action="reject" data-learning-id="${escapeHTML(item.id)}">Reject</button>` : ''}
        </span>
      </div>
    </article>`).join('') : empty(i18n.t('Mined audience requests appear here once comment analysis finds repeated asks.'));
}

function retentionChart(snapshot = {}) {
  const points = Array.isArray(snapshot.points) ? snapshot.points : [];
  if (points.length < 2) return empty(i18n.t('This snapshot does not contain enough points for a curve.'));
  const width = 1000;
  const height = 280;
  const left = 46;
  const right = 18;
  const top = 18;
  const bottom = 38;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const maxRatio = Math.max(1, Math.min(1.5, Math.max(...points.map(point => Number(point.audienceWatchRatio || 0))) * 1.05));
  const x = ratio => left + Math.max(0, Math.min(1, Number(ratio || 0))) * plotWidth;
  const y = ratio => top + (1 - Math.max(0, Math.min(maxRatio, Number(ratio || 0))) / maxRatio) * plotHeight;
  const line = points.map(point => `${x(point.elapsedRatio).toFixed(1)},${y(point.audienceWatchRatio).toFixed(1)}`).join(' ');
  const duration = Math.max(1, Number(snapshot.durationSeconds || 1));
  const sceneBands = (snapshot.sceneMetrics || []).map((scene, index) => {
    const start = x(Number(scene.startSeconds || 0) / duration);
    const end = x(Number(scene.endSeconds || 0) / duration);
    return i18n.html`<g><rect x="${start.toFixed(1)}" y="${top}" width="${Math.max(1, end - start).toFixed(1)}" height="${plotHeight}" class="retention-band band-${index % 2}"/><line x1="${start.toFixed(1)}" y1="${top}" x2="${start.toFixed(1)}" y2="${top + plotHeight}" class="scene-boundary"/><title>${escapeHTML(scene.label)}</title></g>`;
  }).join('');
  const grid = [0.25, 0.5, 0.75, 1].map(value => {
    const lineY = y(value);
    return i18n.html`<line x1="${left}" y1="${lineY.toFixed(1)}" x2="${width - right}" y2="${lineY.toFixed(1)}" class="retention-grid-line"/><text x="${left - 8}" y="${(lineY + 4).toFixed(1)}" text-anchor="end">${Math.round(value * 100)}%</text>`;
  }).join('');
  return i18n.html`<svg viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="retention-chart-title retention-chart-desc">
    <title id="retention-chart-title">Audience retention for ${escapeHTML(snapshot.title || snapshot.videoId)}</title>
    <desc id="retention-chart-desc">A ${points.length}-point audience retention curve divided by ${snapshot.sceneMetrics?.length || 0} production scenes.</desc>
    ${sceneBands}${grid}
    <polyline points="${line}" class="retention-line"/>
    <text x="${left}" y="${height - 10}" text-anchor="start">Start</text>
    <text x="${width - right}" y="${height - 10}" text-anchor="end">End</text>
  </svg>`;
}

function renderActivation(activation = {}) {
  const container = $('#activation-list');
  if (!container) return;
  const milestones = activation.milestones || {};
  const rows = [
    [i18n.t('Setup ready'), milestones.setupReady],
    [i18n.t('First real MP4'), milestones.firstRealVideo],
    [i18n.t('First approval'), milestones.firstApproval],
    [i18n.t('First YouTube publish'), milestones.firstPublish],
    [i18n.t('Second real MP4'), milestones.secondRealVideo]
  ];
  container.innerHTML = rows.map(([name, milestone = {}]) => i18n.html`
    <div class="timeline-item">
      <div class="timeline-dot ${milestone.achieved ? 'done' : ''}"></div>
      <div><strong>${escapeHTML(name)}</strong><div class="meta-line">${milestone.achieved ? escapeHTML(formatDate(milestone.at)) : i18n.t('Not reached yet')}</div></div>
    </div>`).join('');
  if (milestones.firstRealVideo?.achieved) {
    container.insertAdjacentHTML('beforeend', i18n.html`
      <div class="activation-share">
        <span>Made something real with Oraflow?</span>
        <a class="button secondary small" href="https://github.com/RosaritoRD/oraflow/discussions/new?category=show-and-tell" target="_blank" rel="noreferrer">Share what you built</a>
      </div>`);
  }
}

function renderOperator(strategy, runs, system) {
  const form = $('#strategy-form');
  const mapping = strategy ? {
    objective: strategy.objective,
    audience: strategy.audience,
    valueProposition: strategy.value_proposition,
    contentPillars: (strategy.contentPillars || []).join(', '),
    cadencePerWeek: strategy.cadence_per_week,
    videosPerRun: strategy.videos_per_run,
    defaultFormat: strategy.default_format,
    defaultLength: strategy.default_length,
    successMetric: strategy.success_metric,
    primaryKpi: strategy.primary_kpi,
    targetValue: strategy.target_value,
    targetWindowDays: strategy.target_window_days,
    monthlyBudget: strategy.monthly_budget,
    outcomeCurrency: strategy.outcome_currency,
    constraints: strategy.constraints
  } : {};
  for (const [name, value] of Object.entries(mapping)) {
    if (form.elements[name] && document.activeElement !== form.elements[name]) form.elements[name].value = value ?? '';
  }

  const strategyStatus = strategy?.status || 'not_configured';
  $('#operator-strategy-status').className = `status ${escapeHTML(strategyStatus)}`;
  $('#operator-strategy-status').textContent = label(strategyStatus);
  const run = runs[0];
  const active = run && ['queued', 'running', 'cancelling'].includes(run.status);
  const recoverable = run && ['failed', 'interrupted', 'completed_with_issues'].includes(run.status);
  $('#activate-operator-button').disabled = Boolean(system.setupRequired || active || system.readiness?.status === 'failed');
  $('#activate-operator-button').title = system.readiness?.status === 'failed' ? i18n.t('Resolve the production readiness failures first') : '';
  $('#activate-operator-button').textContent = strategy?.status === 'active' ? i18n.t('Run strategy now') : i18n.t('Activate & run now');
  $('#pause-operator-button').classList.toggle('hidden', strategy?.status !== 'active');
  $('#cancel-operator-run').classList.toggle('hidden', !active);
  if (active) $('#cancel-operator-run').dataset.runId = run.id;
  $('#resume-operator-run').classList.toggle('hidden', !recoverable);
  $('#resume-operator-run').disabled = Boolean(system.setupRequired || system.readiness?.status === 'failed');
  if (recoverable) $('#resume-operator-run').dataset.runId = run.id;

  if (!run) {
    $('#operator-run-title').textContent = i18n.t('Waiting for a strategy');
    $('#operator-run-summary').innerHTML = empty(i18n.t('Save a channel mandate, then activate it to research and produce the first plan.'));
    $('#operator-plan').innerHTML = empty(i18n.t('No editorial plan yet.'));
    return;
  }

  $('#operator-run-title').textContent = `${label(run.stage)} · ${run.progress || 0}%`;
  const sources = Array.isArray(run.research?.sources) ? run.research.sources.join(', ') : i18n.t('Research pending');
  $('#operator-run-summary').innerHTML = i18n.html`<div class="run-summary">
    <div class="progress"><i style="width:${Math.max(0, Math.min(100, run.progress || 0))}%"></i></div>
    <div class="run-summary-row"><span>Status</span><strong>${statusChip(run.status)}</strong></div>
    <div class="run-summary-row"><span>Research</span><strong>${escapeHTML(sources)}</strong></div>
    <div class="run-summary-row"><span>Produced</span><strong>${escapeHTML(run.summary?.generated || 0)} / ${escapeHTML(run.summary?.planned || run.plan?.length || 0)}</strong></div>
    <div class="run-summary-row"><span>Needs review</span><strong>${escapeHTML(run.summary?.needsReview || 0)}</strong></div>
    ${run.error ? i18n.html`<p class="callout">${escapeHTML(run.error)}</p>` : ''}
  </div>`;
  const plan = Array.isArray(run.plan) ? run.plan : [];
  $('#operator-plan').innerHTML = plan.length ? plan.map((item, index) => {
    const job = (run.generatedJobs || []).find(candidate => candidate.topic === item.topic);
    return i18n.html`<article class="plan-card">
      <div class="meta-line">${index + 1} · ${escapeHTML(item.format)} · ${escapeHTML(item.length)} ${job ? `· ${statusChip(job.reviewStatus || job.status)}` : ''}</div>
      <strong>${escapeHTML(item.topic)}</strong>
      <p>${escapeHTML(item.angle || item.rationale)}</p>
    </article>`;
  }).join('') : empty(i18n.t('Research and planning will appear here when the run begins.'));
}

/* «Elementos del vídeo» (03/10/2026): suscribirse, campana y comentar; cuándo sale cada uno.
   Sin ajuste guardado, los mismos valores por defecto que utils/extras-video.js. */
const EXTRAS_DEFECTO = { suscribir: { activo: true, momentos: ['inicio'], shorts: true }, campana: { activo: true, momentos: ['mitad'] }, comentar: { activo: true, momentos: ['final'], texto: 'Escribe AMÉN en los comentarios' }, compartir: { activo: false, momentos: ['mitad'] } };
function pintaExtras(guardado) {
  let e = null;
  try { e = guardado ? JSON.parse(guardado) : null; } catch (_error) { e = null; }
  e = e || EXTRAS_DEFECTO;
  document.querySelectorAll('[data-extra]').forEach(fila => {
    const v = e[fila.dataset.extra] || EXTRAS_DEFECTO[fila.dataset.extra];
    fila.querySelector('[data-extra-activo]').checked = v.activo !== false;
    fila.querySelectorAll('.extras-when input').forEach(c => { c.checked = (v.momentos || []).includes(c.value); });
  });
  $('#extras-comentar-texto').value = (e.comentar && e.comentar.texto) || EXTRAS_DEFECTO.comentar.texto;
  $('#extras-suscribir-shorts').checked = !(e.suscribir && e.suscribir.shorts === false);
}
function leeExtras() {
  const e = {};
  document.querySelectorAll('[data-extra]').forEach(fila => {
    e[fila.dataset.extra] = {
      activo: fila.querySelector('[data-extra-activo]').checked,
      momentos: [...fila.querySelectorAll('.extras-when input:checked')].map(c => c.value)
    };
  });
  e.comentar.texto = $('#extras-comentar-texto').value.trim();
  e.suscribir.shorts = $('#extras-suscribir-shorts').checked;
  return e;
}

function populateSettings(profile = {}, settings = {}, providers = []) {
  const form = $('#profile-form');
  const mapping = {
    channelName: profile.channel_name,
    goal: profile.goal,
    targetAudience: profile.target_audience,
    brandVoice: profile.brand_voice,
    defaultStyle: profile.default_style,
    callToAction: profile.call_to_action,
    visualStyle: profile.visual_style,
    timezone: profile.timezone,
    bannedTopics: (profile.bannedTopics || []).join(', ')
  };
  for (const [name, value] of Object.entries(mapping)) {
    if (form.elements[name] && document.activeElement !== form.elements[name]) form.elements[name].value = value || '';
  }
  $('#approval-required').checked = settings.approval_required !== 'false';
  $('#notifications-enabled').checked = settings.notification_enabled !== 'false';
  pintaExtras(settings.video_extras);
  const videoMapping = {
    videoProvider: settings.video_provider || 'slideshow',
    videoGenerationMode: settings.video_generation_mode || 'hybrid',
    videoClipDuration: settings.video_clip_duration || '8',
    videoMaxGeneratedSeconds: settings.video_max_generated_seconds || '60'
  };
  for (const [name, value] of Object.entries(videoMapping)) {
    if (form.elements[name] && document.activeElement !== form.elements[name]) form.elements[name].value = value;
  }
  const selected = providers.find(provider => provider.id === videoMapping.videoProvider);
  $('#video-provider-status').textContent = videoMapping.videoProvider === 'auto'
    ? i18n.msg`${providers.filter(provider => provider.available && provider.id !== 'slideshow').length} paid provider(s) available; local slideshow remains the final fallback.`
    : videoMapping.videoProvider === 'slideshow' ? i18n.t('Local FFmpeg slideshow is selected; no external video credentials are required.')
      : selected?.available ? i18n.msg`${label(selected.id)} is configured (${selected.model}).` : i18n.msg`${label(videoMapping.videoProvider)} credentials are not configured.`;
}

function switchView(view) {
  if (!$(`#${view}-view`)) return;
  ui.currentView = view;
  $$('.nav-item').forEach(item => {
    const active = item.dataset.view === view;
    item.classList.toggle('active', active);
    if (active) item.setAttribute('aria-current', 'page');
    else item.removeAttribute('aria-current');
  });
  $$('.view').forEach(item => item.classList.toggle('active', item.id === `${view}-view`));
  const titles = {
    overview: [i18n.t('OPERATOR OVERVIEW'), i18n.t('Your channel, in production.')],
    research: [i18n.t('RESEARCH INBOX'), i18n.t('Turn evidence into the next production.')],
    shorts: [i18n.t('VERSE SHORTS'), i18n.t('Verses in, shorts out.')],
    clipping: [i18n.t('CLIPPING'), i18n.t('Long videos into short clips.')],
    operator: [i18n.t('AUTONOMOUS OPERATOR'), i18n.t('Give Oraflow the strategy.')],
    pipeline: [i18n.t('CONTENT OPERATIONS'), i18n.t('From idea to published.')],
    calendar: [i18n.t('EDITORIAL PLANNING'), i18n.t('Plan before you generate.')],
    analytics: [i18n.t('PERFORMANCE'), i18n.t('Turn results into the next move.')],
    engagement: [i18n.t('AUDIENCE ENGAGEMENT'), i18n.t('Talk with the people watching.')],
    readiness: [i18n.t('PRODUCTION READINESS'), i18n.t('Verify before autonomy runs.')],
    accounts: [i18n.t('ACCOUNTS'), i18n.t('Every connection, tested.')],
    redes: ['REDES SOCIALES', 'Instagram y Facebook en piloto automático.'],
    settings: [i18n.t('CHANNEL GUARDRAILS'), i18n.t('Make every agent sound like you.')],
    docs: [i18n.t('GUIDES'), i18n.t('How to get the most out of Oraflow.')]
  };
  $('#view-eyebrow').textContent = i18n.t(titles[view][0]);
  $('#view-title').textContent = titles[view][1];
  location.hash = view;
  renderCurrentView();
  if (view === 'research') window.ensureResearchLoaded?.();
}

function selectOptions(options, selected) {
  return options.map(([value, label]) =>
    i18n.html`<option value="${escapeHTML(value)}" ${value === selected ? 'selected' : ''}>${escapeHTML(label)}</option>`
  ).join('');
}

function renderSourceEditor(source = {}, disabled = false) {
  return i18n.html`<article class="provenance-item" data-provenance-source data-id="${escapeHTML(source.id || '')}" data-published-at="${escapeHTML(source.publishedAt || '')}" data-accessed-at="${escapeHTML(source.accessedAt || '')}">
    <div class="provenance-item-heading"><strong>Research source</strong><button type="button" class="text-button danger-text" data-remove-provenance ${disabled ? 'disabled' : ''}>Remove</button></div>
    <label><span>URL</span><input data-field="url" type="url" value="${escapeHTML(source.url || '')}" placeholder="https://..." required ${disabled ? 'disabled' : ''}></label>
    <div class="form-grid two">
      <label><span>Title</span><input data-field="title" value="${escapeHTML(source.title || '')}" maxlength="300" ${disabled ? 'disabled' : ''}></label>
      <label><span>Publisher</span><input data-field="publisher" value="${escapeHTML(source.publisher || '')}" maxlength="200" ${disabled ? 'disabled' : ''}></label>
      <label><span>Type</span><select data-field="sourceType" ${disabled ? 'disabled' : ''}>${selectOptions([
        ['official', i18n.t('Official source')], ['article', i18n.t('Article')], ['video', i18n.t('Video')], ['dataset', i18n.t('Dataset')], ['asset', i18n.t('Asset or license')], ['other', i18n.t('Other')]
      ], source.sourceType || 'other')}</select></label>
      <label><span>Review status</span><select data-field="status" ${disabled ? 'disabled' : ''}>${selectOptions([
        ['pending', i18n.t('Pending review')], ['verified', i18n.t('Verified')], ['rejected', i18n.t('Rejected')]
      ], source.status || 'pending')}</select></label>
    </div>
    <label><span>Evidence notes</span><textarea data-field="notes" rows="2" maxlength="1000" ${disabled ? 'disabled' : ''}>${escapeHTML(source.notes || '')}</textarea></label>
    ${source.url ? i18n.html`<a class="source-link" href="${escapeHTML(source.url)}" target="_blank" rel="noopener">Open source ↗</a>` : ''}
  </article>`;
}

function renderClaimEditor(claim = {}, sources = [], disabled = false) {
  const linked = new Set(claim.sourceIds || []);
  return i18n.html`<article class="provenance-item ${claim.riskLevel === 'high' ? 'high-risk' : ''}" data-provenance-claim data-id="${escapeHTML(claim.id || '')}">
    <div class="provenance-item-heading"><strong>Factual claim</strong><button type="button" class="text-button danger-text" data-remove-provenance ${disabled ? 'disabled' : ''}>Remove</button></div>
    <label><span>Claim</span><textarea data-field="text" rows="3" maxlength="1000" required ${disabled ? 'disabled' : ''}>${escapeHTML(claim.text || '')}</textarea></label>
    <div class="form-grid two">
      <label><span>Risk</span><select data-field="riskLevel" ${disabled ? 'disabled' : ''}>${selectOptions([
        ['standard', i18n.t('Standard')], ['high', i18n.t('High risk')]
      ], claim.riskLevel || 'standard')}</select></label>
      <label><span>Resolution</span><select data-field="status" ${disabled ? 'disabled' : ''}>${selectOptions([
        ['pending', i18n.t('Pending')], ['supported', i18n.t('Supported')], ['unsupported', i18n.t('Unsupported')], ['waived', i18n.t('Waived with note')]
      ], claim.status || 'pending')}</select></label>
    </div>
    <fieldset class="source-checklist" ${disabled ? 'disabled' : ''}><legend>Supporting sources</legend>
      ${sources.length ? sources.map(source => i18n.html`<label><input type="checkbox" data-claim-source="${escapeHTML(source.id)}" ${linked.has(source.id) ? 'checked' : ''}> ${escapeHTML(source.title || source.url)}</label>`).join('') : i18n.markup('<small>Add a source before marking this claim supported.</small>')}
    </fieldset>
    <label><span>Reviewer notes</span><textarea data-field="notes" rows="2" maxlength="1000" placeholder="Required when waived" ${disabled ? 'disabled' : ''}>${escapeHTML(claim.notes || '')}</textarea></label>
  </article>`;
}

function renderProvenanceEditor(provenance = {}, canReview = true) {
  const sources = provenance.sources || [];
  const claims = provenance.claims || [];
  const summary = provenance.summary || {};
  const statusLabel = provenance.status === 'verified' ? i18n.t('Evidence verified') : provenance.status === 'not_required' ? i18n.t('No claims declared') : i18n.msg`${summary.unresolvedClaims || 0} unresolved`;
  return i18n.html`<section class="provenance-panel">
    <div class="panel-heading"><div><p class="eyebrow">RESEARCH &amp; PROVENANCE</p><h3>Evidence desk</h3><p>Verify sources, connect every factual claim, and record disclosure before approval.</p></div><span class="status ${provenance.status === 'verified' || provenance.status === 'not_required' ? 'success' : 'warning'}">${escapeHTML(statusLabel)}</span></div>
    <div class="provenance-toolbar"><strong>Sources</strong>${canReview ? i18n.markup('<button type="button" class="text-button" data-add-provenance-source>Add source +</button>') : ''}</div>
    <div id="provenance-sources" class="provenance-list">${sources.map(source => renderSourceEditor(source, !canReview)).join('') || i18n.markup('<p class="empty-inline">No research sources attached.</p>')}</div>
    <div class="provenance-toolbar"><strong>Claims</strong>${canReview ? i18n.markup('<button type="button" class="text-button" data-add-provenance-claim>Add claim +</button>') : ''}</div>
    <div id="provenance-claims" class="provenance-list">${claims.map(claim => renderClaimEditor(claim, sources, !canReview)).join('') || i18n.markup('<p class="empty-inline">No externally verifiable claims declared.</p>')}</div>
    <label class="toggle disclosure-toggle"><input id="contains-synthetic-media" type="checkbox" ${provenance.containsSyntheticMedia ? 'checked' : ''} ${canReview ? '' : 'disabled'}><span></span> Contains realistic altered or synthetic media requiring YouTube disclosure</label>
    ${canReview ? i18n.markup('<button type="button" class="button secondary" data-save-provenance>Save evidence review</button>') : ''}
  </section>`;
}

function renderDiscoverabilityPanel(item) {
  const audit = item.discoverability;
  const findings = audit?.findings || [];
  const state = !audit ? i18n.t('Not run') : audit.status === 'unavailable' ? i18n.t('Unavailable') : i18n.msg`${findings.length} finding${findings.length === 1 ? '' : 's'}`;
  const stateClass = audit?.status === 'passed' || (audit && findings.length === 0) ? 'success' : 'warning';
  return i18n.html`<section class="discoverability-panel">
    <div class="panel-heading discoverability-heading">
      <div><p class="eyebrow">DISCOVERABILITY PREFLIGHT</p><h3>DarkzSEO review</h3><p>Review GEO, AIO, AEO, and web-search guidance against this content package. Findings are advisory and never rewrite or publish content.</p></div>
      <div class="discoverability-actions"><span class="status ${stateClass}">${escapeHTML(state)}</span><button type="button" class="button secondary small" data-discoverability-run="${escapeHTML(item.id)}">${audit ? i18n.t('Run again') : i18n.t('Run audit')}</button></div>
    </div>
    ${audit?.error ? i18n.html`<p class="callout">DarkzSEO could not run${audit.errorCode || audit.error_code ? ` (${escapeHTML(audit.errorCode || audit.error_code)})` : ''}: ${escapeHTML(audit.error)}</p>` : ''}
    ${findings.length ? i18n.html`<div class="discoverability-findings">${findings.map(finding => {
      const reviewStatus = finding.reviewStatus || finding.review_status || 'pending';
      return i18n.html`<article class="discoverability-finding severity-${escapeHTML(String(finding.severity || 'info').toLowerCase())}" data-discoverability-finding="${escapeHTML(finding.id)}">
        <div class="discoverability-finding-heading"><span class="severity-badge">${escapeHTML(finding.severity)}</span><strong>${escapeHTML(finding.ruleId || finding.rule_id)}</strong><span class="review-state ${escapeHTML(reviewStatus)}">${escapeHTML(label(reviewStatus))}</span></div>
        <p>${escapeHTML(finding.message)}</p>
        ${finding.remediation ? i18n.html`<small>${escapeHTML(finding.remediation)}</small>` : ''}
        ${finding.reviewReason || finding.review_reason ? i18n.html`<small>Reviewer note: ${escapeHTML(finding.reviewReason || finding.review_reason)}</small>` : ''}
        <div class="discoverability-review-actions"><button type="button" class="text-button approve" data-discoverability-accept ${reviewStatus === 'accepted' ? 'disabled' : ''}>Keep as actionable</button><button type="button" class="text-button" data-discoverability-dismiss ${reviewStatus === 'dismissed' ? 'disabled' : ''}>Dismiss false positive</button></div>
      </article>`;
    }).join('')}</div>` : audit && audit.status !== 'unavailable' ? i18n.markup('<p class="empty-inline">No discoverability findings. The content package passed the configured advisory checks.</p>') : i18n.markup('<p class="empty-inline">Run DarkzSEO to create a versioned, reviewable audit for this production.</p>')}
  </section>`;
}

function renderSceneEditor(item, canReview = true) {
  const scenes = item.scenes || [];
  if (!scenes.length) return '';
  const verifiedSources = (item.provenance?.sources || []).filter(source => source.status === 'verified');
  const audio = item.assets?.audio || {};
  const intentionalSilence = audio.intentionalSilence === true;
  const narrationIssues = scenes.filter(scene => !['current', 'intentional_silence'].includes(scene.narrationStatus)).length;
  return i18n.html`<section class="scene-repair-panel">
    <div class="panel-heading scene-heading">
      <div><p class="eyebrow">SCENE REPAIR STUDIO</p><h3>Repair the timeline, not the whole video</h3><p>Edit, replace, or regenerate one scene. Changes remain draft-only until the timeline is rebuilt and approved.</p></div>
      ${canReview ? i18n.html`<button type="button" class="button primary small" data-rebuild-scenes="${escapeHTML(item.id)}">Rebuild final video</button>` : ''}
    </div>
    <div class="narration-recovery ${intentionalSilence ? 'intentional' : narrationIssues ? 'attention' : ''}">
      <div><p class="eyebrow">NARRATION RELIABILITY</p><strong>${intentionalSilence ? i18n.t('Intentional silence confirmed') : narrationIssues ? i18n.msg`${narrationIssues} scene${narrationIssues === 1 ? '' : 's'} need narration` : i18n.t('Narration evidence is current')}</strong>
      <p>${intentionalSilence ? escapeHTML(audio.silenceReason || '') : audio.error ? escapeHTML(audio.error) : i18n.t('Regenerate narration without replacing the scene visual. Approval remains blocked until audio is ready.')}</p>
      ${audio.provider ? i18n.html`<span class="narration-evidence">${escapeHTML(audio.provider)}${audio.model ? ` · ${escapeHTML(audio.model)}` : ''}${audio.externalTaskId ? i18n.msg` · task ${escapeHTML(audio.externalTaskId)}` : ''}</span>` : ''}</div>
      ${canReview ? intentionalSilence
        ? i18n.markup('<button type="button" class="button secondary small" data-require-narration>Require narration</button>')
        : i18n.markup('<button type="button" class="button secondary small" data-intentional-silence>Use intentional silence</button>') : ''}
    </div>
    <div class="scene-summary"><strong>${scenes.length} scenes</strong><span>${Math.round(scenes.reduce((sum, scene) => sum + Number(scene.duration || 0), 0))}s timeline</span><span>${scenes.filter(scene => scene.status !== 'ready').length} pending repairs</span></div>
    <div class="scene-list">
      ${scenes.map((scene, index) => {
        const disabled = !canReview || scene.locked;
        const sourceIds = new Set(scene.provenanceSourceIds || []);
        const preview = scene.assetUrl
          ? scene.assetType === 'video'
            ? i18n.html`<video controls preload="metadata"><source src="${escapeHTML(scene.assetUrl)}"></video>`
            : i18n.html`<img src="${escapeHTML(scene.assetUrl)}" alt="${escapeHTML(scene.label)} scene asset">`
          : i18n.markup('<div class="preview-placeholder">No scene asset</div>');
        return i18n.html`<article class="scene-card ${scene.locked ? 'locked' : ''}" data-scene-card="${escapeHTML(scene.id)}">
          <div class="scene-card-top">
            <div class="scene-preview">${preview}<span class="scene-number">${index + 1}</span></div>
            <div class="scene-identity">
              <div class="scene-status-row">${statusChip(scene.status)} ${statusChip(`narration_${scene.narrationStatus || 'unavailable'}`)}<span>r${scene.revision}</span></div>
              <label><span>Scene label</span><input data-scene-field="label" maxlength="120" value="${escapeHTML(scene.label)}" ${disabled ? 'disabled' : ''}></label>
              <label><span>Duration</span><input data-scene-field="duration" type="number" min="2" max="600" step="0.5" value="${escapeHTML(scene.duration)}" ${disabled ? 'disabled' : ''}></label>
            </div>
          </div>
          <label><span>Narration</span><textarea data-scene-field="scriptText" rows="4" maxlength="10000" ${disabled ? 'disabled' : ''}>${escapeHTML(scene.scriptText)}</textarea></label>
          <label><span>Visual prompt</span><textarea data-scene-field="prompt" rows="3" maxlength="2000" ${disabled ? 'disabled' : ''}>${escapeHTML(scene.prompt)}</textarea></label>
          ${verifiedSources.length ? i18n.html`<fieldset class="source-checklist scene-sources" ${disabled ? 'disabled' : ''}><legend>Verified evidence linked to this narration</legend>${verifiedSources.map(source => i18n.html`<label><input type="checkbox" data-scene-source value="${escapeHTML(source.id)}" ${sourceIds.has(source.id) ? 'checked' : ''}> ${escapeHTML(source.title)}</label>`).join('')}</fieldset>` : ''}
          <div class="scene-options">
            <label class="toggle"><input type="checkbox" data-scene-factual checked ${disabled ? 'disabled' : ''}><span></span> Narration changes may contain factual claims</label>
            <span>Visual: ${escapeHTML(scene.provider || 'local')} ${scene.model ? `· ${escapeHTML(scene.model)}` : ''}</span>
          </div>
          <div class="scene-narration-evidence"><span>Narration: ${escapeHTML(scene.narrationProvider || i18n.t('not generated'))}${scene.narrationModel ? ` · ${escapeHTML(scene.narrationModel)}` : ''}${scene.narrationTaskId ? i18n.msg` · task ${escapeHTML(scene.narrationTaskId)}` : ''}</span>${scene.narrationError ? i18n.html`<span class="danger-text">${escapeHTML(scene.narrationError)}</span>` : ''}</div>
          ${canReview ? i18n.html`<div class="scene-actions">
            <button type="button" class="text-button" data-scene-move="up" ${disabled || index === 0 ? 'disabled' : ''}>↑ Earlier</button>
            <button type="button" class="text-button" data-scene-move="down" ${disabled || index === scenes.length - 1 ? 'disabled' : ''}>↓ Later</button>
            <button type="button" class="text-button approve" data-scene-save ${disabled ? 'disabled' : ''}>Save scene</button>
            <button type="button" class="text-button" data-scene-narration ${disabled ? 'disabled' : ''}>Regenerate narration only</button>
            <button type="button" class="text-button" data-scene-regenerate ${disabled ? 'disabled' : ''}>Regenerate scene</button>
            <label class="text-button upload-button ${disabled ? 'disabled' : ''}">Replace asset<input type="file" data-scene-upload accept="image/png,image/jpeg,image/webp,video/mp4" ${disabled ? 'disabled' : ''}></label>
            <button type="button" class="text-button" data-scene-lock>${scene.locked ? i18n.t('Unlock') : i18n.t('Lock')}</button>
          </div>` : ''}
        </article>`;
      }).join('')}
    </div>
  </section>`;
}

function renderShortsStudio(item) {
  if (!item.assets?.finalVideo?.path || item.assets.finalVideo.simulated) return '';
  const clips = item.shorts || [];
  const parentApproved = item.review_status === 'approved';
  return i18n.html`<section class="shorts-studio">
    <div class="panel-heading shorts-heading">
      <div><p class="eyebrow">SHORTS REPURPOSING STUDIO</p><h3>Turn one production into vertical reach</h3><p>Create local 9:16 excerpts with mobile captions. Drafts inherit the source production's evidence and still require separate approval.</p></div>
      <button type="button" class="button secondary small" data-propose-shorts="${escapeHTML(item.id)}">${clips.length ? i18n.t('Refresh drafts') : i18n.t('Create 3 Short drafts')}</button>
    </div>
    <div class="shorts-evidence ${parentApproved ? 'ready' : ''}">
      <span>${parentApproved ? '✓ Source production approved' : i18n.t('Source approval required before scheduling')}</span>
      <span>${escapeHTML(item.provenance?.status === 'verified' ? i18n.t('Evidence verified') : item.provenance?.status === 'not_required' ? i18n.t('No factual claims declared') : i18n.t('Evidence review incomplete'))}</span>
      <span>Local render · no new provider call</span>
    </div>
    ${clips.length ? i18n.html`<div class="shorts-grid">${clips.map(clip => {
      const locked = ['scheduled', 'uploading', 'published', 'reconciliation_required'].includes(clip.status);
      const rendered = Boolean(clip.assetUrls?.video);
      return i18n.html`<article class="short-card" data-short-card="${escapeHTML(clip.id)}">
        <div class="short-preview">${rendered
          ? i18n.html`<video controls preload="metadata"><source src="${escapeHTML(clip.assetUrls.video)}" type="video/mp4"></video>`
          : i18n.html`<div class="short-placeholder"><strong>9:16</strong><span>${escapeHTML(label(clip.layout))} layout</span></div>`}</div>
        <div class="short-editor">
          <div class="scene-status-row">${statusChip(clip.status)}<span>${Number(clip.duration || 0).toFixed(0)}s</span><span>${escapeHTML((clip.sourceSceneLabels || []).join(' + '))}</span></div>
          <label><span>Short title</span><input data-short-field="title" maxlength="100" value="${escapeHTML(clip.title)}" ${locked ? 'disabled' : ''}></label>
          <label><span>Description and parent-video CTA</span><textarea data-short-field="description" rows="3" maxlength="5000" ${locked ? 'disabled' : ''}>${escapeHTML(clip.description)}</textarea></label>
          <label><span>Tags</span><input data-short-field="tags" value="${escapeHTML((clip.tags || []).join(', '))}" ${locked ? 'disabled' : ''}></label>
          <div class="form-grid two">
            <label><span>Vertical layout</span><select data-short-field="layout" ${locked ? 'disabled' : ''}><option value="blur" ${clip.layout === 'blur' ? 'selected' : ''}>Blurred canvas</option><option value="crop" ${clip.layout === 'crop' ? 'selected' : ''}>Center crop</option><option value="stacked" ${clip.layout === 'stacked' ? 'selected' : ''}>Stacked focus</option></select></label>
            <label><span>Publish time</span><input data-short-field="publishTime" type="datetime-local" value="${toLocalInput(clip.publishTime)}" ${locked ? 'disabled' : ''}></label>
            <label><span>Privacy</span><select data-short-field="privacyStatus" ${locked ? 'disabled' : ''}><option value="private" ${clip.privacyStatus === 'private' ? 'selected' : ''}>Private</option><option value="unlisted" ${clip.privacyStatus === 'unlisted' ? 'selected' : ''}>Unlisted</option><option value="public" ${clip.privacyStatus === 'public' ? 'selected' : ''}>Public</option></select></label>
          </div>
          <p class="short-rationale">${escapeHTML(clip.rationale || '')}${clip.error ? i18n.html`<br><span class="danger-text">${escapeHTML(clip.error)}</span>` : ''}</p>
          ${clip.youtubeUrl ? i18n.html`<a class="source-link" href="${escapeHTML(clip.youtubeUrl)}" target="_blank" rel="noopener">Open published Short ↗</a>` : ''}
          ${!locked ? i18n.html`<div class="short-actions"><button type="button" class="text-button" data-short-save>Save draft</button><button type="button" class="button secondary small" data-short-render>${rendered ? i18n.t('Render again') : i18n.t('Render 9:16')}</button><button type="button" class="button primary small" data-short-approve ${!parentApproved || clip.status !== 'rendered' ? 'disabled' : ''} title="${!parentApproved ? i18n.t('Approve the source production first') : clip.status !== 'rendered' ? i18n.t('Render this Short first') : i18n.t('Confirm and schedule this Short')}">Approve &amp; schedule</button></div>` : ''}
        </div>
      </article>`;
    }).join('')}</div>` : i18n.markup('<p class="empty-inline">No Short drafts yet. Create three candidates from the current scene timeline without calling a paid provider.</p>')}
  </section>`;
}

async function openContent(productionId) {
  $('#loading').classList.add('active');
  try {
    const item = await api(`/api/content/${encodeURIComponent(productionId)}`);
    const data = item.editorData || {};
    const title = data.title || item.seo?.title || item.script?.title || item.strategy?.topic || i18n.t('Untitled content');
    const description = data.description || item.seo?.description || '';
    const tags = data.tags || item.seo?.tags || [];
    const publishTime = data.publishTime || item.schedule?.publish_time || item.scheduled_publish_time;
    const canReview = !['published'].includes(item.schedule?.status);
    const experiment = data.packagingExperiment;
    const selectedTitleVariant = Number(data.selectedTitleVariant || 0);
    const selectedThumbnailVariant = Number(data.selectedThumbnailVariant || 0);
    $('#content-detail').innerHTML = i18n.html`
      <div class="dialog-heading"><div><p class="eyebrow">CONTENT REVIEW</p><h2>${escapeHTML(title)}</h2><div class="meta-line">${statusChip(item.schedule?.status || item.review_status || item.status)} · Quality ${qualityScore(item.qualityChecks)}%</div></div><button type="button" class="close-button" data-close>×</button></div>
      <div class="content-tabs" role="tablist" aria-label="Production detail">
        <button type="button" id="content-editor-tab" role="tab" aria-selected="true" aria-controls="content-review-form" data-content-tab="editor">Review & edit</button>
        <button type="button" id="content-storyboard-tab" role="tab" aria-selected="false" aria-controls="storyboard-panel" data-content-tab="storyboard">Storyboard</button>
      </div>
      <section id="storyboard-panel" class="hidden" role="tabpanel" aria-labelledby="content-storyboard-tab" aria-live="polite"></section>
      <form id="content-review-form" class="editor content-review-editor" role="tabpanel" aria-labelledby="content-editor-tab">
        <div class="content-layout">
          <div>
            <div class="preview">${item.assetUrls.video ? i18n.html`<video controls preload="metadata" poster="${item.assetUrls.thumbnail || ''}"><source src="${item.assetUrls.video}" type="video/mp4"></video>` : item.assetUrls.thumbnail ? i18n.html`<img src="${item.assetUrls.thumbnail}" alt="Generated thumbnail">` : i18n.markup('<div class="preview-placeholder">No playable preview was produced.</div>')}</div>
            <div class="quality-grid">${(item.qualityChecks || []).map(check => i18n.html`<div class="quality-check ${check.passed ? 'pass' : 'fail'}">${check.passed ? '✓' : '×'} ${escapeHTML(check.message)}</div>`).join('') || i18n.markup('<div class="quality-check">No quality results recorded.</div>')}</div>
            ${item.review_notes ? i18n.html`<p class="callout">${escapeHTML(item.review_notes)}</p>` : ''}
          </div>
          <div class="editor">
            <label><span>Title</span><input name="title" maxlength="100" value="${escapeHTML(title)}" required></label>
            <label><span>Description</span><textarea name="description" rows="7">${escapeHTML(description)}</textarea></label>
            <label><span>Tags</span><input name="tags" value="${escapeHTML(tags.join(', '))}"></label>
            ${experiment ? i18n.html`<section class="experiment-panel">
              <div><p class="eyebrow">APPROVED LEARNING EXPERIMENT</p><strong>${escapeHTML(experiment.hypothesis)}</strong><p>Choose the packaging to ship. Nothing changes on YouTube until this content is approved and published.</p></div>
              <label><span>Title variant</span><select name="selectedTitleVariant">${experiment.titleVariants.map((variant, index) => i18n.html`<option value="${index}" data-title="${escapeHTML(variant.title)}" ${index === selectedTitleVariant ? 'selected' : ''}>${escapeHTML(variant.label)} — ${escapeHTML(variant.title)}</option>`).join('')}</select></label>
              <div class="experiment-thumbnails">${experiment.thumbnailVariants.map((variant, index) => i18n.html`<label class="experiment-thumb ${index === selectedThumbnailVariant ? 'selected' : ''}"><input type="radio" name="selectedThumbnailVariant" value="${index}" ${index === selectedThumbnailVariant ? 'checked' : ''}><img src="${escapeHTML(item.assetUrls.experimentThumbnails?.[index] || '')}" alt="${escapeHTML(variant.label)} thumbnail variant"><span>${escapeHTML(variant.label)}</span></label>`).join('')}</div>
            </section>` : ''}
          </div>
        </div>
        ${renderSceneEditor(item, canReview)}
        ${renderShortsStudio(item)}
        ${renderDiscoverabilityPanel(item)}
        ${renderProvenanceEditor(item.provenance, canReview)}
          <div class="form-grid two">
            <label><span>Publish time</span><input name="publishTime" type="datetime-local" value="${toLocalInput(publishTime)}"></label>
            <label><span>Privacy</span><select name="privacyStatus"><option value="private" ${data.privacyStatus === 'private' ? 'selected' : ''}>Private</option><option value="unlisted" ${data.privacyStatus === 'unlisted' ? 'selected' : ''}>Unlisted</option><option value="public" ${data.privacyStatus === 'public' ? 'selected' : ''}>Public</option></select></label>
          </div>
          <div class="settings-row">
            <label class="toggle"><input name="factChecked" type="checkbox" ${data.factChecked ? 'checked' : ''}><span></span> Facts and claims reviewed</label>
            <label class="toggle"><input name="rightsConfirmed" type="checkbox" ${data.rightsConfirmed ? 'checked' : ''}><span></span> Media rights confirmed</label>
          </div>
          ${canReview ? i18n.html`<div class="form-actions"><button type="button" class="button primary" data-approve-content="${escapeHTML(item.id)}">Approve & schedule</button><button type="button" class="button secondary" data-save-content="${escapeHTML(item.id)}">Save draft</button><button type="button" class="button danger" data-reject-content="${escapeHTML(item.id)}">Reject</button><button type="button" class="button ghost" data-retry-content="${escapeHTML(item.id)}">Regenerate</button></div>` : i18n.html`<a class="button secondary" href="${escapeHTML(item.schedule?.youtube_url || '#')}" target="_blank" rel="noopener">Open on YouTube</a>`}
      </form>`;
    $('#content-review-form').dataset.productionId = item.id;
    $('#content-dialog').showModal();
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    $('#loading').classList.remove('active');
  }
}

function toLocalInput(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset() * 60000;
  return escapeHTML(new Date(date.getTime() - offset).toISOString().slice(0, 16));
}

function contentFormData() {
  const form = $('#content-review-form');
  const values = Object.fromEntries(new FormData(form));
  return {
    title: values.title,
    description: values.description,
    tags: values.tags,
    publishTime: values.publishTime ? new Date(values.publishTime).toISOString() : undefined,
    privacyStatus: values.privacyStatus,
    selectedTitleVariant: values.selectedTitleVariant,
    selectedThumbnailVariant: values.selectedThumbnailVariant,
    factChecked: form.elements.factChecked?.checked || false,
    rightsConfirmed: form.elements.rightsConfirmed?.checked || false
  };
}

function sceneFormData(card) {
  return {
    label: card.querySelector('[data-scene-field="label"]').value,
    duration: Number(card.querySelector('[data-scene-field="duration"]').value),
    scriptText: card.querySelector('[data-scene-field="scriptText"]').value,
    prompt: card.querySelector('[data-scene-field="prompt"]').value,
    provenanceSourceIds: Array.from(card.querySelectorAll('[data-scene-source]:checked')).map(input => input.value),
    factualChange: card.querySelector('[data-scene-factual]')?.checked !== false
  };
}

function shortFormData(card) {
  const publishTime = card.querySelector('[data-short-field="publishTime"]')?.value;
  return {
    title: card.querySelector('[data-short-field="title"]')?.value,
    description: card.querySelector('[data-short-field="description"]')?.value,
    tags: card.querySelector('[data-short-field="tags"]')?.value,
    layout: card.querySelector('[data-short-field="layout"]')?.value,
    publishTime: publishTime ? new Date(publishTime).toISOString() : undefined,
    privacyStatus: card.querySelector('[data-short-field="privacyStatus"]')?.value
  };
}

async function refreshContentDialog(productionId, message) {
  if (message) showToast(message);
  if ($('#content-dialog').open) $('#content-dialog').close();
  await refreshDashboard(true);
  await openContent(productionId);
}

async function uploadSceneAsset(productionId, sceneId, file) {
  if (!confirm(i18n.t('Confirm you own or have permission to use this replacement asset.'))) return;
  const synthetic = confirm(i18n.t('Does this replacement contain realistic altered or synthetic media that should be disclosed to YouTube?'));
  $('#loading').classList.add('active');
  try {
    await api(`/api/content/${encodeURIComponent(productionId)}/scenes/${encodeURIComponent(sceneId)}/asset`, {
      method: 'PUT',
      body: file,
      headers: {
        'Content-Type': file.type,
        'x-file-name': file.name,
        'x-rights-confirmed': 'true',
        'x-synthetic-media': String(synthetic)
      }
    });
    await refreshContentDialog(productionId, i18n.t('Scene asset replaced. Rebuild before approval.'));
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    $('#loading').classList.remove('active');
  }
}

function provenanceFormData() {
  const sources = $$('[data-provenance-source]').map(item => ({
    id: item.dataset.id,
    url: item.querySelector('[data-field="url"]').value,
    title: item.querySelector('[data-field="title"]').value,
    publisher: item.querySelector('[data-field="publisher"]').value,
    sourceType: item.querySelector('[data-field="sourceType"]').value,
    status: item.querySelector('[data-field="status"]').value,
    notes: item.querySelector('[data-field="notes"]').value,
    publishedAt: item.dataset.publishedAt || null,
    accessedAt: item.dataset.accessedAt || null
  }));
  const claims = $$('[data-provenance-claim]').map(item => ({
    id: item.dataset.id,
    text: item.querySelector('[data-field="text"]').value,
    riskLevel: item.querySelector('[data-field="riskLevel"]').value,
    status: item.querySelector('[data-field="status"]').value,
    notes: item.querySelector('[data-field="notes"]').value,
    sourceIds: [...item.querySelectorAll('[data-claim-source]:checked')].map(input => input.dataset.claimSource)
  }));
  return {
    sources,
    claims,
    containsSyntheticMedia: $('#contains-synthetic-media')?.checked || false
  };
}

function clientId(prefix) {
  const uuid = globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  return `${prefix}_${uuid}`;
}

function currentSourceOptions() {
  return $$('[data-provenance-source]').map(item => ({
    id: item.dataset.id,
    title: item.querySelector('[data-field="title"]').value || item.querySelector('[data-field="url"]').value || i18n.t('New source')
  }));
}

async function persistProvenance(productionId, successMessage = null) {
  $('#loading').classList.add('active');
  try {
    const result = await api(`/api/content/${encodeURIComponent(productionId)}/provenance`, {
      method: 'PUT',
      body: JSON.stringify(provenanceFormData())
    });
    if (successMessage) {
      showToast(successMessage);
      $('#content-dialog').close();
      await openContent(productionId);
    }
    return result;
  } catch (error) {
    showToast(error.message, 'error');
    throw error;
  } finally {
    $('#loading').classList.remove('active');
  }
}

async function mutate(url, method, body, successMessage) {
  $('#loading').classList.add('active');
  try {
    const result = await api(url, { method, body: body === undefined ? undefined : JSON.stringify(body) });
    showToast(successMessage);
    await refreshDashboard(true);
    return result;
  } catch (error) {
    const failures = error.data?.quality?.blockingFailures;
    showToast(failures ? `${error.message}: ${failures.join(', ')}` : error.message, 'error');
    throw error;
  } finally {
    $('#loading').classList.remove('active');
  }
}

document.addEventListener('click', async event => {
  const nav = event.target.closest('[data-view]');
  if (nav) return switchView(nav.dataset.view);
  const go = event.target.closest('[data-go]');
  if (go) return switchView(go.dataset.go);
  if (event.target.closest('[data-close]')) return event.target.closest('dialog').close();

  const open = event.target.closest('[data-open-content]');
  if (open) return openContent(open.dataset.openContent);

  const cancel = event.target.closest('[data-cancel-job]');
  if (cancel && confirm(i18n.t('Cancel this generation job after its current stage?'))) {
    await mutate(`/api/jobs/${encodeURIComponent(cancel.dataset.cancelJob)}/cancel`, 'POST', {}, i18n.t('Cancellation requested.')).catch(() => {});
  }

  const idea = event.target.closest('[data-generate-idea]');
  if (idea) {
    await mutate(`/api/ideas/${encodeURIComponent(idea.dataset.generateIdea)}/generate`, 'POST', { length: 'medium' }, i18n.t('Idea queued for generation.')).catch(() => {});
  }

  const resume = event.target.closest('[data-resume-job]');
  if (resume) {
    const jobId = resume.dataset.resumeJob;
    const select = $$('[data-resume-stage-for]').find(item => item.dataset.resumeStageFor === jobId);
    const stage = select?.value;
    if (confirm(i18n.msg`Resume this job from ${label(stage)}? Later checkpoints will be regenerated.`)) {
      await mutate(`/api/jobs/${encodeURIComponent(jobId)}/resume`, 'POST', { stage }, i18n.msg`Generation resumed from ${label(stage)}.`).catch(() => {});
    }
  }

  const learning = event.target.closest('[data-learning-action]');
  if (learning) {
    const action = learning.dataset.learningAction;
    const id = learning.dataset.learningId;
    const message = action === 'approve'
      ? i18n.t('Learning approved for future autonomous plans.')
      : i18n.t('Learning rejected and excluded from future plans.');
    await mutate(`/api/learning/recommendations/${encodeURIComponent(id)}/${action}`, 'POST', {}, message).catch(() => {});
  }

  const experiment = event.target.closest('[data-experiment-action]');
  if (experiment) {
    const action = experiment.dataset.experimentAction;
    const id = experiment.dataset.experimentId;
    const prompts = {
      approve: i18n.t('Approve this complete experiment plan? This does not change YouTube yet.'),
      start: i18n.t('Start this live test? Oraflow will rotate only the approved arms and restore the control before asking you to adopt a winner.'),
      adopt: i18n.t('Adopt the evidence-backed winner on YouTube and approve its learning for future plans?'),
      cancel: i18n.t('Cancel this experiment and restore the control title and thumbnail?')
    };
    if (prompts[action] && !confirm(prompts[action])) return;
    const messages = {
      approve: i18n.t('Experiment plan approved.'),
      start: i18n.t('Controlled experiment started.'),
      refresh: i18n.t('Experiment evidence refreshed.'),
      adopt: i18n.t('Winner adopted and approved for future planning.'),
      cancel: i18n.t('Experiment cancelled and control restored.')
    };
    await mutate(`/api/experiments/${encodeURIComponent(id)}/${action}`, 'POST', prompts[action] ? { confirmed: true } : {}, messages[action]).catch(() => {});
  }

  const refreshRetention = event.target.closest('#refresh-retention-button');
  if (refreshRetention?.dataset.videoId) {
    refreshRetention.disabled = true;
    try {
      await api(`/api/retention/${encodeURIComponent(refreshRetention.dataset.videoId)}/refresh`, {
        method: 'POST',
        body: JSON.stringify({ measurementWindow: refreshRetention.dataset.measurementWindow || 'rolling' })
      });
      showToast(i18n.t('Retention curve refreshed from YouTube Analytics.'));
      await refreshDashboard(true);
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      refreshRetention.disabled = false;
    }
  }

  const syncEngagement = event.target.closest('#engagement-sync-button');
  if (syncEngagement?.dataset.videoId) {
    syncEngagement.disabled = true;
    try {
      await mutate(`/api/engagement/${encodeURIComponent(syncEngagement.dataset.videoId)}/sync`, 'POST', { analyze: true }, i18n.t('Comments synced from YouTube.'));
      ui.engagementDetail = null;
      renderEngagement(ui.state?.engagement || {});
    } catch (_error) { /* toast shown */ } finally {
      syncEngagement.disabled = false;
    }
  }

  const draftEngagement = event.target.closest('#engagement-draft-button');
  if (draftEngagement?.dataset.videoId) {
    draftEngagement.disabled = true;
    try {
      await mutate(`/api/engagement/${encodeURIComponent(draftEngagement.dataset.videoId)}/draft-replies`, 'POST', {}, i18n.t('Reply drafts created for review.'));
      ui.engagementDetail = null;
      renderEngagement(ui.state?.engagement || {});
    } catch (_error) { /* toast shown */ } finally {
      draftEngagement.disabled = false;
    }
  }

  const replySave = event.target.closest('[data-reply-save]');
  if (replySave) {
    const card = replySave.closest('[data-reply-card]');
    const text = card?.querySelector('[data-reply-text]')?.value || '';
    await mutate(`/api/engagement/replies/${encodeURIComponent(replySave.dataset.replySave)}`, 'PATCH', { editedText: text }, i18n.t('Reply draft updated.')).catch(() => {});
    ui.engagementDetail = null;
    renderEngagement(ui.state?.engagement || {});
  }

  const replyDiscard = event.target.closest('[data-reply-discard]');
  if (replyDiscard) {
    await mutate(`/api/engagement/replies/${encodeURIComponent(replyDiscard.dataset.replyDiscard)}`, 'PATCH', { discard: true }, i18n.t('Reply draft discarded.')).catch(() => {});
    ui.engagementDetail = null;
    renderEngagement(ui.state?.engagement || {});
  }

  const replyApprove = event.target.closest('[data-reply-approve]');
  if (replyApprove) {
    const card = replyApprove.closest('[data-reply-card]');
    const text = card?.querySelector('[data-reply-text]')?.value || '';
    if (!text.trim()) return showToast(i18n.t('Reply text is empty.'), 'error');
    if (confirm(i18n.msg`Post this reply to YouTube?\n\n${text}`)) {
      await mutate(`/api/engagement/replies/${encodeURIComponent(replyApprove.dataset.replyApprove)}/approve`, 'POST', { confirmed: true, editedText: text }, i18n.t('Reply posted to YouTube.')).catch(() => {});
      ui.engagementDetail = null;
      renderEngagement(ui.state?.engagement || {});
    }
  }

  const proposeShorts = event.target.closest('[data-propose-shorts]');
  if (proposeShorts) {
    const productionId = proposeShorts.dataset.proposeShorts;
    const replacing = Boolean(document.querySelector('[data-short-card]'));
    if (replacing && !confirm(i18n.t('Replace the current editable Short drafts? Rendered draft files will remain on disk but their manifest will be replaced.'))) return;
    try {
      await api(`/api/content/${encodeURIComponent(productionId)}/shorts/propose`, {
        method: 'POST', body: JSON.stringify({ count: 3, replace: replacing })
      });
      await refreshContentDialog(productionId, i18n.t('Three local Short drafts created from the current scene timeline.'));
    } catch (error) {
      showToast(error.message, 'error');
    }
    return;
  }

  const discoverabilityRun = event.target.closest('[data-discoverability-run]');
  if (discoverabilityRun) {
    const productionId = discoverabilityRun.dataset.discoverabilityRun;
    try {
      await api(`/api/content/${encodeURIComponent(productionId)}/discoverability/run`, {
        method: 'POST', body: JSON.stringify({ platform: 'youtube' })
      });
      await refreshContentDialog(productionId, i18n.t('Discoverability preflight refreshed. Findings remain advisory until reviewed.'));
    } catch (error) {
      showToast(error.message, 'error');
    }
    return;
  }

  const discoverabilityReview = event.target.closest('[data-discoverability-accept], [data-discoverability-dismiss]');
  if (discoverabilityReview) {
    const card = discoverabilityReview.closest('[data-discoverability-finding]');
    const productionId = $('#content-review-form')?.dataset.productionId;
    if (!card || !productionId) return;
    const status = discoverabilityReview.matches('[data-discoverability-dismiss]') ? 'dismissed' : 'accepted';
    const reason = status === 'dismissed'
      ? (prompt(i18n.t('Why is this finding a false positive? The reason will be retained on future matching audits.')) || '')
      : '';
    if (status === 'dismissed' && !reason) return;
    try {
      await api(`/api/discoverability/findings/${encodeURIComponent(card.dataset.discoverabilityFinding)}`, {
        method: 'PATCH', body: JSON.stringify({ status, reason })
      });
      await refreshContentDialog(productionId, status === 'dismissed' ? i18n.t('Finding dismissed with reviewer evidence.') : i18n.t('Finding kept as an actionable recommendation.'));
    } catch (error) {
      showToast(error.message, 'error');
    }
    return;
  }

  const shortAction = event.target.closest('[data-short-save], [data-short-render], [data-short-approve]');
  if (shortAction) {
    const card = shortAction.closest('[data-short-card]');
    const productionId = $('#content-review-form')?.dataset.productionId;
    const clipId = card?.dataset.shortCard;
    if (!productionId || !clipId) return;
    try {
      const values = shortFormData(card);
      await api(`/api/content/${encodeURIComponent(productionId)}/shorts/${encodeURIComponent(clipId)}`, {
        method: 'PATCH', body: JSON.stringify(values)
      });
      if (shortAction.matches('[data-short-save]')) {
        await refreshContentDialog(productionId, i18n.t('Short draft saved.'));
        return;
      }
      if (shortAction.matches('[data-short-render]')) {
        await api(`/api/content/${encodeURIComponent(productionId)}/shorts/${encodeURIComponent(clipId)}/render`, {
          method: 'POST', body: '{}'
        });
        await refreshContentDialog(productionId, i18n.t('Vertical Short rendered locally with mobile captions.'));
        return;
      }
      if (!confirm(i18n.t('Confirm the inherited evidence, media rights, privacy, and publish time for this Short?'))) return;
      await api(`/api/content/${encodeURIComponent(productionId)}/shorts/${encodeURIComponent(clipId)}/approve`, {
        method: 'POST', body: JSON.stringify({ ...values, confirmed: true })
      });
      await refreshContentDialog(productionId, i18n.t('Short approved and added to the publishing schedule.'));
    } catch (error) {
      showToast(error.message, 'error');
    }
    return;
  }

  const sceneButton = event.target.closest('[data-scene-save], [data-scene-narration], [data-scene-regenerate], [data-scene-lock], [data-scene-move]');
  if (sceneButton) {
    const card = sceneButton.closest('[data-scene-card]');
    const productionId = $('#content-review-form')?.dataset.productionId;
    const sceneId = card?.dataset.sceneCard;
    if (!productionId || !sceneId) return;
    try {
      if (sceneButton.matches('[data-scene-lock]')) {
        await api(`/api/content/${encodeURIComponent(productionId)}/scenes/${encodeURIComponent(sceneId)}`, {
          method: 'PATCH', body: JSON.stringify({ locked: !card.classList.contains('locked') })
        });
        await refreshContentDialog(productionId, card.classList.contains('locked') ? i18n.t('Scene unlocked.') : i18n.t('Scene locked.'));
        return;
      }
      if (sceneButton.matches('[data-scene-move]')) {
        const cards = $$('[data-scene-card]');
        const index = cards.indexOf(card);
        const target = sceneButton.dataset.sceneMove === 'up' ? index - 1 : index + 1;
        if (target < 0 || target >= cards.length) return;
        const ids = cards.map(item => item.dataset.sceneCard);
        [ids[index], ids[target]] = [ids[target], ids[index]];
        await api(`/api/content/${encodeURIComponent(productionId)}/scenes/reorder`, {
          method: 'POST', body: JSON.stringify({ sceneIds: ids })
        });
        await refreshContentDialog(productionId, i18n.t('Timeline order updated. Rebuild before approval.'));
        return;
      }
      await api(`/api/content/${encodeURIComponent(productionId)}/scenes/${encodeURIComponent(sceneId)}`, {
        method: 'PATCH', body: JSON.stringify(sceneFormData(card))
      });
      if (sceneButton.matches('[data-scene-save]')) {
        await refreshContentDialog(productionId, i18n.t('Scene draft saved.'));
        return;
      }
      if (sceneButton.matches('[data-scene-narration]')) {
        if (!confirm(i18n.t('Regenerate narration for only this scene? This may consume TTS provider credits; the provider invoice is authoritative.'))) return;
        await api(`/api/content/${encodeURIComponent(productionId)}/scenes/${encodeURIComponent(sceneId)}/narration`, {
          method: 'POST', body: JSON.stringify({ confirmCost: true })
        });
        await refreshContentDialog(productionId, i18n.t('Scene narration regenerated. Rebuild the final video when every narration segment is ready.'));
        return;
      }
      const estimate = await api(`/api/content/${encodeURIComponent(productionId)}/scenes/${encodeURIComponent(sceneId)}/estimate`);
      const message = estimate.paid
        ? i18n.msg`Regenerate only this scene with ${estimate.provider} (${estimate.generatedSeconds}s). This consumes provider credits; the provider invoice is authoritative. Continue?`
        : i18n.t('Regenerate only this scene with the configured image provider? A live image request may consume provider credits. Continue?');
      if (!confirm(message)) return;
      await api(`/api/content/${encodeURIComponent(productionId)}/scenes/${encodeURIComponent(sceneId)}/regenerate`, {
        method: 'POST', body: JSON.stringify({ confirmPaid: estimate.paid })
      });
      await refreshContentDialog(productionId, i18n.t('Scene regenerated. Rebuild the final video when the timeline is ready.'));
    } catch (error) {
      showToast(error.message, 'error');
    }
    return;
  }

  const silenceAction = event.target.closest('[data-intentional-silence], [data-require-narration]');
  if (silenceAction) {
    const productionId = $('#content-review-form')?.dataset.productionId;
    if (!productionId) return;
    const enabled = silenceAction.matches('[data-intentional-silence]');
    let reason = '';
    if (enabled) {
      reason = prompt(i18n.t('Why is this production intentionally silent? This reason is stored with the approval evidence.')) || '';
      if (!reason) return;
      if (!confirm(i18n.t('Confirm that this production is intentionally silent. Captions and visuals will remain, and approval will record this override.'))) return;
    } else if (!confirm(i18n.t('Require narration again? Approval will be blocked until missing scene narration is regenerated and the video is rebuilt.'))) {
      return;
    }
    try {
      await api(`/api/content/${encodeURIComponent(productionId)}/narration/silence`, {
        method: 'POST', body: JSON.stringify({ enabled, confirmed: enabled, reason })
      });
      await refreshContentDialog(productionId, enabled ? i18n.t('Intentional silence recorded. Rebuild before approval.') : i18n.t('Narration is required again.'));
    } catch (error) {
      showToast(error.message, 'error');
    }
    return;
  }

  const rebuildScenes = event.target.closest('[data-rebuild-scenes]');
  if (rebuildScenes) {
    const productionId = rebuildScenes.dataset.rebuildScenes;
    if (confirm(i18n.t('Rebuild a new final MP4 from the current scene timeline? The previous final video will be preserved.'))) {
      try {
        await api(`/api/content/${encodeURIComponent(productionId)}/scenes/rebuild`, { method: 'POST', body: '{}' });
        await refreshContentDialog(productionId, i18n.t('Final video rebuilt from the repaired timeline. Review it before approval.'));
      } catch (error) {
        showToast(error.message, 'error');
      }
    }
    return;
  }

  const addSource = event.target.closest('[data-add-provenance-source]');
  if (addSource) {
    const list = $('#provenance-sources');
    list.querySelector('.empty-inline')?.remove();
    list.insertAdjacentHTML('beforeend', renderSourceEditor({ id: clientId('source') }));
    return;
  }

  const addClaim = event.target.closest('[data-add-provenance-claim]');
  if (addClaim) {
    const list = $('#provenance-claims');
    list.querySelector('.empty-inline')?.remove();
    list.insertAdjacentHTML('beforeend', renderClaimEditor({ id: clientId('claim') }, currentSourceOptions()));
    return;
  }

  const removeProvenance = event.target.closest('[data-remove-provenance]');
  if (removeProvenance) {
    removeProvenance.closest('.provenance-item')?.remove();
    return;
  }

  const saveProvenance = event.target.closest('[data-save-provenance]');
  if (saveProvenance) {
    const productionId = $('#content-review-form')?.dataset.productionId;
    if (productionId) await persistProvenance(productionId, i18n.t('Evidence review saved.')).catch(() => {});
    return;
  }

  const save = event.target.closest('[data-save-content]');
  if (save) {
    try {
      await persistProvenance(save.dataset.saveContent);
      await mutate(`/api/content/${encodeURIComponent(save.dataset.saveContent)}`, 'PATCH', contentFormData(), i18n.t('Draft and evidence review saved.'));
    } catch (_error) { /* toast already shown */ }
  }

  const approve = event.target.closest('[data-approve-content]');
  if (approve) {
    try {
      await persistProvenance(approve.dataset.approveContent);
      await mutate(`/api/content/${encodeURIComponent(approve.dataset.approveContent)}/approve`, 'POST', contentFormData(), i18n.t('Content approved and scheduled.'));
      $('#content-dialog').close();
    } catch (_error) { /* toast already shown */ }
  }

  const reject = event.target.closest('[data-reject-content]');
  if (reject) {
    const notes = prompt(i18n.t('Why are you rejecting this content?'), i18n.t('Needs a different angle'));
    if (notes !== null) {
      await mutate(`/api/content/${encodeURIComponent(reject.dataset.rejectContent)}/reject`, 'POST', { notes }, i18n.t('Content rejected.')).catch(() => {});
      $('#content-dialog').close();
    }
  }

  const retry = event.target.closest('[data-retry-content]');
  if (retry && confirm(i18n.t('Generate a fresh version using the same topic?'))) {
    await mutate(`/api/content/${encodeURIComponent(retry.dataset.retryContent)}/retry`, 'POST', {}, i18n.t('Regeneration started.')).catch(() => {});
    $('#content-dialog').close();
  }
});

document.addEventListener('change', event => {
  if (event.target.matches('#retention-snapshot-select')) {
    ui.retentionSnapshotId = event.target.value;
    renderRetention(ui.state?.learning?.retention || {});
  }
  if (event.target.matches('#engagement-video-select')) {
    ui.engagementVideoId = event.target.value;
    ui.engagementDetail = null;
    renderEngagement(ui.state?.engagement || {});
  }
  if (event.target.matches('[name="selectedTitleVariant"]')) {
    const title = event.target.selectedOptions[0]?.dataset.title;
    const input = $('#content-review-form [name="title"]');
    if (title && input) input.value = title;
  }
  if (event.target.matches('[data-scene-upload]')) {
    const file = event.target.files?.[0];
    const card = event.target.closest('[data-scene-card]');
    const productionId = $('#content-review-form')?.dataset.productionId;
    if (file && card && productionId) {
      uploadSceneAsset(productionId, card.dataset.sceneCard, file);
    }
  }
});

$('#generate-button').addEventListener('click', () => $('#generate-dialog').showModal());
$('#add-idea-button').addEventListener('click', () => $('#idea-dialog').showModal());
$('#refresh-button').addEventListener('click', () => refreshDashboard());
$('#pipeline-filter').addEventListener('change', () => renderPipeline(ui.state?.pipeline || []));
$('#pipeline-sort').addEventListener('change', () => renderPipeline(ui.state?.pipeline || []));
$('#pipeline-search').addEventListener('input', () => renderPipeline(ui.state?.pipeline || []));
$('#pipeline-reset').addEventListener('click', () => {
  $('#pipeline-search').value = '';
  $('#pipeline-filter').value = 'all';
  $('#pipeline-sort').value = 'newest';
  renderPipeline(ui.state?.pipeline || []);
  $('#pipeline-search').focus();
});
$$('[data-pipeline-status]').forEach(button => button.addEventListener('click', () => {
  $('#pipeline-filter').value = button.dataset.pipelineStatus;
  $('#pipeline-search').value = '';
  switchView('pipeline');
}));
$('#retry-dashboard').addEventListener('click', () => refreshDashboard());
window.addEventListener('hashchange', () => {
  const view = location.hash.slice(1);
  if ($$('.nav-item').some(item => item.dataset.view === view) && view !== ui.currentView) switchView(view);
});
document.addEventListener('error', event => {
  if (event.target.matches?.('img.review-thumb')) event.target.classList.add('thumbnail-unavailable');
}, true);

$('#experiment-create-form').addEventListener('submit', async event => {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(event.currentTarget));
  await mutate('/api/experiments', 'POST', {
    productionId: values.productionId,
    armDurationHours: Number(values.armDurationHours),
    minImpressions: Number(values.minImpressions)
  }, i18n.t('Draft growth experiment created for review.')).catch(() => {});
});

$('#run-readiness-button').addEventListener('click', async event => {
  const button = event.currentTarget;
  button.disabled = true;
  button.textContent = i18n.t('Running live checks…');
  try {
    await mutate('/api/readiness/run', 'POST', {
      includePaidMedia: $('#paid-image-probe').checked,
      includePaidVideo: $('#paid-video-probe').checked
    }, i18n.t('Production readiness check completed.'));
    switchView('readiness');
  } catch (_error) { /* toast already shown */ }
  finally {
    button.disabled = false;
    button.textContent = i18n.t('Run verified check');
  }
});

$('#automation-toggle').addEventListener('click', async () => {
  const action = ui.state?.system.automationPaused ? 'resume' : 'pause';
  await mutate(`/api/automation/${action}`, 'POST', {}, i18n.msg`Automation ${action}d.`).catch(() => {});
});

function strategyFormData(status = ui.state?.channelStrategy?.status || 'draft') {
  const form = $('#strategy-form');
  const values = Object.fromEntries(new FormData(form));
  return {
    ...values,
    contentPillars: values.contentPillars.split(',').map(value => value.trim()).filter(Boolean),
    cadencePerWeek: Number(values.cadencePerWeek),
    videosPerRun: Number(values.videosPerRun),
    targetValue: values.targetValue === '' ? null : Number(values.targetValue),
    targetWindowDays: Number(values.targetWindowDays),
    monthlyBudget: values.monthlyBudget === '' ? null : Number(values.monthlyBudget),
    status
  };
}

$('#strategy-form').addEventListener('submit', async event => {
  event.preventDefault();
  await mutate('/api/operator/strategy', 'PUT', strategyFormData(), i18n.t('Channel strategy saved.')).catch(() => {});
});

$('#activate-operator-button').addEventListener('click', async () => {
  if (!$('#strategy-form').reportValidity()) return;
  await mutate('/api/operator/start', 'POST', strategyFormData('active'), i18n.t('Autonomous operator started.')).catch(() => {});
});

$('#pause-operator-button').addEventListener('click', async () => {
  await mutate('/api/operator/pause', 'POST', {}, i18n.t('Autonomous operator paused.')).catch(() => {});
});

$('#cancel-operator-run').addEventListener('click', async event => {
  const runId = event.currentTarget.dataset.runId;
  if (runId && confirm(i18n.t('Stop this autonomous run after the current agent stage?'))) {
    await mutate(`/api/operator/runs/${encodeURIComponent(runId)}/cancel`, 'POST', {}, i18n.t('Operator stop requested.')).catch(() => {});
  }
});

$('#resume-operator-run').addEventListener('click', async event => {
  const runId = event.currentTarget.dataset.runId;
  if (runId && confirm(i18n.t('Resume this operator run from its saved editorial plan and generation checkpoints?'))) {
    await mutate(`/api/operator/runs/${encodeURIComponent(runId)}/resume`, 'POST', {}, i18n.t('Autonomous operator resumed.')).catch(() => {});
  }
});

$('#generate-form').addEventListener('submit', async event => {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(event.currentTarget));
  try {
    await mutate('/generate', 'POST', { ...values, topic: values.topic.trim() || null }, i18n.t('Generation job started.'));
    $('#generate-dialog').close();
    event.currentTarget.reset();
  } catch (_error) { /* toast already shown */ }
});

$('#idea-form').addEventListener('submit', async event => {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(event.currentTarget));
  try {
    await mutate('/api/ideas', 'POST', values, i18n.t('Idea added to the backlog.'));
    $('#idea-dialog').close();
    event.currentTarget.reset();
  } catch (_error) { /* toast already shown */ }
});

$('#profile-form').addEventListener('submit', async event => {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(event.currentTarget));
  values.bannedTopics = values.bannedTopics.split(',').map(value => value.trim()).filter(Boolean);
  try {
    await mutate('/api/profile', 'PUT', values, i18n.t('Channel setup saved.'));
    await mutate('/api/settings', 'PUT', {
      approval_required: $('#approval-required').checked,
      notification_enabled: $('#notifications-enabled').checked,
      channel_timezone: values.timezone,
      video_provider: values.videoProvider,
      video_generation_mode: values.videoGenerationMode,
      video_clip_duration: Number(values.videoClipDuration),
      video_max_generated_seconds: Number(values.videoMaxGeneratedSeconds),
      video_extras: leeExtras()
    }, i18n.t('Operator settings saved.'));
  } catch (_error) { /* toast already shown */ }
});

$('#api-key-button').addEventListener('click', () => {
  if (requestApiKey() !== null) showToast(i18n.t('Dashboard API key saved in this browser.'));
});

const initialView = location.hash.slice(1);
if (['overview', 'research', 'shorts', 'clipping', 'operator', 'pipeline', 'calendar', 'analytics', 'engagement', 'readiness', 'accounts', 'settings', 'docs', 'redes'].includes(initialView)) switchView(initialView);
refreshDashboard();
setInterval(() => {
  if (!document.hidden) refreshDashboard(true);
}, 30000);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) refreshDashboard(true);
});
