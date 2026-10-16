require('dotenv').config();
require('./utils/fuentes-sistema').instalaFuentes();

const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const { Logger } = require('./utils/logger');
const { Database } = require('./database/db');
const { CredentialManager } = require('./utils/credential-manager');
const { ContentStrategyAgent } = require('./agents/content-strategy-agent');
const { ScriptWriterAgent } = require('./agents/script-writer-agent');
const { ThumbnailDesignerAgent } = require('./agents/thumbnail-designer-agent');
const { SEOOptimizerAgent } = require('./agents/seo-optimizer-agent');
const { ProductionManagementAgent } = require('./agents/production-management-agent');
const { PublishingSchedulingAgent } = require('./agents/publishing-scheduling-agent');
const { AnalyticsOptimizationAgent } = require('./agents/analytics-optimization-agent');
const { DailyAutomation } = require('./schedules/daily-automation');
const { OperatorService } = require('./utils/operator-service');
const { AutonomousChannelOperator } = require('./utils/autonomous-channel-operator');
const { ActivationMetrics } = require('./utils/activation-metrics');
const { AnonymousTelemetry } = require('./utils/anonymous-telemetry');
const { ProductionReadinessService } = require('./utils/production-readiness-service');
const { GenerationRecoveryService, GENERATION_STAGES } = require('./utils/generation-recovery-service');
const { ProvenanceService } = require('./utils/provenance-service');
const { SceneRepairService } = require('./utils/scene-repair-service');
const { normalizaFormato, SHORT, SHORT_LENGTH } = require('./utils/formato');
const { validaHoras } = require('./utils/daily-slot');
const { ShortsRepurposingService } = require('./utils/shorts-repurposing-service');
const { AudienceEngagementService } = require('./utils/audience-engagement-service');
const { GrowthExperimentService } = require('./utils/growth-experiment-service');
const { AITextService } = require('./utils/ai-text-service');
const { DiscoverabilityService } = require('./utils/discoverability-service');
const { ResearchInboxClient } = require('./utils/research-inbox-client');
const { NicheEngineClient } = require('./utils/niche-engine-client');
const { StockMediaService } = require('./utils/stock-media-service');
const { ShortsStudioService } = require('./utils/shorts-studio-service');
const { OutliersService } = require('./utils/outliers-service');
const { AccountsService } = require('./utils/accounts-service');
const { version } = require('./package.json');
const chalk = require('chalk');

class YouTubeAutomationAgent {
  constructor() {
    this.logger = new Logger('MainAgent');
    this.db = null;
    this.credentials = null;
    this.agents = {};
    this.app = express();
    this.isInitialized = false;
    this.activeJobs = new Map();
    this.operator = null;
    this.autonomous = null;
    this.activation = null;
    this.telemetry = null;
    this.readiness = null;
    this.recovery = null;
    this.provenance = null;
    this.scenes = null;
    this.shorts = null;
    this.engagement = null;
    this.experiments = null;
    this.discoverability = null;
    this.researchInbox = new ResearchInboxClient();
    this.nicheEngine = new NicheEngineClient();
    this.stockMedia = new StockMediaService({ logger: this.logger });
    // Verse Shorts and clipping: a Python project mounted separately (SHORTS_DIR).
    this.shortsStudio = new ShortsStudioService({
      root: process.env.SHORTS_DIR || path.join(__dirname, '..', 'shorts-versiculos'),
      python: process.env.SHORTS_PYTHON || 'python3',
      logger: this.logger
    });
    // Outliers tab: videos that break their channel's average (public YouTube API).
    this.outliers = new OutliersService({ logger: this.logger });
    this.setupRequired = false;
  }

  async initialize() {
    try {
      console.log(chalk.cyan.bold(`\n🎬 Oraflow v${version}`));
      console.log(chalk.gray('─'.repeat(50)));
      
      // Initialize database
      this.logger.info('Initializing database...');
      this.db = new Database();
      await this.db.initialize();
      await require('./utils/textos-canal').carga(this.db).catch(() => {}); // editable panel texts
      await this.db.markInterruptedJobs();
      this.recovery = new GenerationRecoveryService(this.db, {
        logger: this.logger,
        updateJobStage: (...args) => this.updateJobStage(...args)
      });
      this.operator = new OperatorService(this.db);
      this.provenance = new ProvenanceService(this.db);
      this.discoverability = new DiscoverabilityService(this.db, { logger: this.logger });
      this.autonomous = new AutonomousChannelOperator(this.db, {
        researchAndPlan: strategy => {
          if (!this.agents.strategy) throw new Error('The strategy agent is not configured');
          return this.agents.strategy.researchAndPlanChannel(strategy);
        },
        startGenerationJob: input => this.startGenerationJob(input),
        resumeGenerationJob: (jobId, options) => this.resumeGenerationJob(jobId, options),
        waitForGenerationJob: jobId => this.waitForGenerationJob(jobId),
        notify: notification => this.operator.notify(notification)
      });
      this.activation = new ActivationMetrics(this.db);
      this.telemetry = new AnonymousTelemetry(this.db, this.logger);
      
      // Load credentials
      this.logger.info('Loading credentials...');
      this.credentials = new CredentialManager();
      const credentialsValid = await this.credentials.validateAll();
      this.readiness = new ProductionReadinessService(this.db, this.credentials);
      
      if (!credentialsValid) {
        console.log(chalk.yellow('\n⚠️  Some credentials are missing or invalid.'));
        console.log(chalk.yellow('Run: npm run credentials:setup'));
        this.setupRequired = true;
        this.setupAPI();
        this.isInitialized = true;
        this.logger.warn('Dashboard started in setup mode; generation and publishing are disabled');
        return true;
      }
      
      // Initialize agents
      this.logger.info('Initializing agents...');
      await this.initializeAgents();
      this.scenes = this.agents.production?.sceneRepair || new SceneRepairService(
        this.db,
        this.agents.production?.aiVideoGenerator,
        { logger: this.logger }
      );
      this.shorts = new ShortsRepurposingService(this.db, this.agents.publishing, { logger: this.logger });
      this.engagement = new AudienceEngagementService(
        this.db,
        this.credentials,
        new AITextService(this.credentials?.credentials || {}),
        { logger: this.logger }
      );
      this.experiments = new GrowthExperimentService(
        this.db,
        this.agents.analytics,
        this.agents.publishing,
        { logger: this.logger }
      );

      // Show which pipeline stages will run for real vs. be simulated
      const capabilities = await this.logCapabilitySummary();
      if (capabilities.hasText && capabilities.hasFFmpeg && capabilities.hasUpload) {
        await this.activation.markSetupReady(capabilities);
      }
      
      // Setup API endpoints
      this.setupAPI();
      
      // Initialize scheduler
      this.logger.info('Setting up automation scheduler...');
      this.scheduler = new DailyAutomation(this.agents, this.db, {
        generateContent: input => this.queueScheduledContent(input),
        engagement: this.engagement,
        experiments: this.experiments
      });
      await this.scheduler.initialize();

      if (await this.db.getSetting('automation_paused') === 'true') {
        await this.scheduler.pauseAutomation();
      }
      
      this.isInitialized = true;
      this.logger.success('Oraflow initialized successfully!');
      
      return true;
    } catch (error) {
      this.logger.error('Failed to initialize:', error);
      return false;
    }
  }

  async initializeAgents() {
    this.agents = {
      strategy: new ContentStrategyAgent(this.db, this.credentials),
      scriptWriter: new ScriptWriterAgent(this.db, this.credentials),
      thumbnailDesigner: new ThumbnailDesignerAgent(this.db, this.credentials),
      seoOptimizer: new SEOOptimizerAgent(this.db, this.credentials),
      production: new ProductionManagementAgent(this.db, this.credentials),
      publishing: new PublishingSchedulingAgent(this.db, this.credentials),
      analytics: new AnalyticsOptimizationAgent(this.db, this.credentials)
    };

    // Initialize each agent
    for (const [name, agent] of Object.entries(this.agents)) {
      await agent.initialize();
      this.logger.info(`✓ ${name} agent initialized`);
    }
  }

  async logCapabilitySummary() {
    const { checkFFmpeg, ffmpegInstallHint } = require('./utils/ffmpeg');
    const creds = this.credentials.credentials || {};

    const hasText = this.credentials.hasAITextProvider();
    const hasGemini = Boolean(creds.gemini?.apiKey || process.env.GEMINI_API_KEY);
    const hasImages = Boolean(creds.openai?.apiKey || process.env.OPENAI_API_KEY || hasGemini);
    const hasTTS = Boolean(
      creds.openai?.apiKey || process.env.OPENAI_API_KEY ||
      creds.elevenLabs?.apiKey || process.env.ELEVENLABS_API_KEY ||
      creds.azureSpeech?.subscriptionKey || process.env.AZURE_SPEECH_KEY ||
      hasGemini
    );
    const hasFFmpeg = await checkFFmpeg();
    const hasUpload = Boolean(creds.youtube && this.credentials.tokens?.youtube);

    const capabilities = [
      { name: 'Script & strategy generation', ok: hasText, hint: 'configure an AI provider (npm run credentials:setup)' },
      { name: 'Image generation (visuals/thumbnails)', ok: hasImages, hint: 'requires an OpenAI or Gemini API key — otherwise gradient slides are used' },
      { name: 'Voice narration (TTS)', ok: hasTTS, hint: 'configure OpenAI, Gemini, ElevenLabs, or Azure Speech — otherwise videos are silent' },
      { name: 'Video assembly (FFmpeg)', ok: hasFFmpeg, hint: ffmpegInstallHint() },
      { name: 'YouTube upload', ok: hasUpload, hint: 'run: npm run credentials:setup' }
    ];

    console.log(chalk.cyan('\n🔎 Capability check:'));
    for (const cap of capabilities) {
      if (cap.ok) {
        console.log(chalk.green(`  ✓ ${cap.name}`));
      } else {
        console.log(chalk.yellow(`  ✗ ${cap.name} — ${cap.hint}`));
      }
    }

    if (!hasFFmpeg) {
      this.logger.warn('FFmpeg is missing: no .mp4 files can be produced until it is installed.');
    }
    console.log('');
    return { hasText, hasImages, hasTTS, hasFFmpeg, hasUpload };
  }

  requireAPIKey() {
    return (req, res, next) => {
      if (!process.env.API_KEY) {
        return next();
      }

      if (req.get('x-api-key') !== process.env.API_KEY) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
      }

      return next();
    };
  }

  validateGenerateRequestBody(body = {}) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return { valid: false, status: 400, error: 'Request body must be a JSON object' };
    }

    const value = {
      topic: null,
      style: null,
      length: typeof body.length === 'string' ? body.length.toLowerCase() : 'medium',
      strategyContext: null
    };

    // JSON has no `undefined`, so clients send `null` to mean "no value provided".
    // Both are treated as "not set" here: topic/style are optional and default to
    // auto-selection, which is exactly what `null` already represents internally.
    if (body.topic !== undefined && body.topic !== null) {
      if (typeof body.topic !== 'string') {
        return { valid: false, status: 400, error: 'topic must be a string' };
      }

      const topic = body.topic.trim();
      if (topic.length > 200) {
        return { valid: false, status: 400, error: 'topic must be 200 characters or less' };
      }
      value.topic = topic || null;
    }

    if (body.style !== undefined && body.style !== null) {
      if (typeof body.style !== 'string') {
        return { valid: false, status: 400, error: 'style must be a string' };
      }

      const allowedStyles = new Set([
        'tutorial',
        'explainer',
        'list',
        'review',
        'story',
        'educational',
        'informative',
        'engaging',
        'professional',
        'ethereal'
      ]);
      const style = body.style.trim();

      if (style.length > 50) {
        return { valid: false, status: 400, error: 'style must be 50 characters or less' };
      }

      value.style = allowedStyles.has(style.toLowerCase()) ? style.toLowerCase() : style || null;
    }

    if (!['short', 'medium', 'long'].includes(value.length)) {
      return { valid: false, status: 400, error: 'length must be short, medium, or long' };
    }

    if (body.strategyContext !== undefined && body.strategyContext !== null) {
      if (typeof body.strategyContext !== 'object' || Array.isArray(body.strategyContext)) {
        return { valid: false, status: 400, error: 'strategyContext must be an object' };
      }
      const limits = { angle: 500, rationale: 1000, audience: 500, objective: 1000, valueProposition: 1000, constraints: 2000, pillar: 100 };
      value.strategyContext = {};
      for (const [key, max] of Object.entries(limits)) {
        if (body.strategyContext[key] === undefined || body.strategyContext[key] === null) continue;
        if (typeof body.strategyContext[key] !== 'string' || body.strategyContext[key].length > max) {
          return { valid: false, status: 400, error: `strategyContext.${key} must be a string of ${max} characters or less` };
        }
        value.strategyContext[key] = body.strategyContext[key].trim();
      }
      // Format and daily slot (set by the scheduler; also usable by hand).
      const { format, franja, publishSlot } = body.strategyContext;
      if (format !== undefined && format !== null) {
        if (!['short', 'long'].includes(format)) return { valid: false, status: 400, error: 'strategyContext.format must be short or long' };
        value.strategyContext.format = format;
      }
      if (franja !== undefined && franja !== null) {
        if (!['MAÑANA', 'TARDE', 'NOCHE'].includes(franja)) return { valid: false, status: 400, error: 'strategyContext.franja must be MAÑANA, TARDE or NOCHE' };
        value.strategyContext.franja = franja;
      }
      if (publishSlot !== undefined && publishSlot !== null) {
        if (typeof publishSlot !== 'string' || Number.isNaN(Date.parse(publishSlot))) return { valid: false, status: 400, error: 'strategyContext.publishSlot must be an ISO date' };
        value.strategyContext.publishSlot = new Date(publishSlot).toISOString();
      }
    }

    return { valid: true, value };
  }

  validateChannelStrategy(body = {}, current = {}) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new Error('Channel strategy must be a JSON object');
    }
    const text = (key, fallback, max) => {
      const value = String(body[key] ?? fallback ?? '').trim();
      if (value.length > max) throw new Error(`${key} must be ${max} characters or less`);
      return value;
    };
    const objective = text('objective', current.objective, 1000);
    const audience = text('audience', current.audience, 500);
    if (!objective) throw new Error('A channel objective is required');
    if (!audience) throw new Error('A target audience is required');

    const rawPillars = body.contentPillars ?? current.contentPillars ?? [];
    if (!Array.isArray(rawPillars)) throw new Error('contentPillars must be an array');
    const contentPillars = rawPillars.map(value => String(value).trim()).filter(Boolean);
    if (!contentPillars.length || contentPillars.length > 8 || contentPillars.some(value => value.length > 100)) {
      throw new Error('Provide 1 to 8 content pillars, each 100 characters or less');
    }

    const integer = (key, fallback, min, max) => {
      const value = Number(body[key] ?? fallback);
      if (!Number.isInteger(value) || value < min || value > max) {
        throw new Error(`${key} must be an integer from ${min} to ${max}`);
      }
      return value;
    };
    const defaultFormat = text('defaultFormat', current.default_format || 'explainer', 20).toLowerCase();
    const defaultLength = text('defaultLength', current.default_length || 'medium', 20).toLowerCase();
    const status = text('status', current.status || 'draft', 20).toLowerCase();
    const primaryKpi = text('primaryKpi', current.primary_kpi || 'views', 30).toLowerCase();
    const outcomeCurrency = text('outcomeCurrency', current.outcome_currency || 'USD', 3).toUpperCase();
    if (!['explainer', 'tutorial', 'list', 'review', 'story'].includes(defaultFormat)) {
      throw new Error('defaultFormat is not supported');
    }
    if (!['short', 'medium', 'long'].includes(defaultLength)) throw new Error('defaultLength is not supported');
    if (!['draft', 'active', 'paused'].includes(status)) throw new Error('status must be draft, active, or paused');
    if (!['views', 'watch_hours', 'subscribers', 'engagement', 'revenue'].includes(primaryKpi)) {
      throw new Error('primaryKpi is not supported');
    }
    if (!/^[A-Z]{3}$/.test(outcomeCurrency)) throw new Error('outcomeCurrency must be a three-letter currency code');
    const optionalNumber = (key, fallback, min, max) => {
      const raw = body[key] ?? fallback;
      if (raw === undefined || raw === null || raw === '') return null;
      const value = Number(raw);
      if (!Number.isFinite(value) || value < min || value > max) {
        throw new Error(`${key} must be a number from ${min} to ${max}`);
      }
      return value;
    };

    return {
      objective,
      audience,
      valueProposition: text('valueProposition', current.value_proposition, 1000),
      contentPillars,
      cadencePerWeek: integer('cadencePerWeek', current.cadence_per_week || 1, 1, 7),
      videosPerRun: integer('videosPerRun', current.videos_per_run || 1, 1, 5),
      defaultFormat,
      defaultLength,
      successMetric: text('successMetric', current.success_metric, 300),
      primaryKpi,
      targetValue: optionalNumber('targetValue', current.target_value, 0.01, 1000000000),
      targetWindowDays: integer('targetWindowDays', current.target_window_days || 28, 7, 365),
      monthlyBudget: optionalNumber('monthlyBudget', current.monthly_budget, 0, 10000000),
      outcomeCurrency,
      constraints: text('constraints', current.constraints, 2000),
      status
    };
  }
  setupAPI() {
    this.app.use(require('./utils/dashboard-safety').dashboardBoundary);
    // The WhatsApp webhook signs the EXACT body: it's kept raw only for that route.
    this.app.use(express.json({ limit: '1mb', verify: (req, _res, buf) => { if (req.url.startsWith('/webhooks/')) req.rawBody = buf; } }));
    this.app.use(express.static(path.join(__dirname, 'dashboard')));

    if (!process.env.API_KEY) {
      this.logger.warn('API_KEY is not set; mutating API routes are unprotected');
    }
    
    // Main dashboard route
    this.app.get('/', (req, res) => {
      res.sendFile(path.join(__dirname, 'dashboard', 'index.html'));
    });
    
    // Fixed link for the bio and stories (05/10/2026): it always opens the most recent long
    // video that's already public. Public, no login (OAUTH2_PROXY_SKIP_AUTH_ROUTES).
    this.app.get('/hoy', async (req, res) => {
      try {
        const desde = new Date(Date.now() - 7 * 86400000).toISOString();
        const ahora = Date.now();
        const largos = ((await this.db.getRecentPublishedForSocial(desde)) || [])
          .filter(e => e.metadata?.contentFormat === 'long' && e.youtubeUrl && Date.parse(e.publishTime) <= ahora);
        const destino = largos.length ? largos[largos.length - 1].youtubeUrl : (process.env.YOUTUBE_CHANNEL_URL || 'https://www.youtube.com/');
        await require('./utils/contador').cuenta(this.db, 'hoy', { userAgent: req.get('user-agent') }).catch(() => {});
        res.set('Cache-Control', 'no-store');
        return res.redirect(302, destino);
      } catch (_error) {
        return res.redirect(302, process.env.YOUTUBE_CHANNEL_URL || 'https://www.youtube.com/');
      }
    });

    // The ebook sales page (utils/pagina-libro.js). Public: SKIP_AUTH_ROUTES in compose.
    const FUENTES_LIBRO = ['CormorantGaramond-VF.ttf', 'CormorantGaramond-Italic-VF.ttf', 'Jost-VF.ttf'];
    this.app.get('/libro', async (req, res) => {
      try {
        const { paginaLibro, datosPagina } = require('./utils/pagina-libro');
        await require('./utils/contador').cuenta(this.db, 'libro_visita', { userAgent: req.get('user-agent') }).catch(() => {});
        res.set('Cache-Control', 'no-store');
        return res.type('html').send(paginaLibro(await datosPagina({ db: this.db, dataDir: path.join(__dirname, 'data') })));
      } catch (_error) {
        return res.status(500).send('Página no disponible');
      }
    });
    // «Buy» button: counts the click and goes to the Hotmart checkout.
    this.app.get('/libro/comprar', async (req, res) => {
      const url = String(await this.db.getSetting('ebook_checkout_url') || '').trim();
      if (!/^https:\/\//.test(url)) return res.redirect(302, '/libro');
      await require('./utils/contador').cuenta(this.db, 'libro_comprar', { userAgent: req.get('user-agent') }).catch(() => {});
      res.set('Cache-Control', 'no-store');
      return res.redirect(302, url);
    });
    this.app.get('/libro/portada.jpg', (req, res) => res.sendFile(path.join(__dirname, 'data', 'ebook', 'portada.jpg'), err => { if (err && !res.headersSent) res.status(404).end(); }));
    this.app.get('/libro/f/:fuente', (req, res) => {
      if (!FUENTES_LIBRO.includes(req.params.fuente)) return res.status(404).end();
      res.set('Cache-Control', 'public, max-age=604800');
      return res.sendFile(path.join(__dirname, 'assets', 'fonts', req.params.fuente));
    });

    // Privacy and data deletion (utils/pagina-legal.js): Meta requires them for live mode.
    this.app.get('/privacidad', (req, res) => res.type('html').send(require('./utils/pagina-legal').privacidad()));
    this.app.get('/eliminar-datos', (req, res) => res.type('html').send(require('./utils/pagina-legal').eliminar()));

    // Links page for the bio (utils/pagina-enlaces.js), with no ads. Public.
    this.app.get('/enlaces', (req, res) => {
      res.set('Cache-Control', 'no-store');
      return res.type('html').send(require('./utils/pagina-enlaces').paginaEnlaces());
    });
    this.app.get('/enlaces/ir/:id', async (req, res) => {
      const enlaces = require('./utils/pagina-enlaces');
      const url = enlaces.destino(req.params.id);
      if (!url) return res.redirect(302, '/enlaces');
      await enlaces.cuentaClic(this.db, req.params.id).catch(() => {});
      await require('./utils/contador').cuenta(this.db, `enlace_${req.params.id}`, { userAgent: req.get('user-agent') }).catch(() => {});
      res.set('Cache-Control', 'no-store');
      return res.redirect(302, url);
    });

    // Today's story, to upload to Instagram with the hidden link (utils/historia-diaria.js).
    // Behind the Google login (oauth2-proxy): it's not in SKIP_AUTH_ROUTES.
    const dirHistorias = path.join(__dirname, 'data', 'historias');
    this.app.get('/historia/hoy.:ext(jpg)', (req, res) => {
      res.set('Cache-Control', 'no-store');
      return res.sendFile(path.join(dirHistorias, `hoy.${req.params.ext}`), err => { if (err && !res.headersSent) res.status(404).end(); });
    });
    this.app.get('/historia', async (req, res) => {
      let info = null;
      try { info = JSON.parse(await fs.readFile(path.join(dirHistorias, 'hoy.json'), 'utf8')); } catch (_e) { info = null; }
      const esc = t => String(t || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
      res.set('Cache-Control', 'no-store');
      res.type('html').send(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Historia de hoy</title><style>
body{margin:0;background:#141010;color:#f4ece0;font:16px -apple-system,system-ui,sans-serif;padding:16px;max-width:480px;margin:auto}
h1{font-size:22px;margin:8px 0 4px}p{color:#bfb3a3;margin:4px 0 14px;line-height:1.4}
video{width:100%;border-radius:14px;background:#000}
button,a.b{display:block;width:100%;box-sizing:border-box;margin:12px 0;padding:16px;border:0;border-radius:12px;font-size:18px;font-weight:600;text-align:center;text-decoration:none}
.p{background:#f4ece0;color:#1d1611}.s{background:#2a221c;color:#f4ece0}
ol{color:#bfb3a3;padding-left:20px;line-height:1.6}#ok{color:#9fd49f;min-height:20px}
</style></head><body>
<h1>Historia de hoy</h1>
${info ? `<p>${esc(info.titulo)}</p>
<img src="/historia/hoy.jpg" alt="Historia de hoy" style="width:100%;border-radius:14px">
<button class="p" id="compartir">1 · Copiar enlace y abrir Instagram</button>
<button class="s" id="copiar">Solo copiar enlace</button>
<a class="b s" href="/historia/hoy.jpg" download="oracion-de-hoy.jpg">Descargar imagen</a>
<div id="ok"></div>
<ol><li>Toca el botón 1 y elige <b>Instagram → Historia</b> (o «Guardar imagen»).</li>
<li>Sticker 🔗 <b>Enlace</b> → pega (ya está copiado).</li>
<li>Pon el sticker detrás de «VER ORACIÓN COMPLETA» y compártela.</li></ol>
<script>
const enlace = ${JSON.stringify(info.enlace)}; const ok = document.getElementById('ok');
document.getElementById('copiar').onclick = () => navigator.clipboard.writeText(enlace).then(() => ok.textContent = 'Enlace copiado ✓');
// The image is downloaded when the page opens: iPhone only allows sharing if it happens in the
// same tap.
let file = null;
fetch('/historia/hoy.jpg').then(r => r.blob()).then(b => { file = new File([b], 'oracion-de-hoy.jpg', { type: 'image/jpeg' }); });
document.getElementById('compartir').onclick = () => {
  navigator.clipboard.writeText(enlace).catch(() => {});
  if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
    navigator.share({ files: [file] }).then(() => { ok.textContent = 'Enlace copiado ✓'; })
      .catch(e => { if (e.name !== 'AbortError') ok.textContent = 'No se pudo compartir: ' + e.message; });
  } else { location.href = '/historia/hoy.jpg'; }
};
</script>` : '<p>Todavía no hay historia: sale cuando el vídeo largo del día ya es público en YouTube.</p>'}
</body></html>`);
    });

    // Covers to set by hand on IG/FB/YouTube (utils/portadas-panel.js). With login.
    const portadas = require('./utils/portadas-panel');
    this.app.get('/portadas/img/:id.jpg', async (req, res) => {
      try {
        const item = (await portadas.listaPortadas(this.db, 60)).find(it => it.id === req.params.id);
        const variante = /^[BC]$/.test(String(req.query.v || '')) ? item?.variantes?.find(v => v.letra === req.query.v) : null;
        const ruta = portadas.rutaSegura(variante ? variante.path : item?.imagen);
        if (!ruta) return res.status(404).end();
        res.set('Cache-Control', 'private, max-age=300');
        return res.sendFile(ruta, err => { if (err && !res.headersSent) res.status(404).end(); });
      } catch (_e) { return res.status(500).end(); }
    });
    this.app.get('/portadas', async (req, res) => {
      try {
        res.set('Cache-Control', 'no-store');
        res.type('html').send(portadas.paginaPortadas(await portadas.listaPortadas(this.db)));
      } catch (e) { this.logger?.warn?.(`/portadas: ${e.message}`); res.status(500).send('No se pudieron cargar las portadas'); }
    });

    // Health check
    this.app.get('/health', (req, res) => {
      res.json({
        status: this.setupRequired ? 'setup_required' : 'healthy',
        initialized: this.isInitialized,
        setupRequired: this.setupRequired,
        agents: Object.keys(this.agents),
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
      });
    });

    // Manual content generation
    this.app.post('/generate', this.requireAPIKey(), async (req, res) => {
      try {
        if (this.setupRequired) {
          return res.status(503).json({ success: false, error: 'Finish setup with npm run walkthrough before generating content' });
        }
        const validation = this.validateGenerateRequestBody(req.body);
        if (!validation.valid) {
          return res.status(validation.status).json({ success: false, error: validation.error });
        }

        const { topic, style, length, strategyContext } = validation.value;
        const result = await this.startGenerationJob({ topic, style, length, strategyContext, source: 'manual' });
        res.status(202).json({ success: true, result });
      } catch (error) {
        res.status(error.status || 500).json({ success: false, error: error.message });
      }
    });

    // Get analytics
    this.app.get('/analytics', async (req, res) => {
      try {
        if (!this.agents.analytics) return res.json({ totalVideos: 0, averagePerformanceScore: 0, topPerformers: [], insights: [], learning: null });
        const analytics = await this.agents.analytics.getRecentAnalytics();
        const learning = await this.agents.analytics.getLearningSummary();
        res.json({ ...analytics, learning });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/outcomes', async (_req, res) => {
      try {
        const learning = this.agents.analytics?.getLearningSummary
          ? await this.agents.analytics.getLearningSummary()
          : { outcome: null };
        return res.json({ success: true, result: learning.outcome || null });
      } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get upcoming schedule
    this.app.get('/schedule', async (req, res) => {
      try {
        const schedule = await this.db.getUpcomingSchedule();
        res.json(schedule);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Manual publish
    this.app.post('/publish/:contentId', this.requireAPIKey(), async (req, res) => {
      try {
        if (!this.agents.publishing) return res.status(503).json({ success: false, error: 'YouTube publishing is not configured' });
        const { contentId } = req.params;
        const bundle = await this.db.getProductionBundle(contentId);
        const short = bundle ? null : await this.db.getShortClip(contentId);
        if ((!bundle || bundle.review_status !== 'approved') && (!short || !['scheduled', 'uploading', 'reconciliation_required'].includes(short.status))) {
          return res.status(409).json({ success: false, error: 'Content must pass review and be approved before publishing' });
        }
        const result = await this.agents.publishing.publishContent(contentId);
        res.json({ success: true, result });
      } catch (error) {
        res.status(error.status || 500).json({ success: false, error: error.message });
      }
    });

    this.setupOperatorAPI();
  }

  setupAccountsAPI(protect) {
    // Created on use: this.credentials is initialized after the constructor.
    const cuentas = () => {
      if (!this.accounts) this.accounts = new AccountsService({ credentials: this.credentials, logger: this.logger });
      return this.accounts;
    };
    const responder = (res, error) => res.status(error.status || 500)
      .json({ success: false, error: error.status ? error.message : 'No se pudo completar' });

    this.app.get('/api/accounts', async (_req, res) => {
      try { return res.json({ success: true, result: await cuentas().status() }); } catch (error) { return responder(res, error); }
    });
    // Testing spends each service's quota: it goes through the API key like the other actions.
    this.app.post('/api/accounts/:id/test', protect, async (req, res) => {
      try { return res.json({ success: true, result: await cuentas().test(req.params.id) }); } catch (error) { return responder(res, error); }
    });
    this.app.put('/api/accounts/youtube/client', protect, async (req, res) => {
      try { return res.json({ success: true, result: await cuentas().saveYouTubeClient(req.body || {}) }); } catch (error) { return responder(res, error); }
    });
    // Browser navigation (it can't carry headers): protected by the proxy's Google login and the
    // OAuth flow's single-use "state".
    this.app.get('/api/accounts/youtube/connect', (_req, res) => {
      try { return res.redirect(cuentas().connectUrl()); } catch (error) {
        return res.redirect(`/?cuentas=${encodeURIComponent(error.message)}#accounts`);
      }
    });
    this.app.get('/api/accounts/youtube/callback', async (req, res) => {
      try {
        await cuentas().finishConnect(req.query || {});
        return res.redirect('/?cuentas=ok#accounts');
      } catch (error) {
        const msg = error.status ? error.message : 'Google rechazó el intercambio del código. Revisa el cliente OAuth.';
        return res.redirect(`/?cuentas=${encodeURIComponent(msg)}#accounts`);
      }
    });
  }

  // GET but protected: every search spends YouTube API quota.
  setupOutliersAPI(protect) {
    this.app.get('/api/outliers', protect, async (req, res) => {
      try {
        return res.json({ success: true, result: await this.outliers.search(req.query) });
      } catch (error) {
        return res.status(error.status || 500).json({ success: false, error: error.status ? error.message : 'Outliers no disponible' });
      }
    });
  }

  setupShortsAPI(protect) {
    const studio = this.shortsStudio;
    const responder = (res, error) => res.status(error.status || 500)
      .json({ success: false, error: error.status ? error.message : 'Shorts no disponible' });

    this.app.get('/api/shorts', async (_req, res) => {
      try { return res.json({ success: true, result: await studio.state() }); } catch (error) { return responder(res, error); }
    });
    this.app.get('/api/shorts/job', (_req, res) => res.json({ success: true, result: studio.job() }));
    this.app.put('/api/shorts/lote', protect, async (req, res) => {
      try { return res.json({ success: true, result: await studio.saveLote(req.body?.lote) }); } catch (error) { return responder(res, error); }
    });
    // Streaming upload (not in memory): a clipping video can weigh hundreds of MB.
    this.app.put('/api/shorts/files/:area', protect, async (req, res) => {
      try {
        const nombre = decodeURIComponent(req.get('x-file-name') || '');
        if (!req.get('x-rights-confirmed')) return res.status(400).json({ success: false, error: 'Confirma que tienes permiso para usar este archivo' });
        return res.json({ success: true, result: await studio.saveUpload(req.params.area, nombre, req) });
      } catch (error) { return responder(res, error); }
    });
    this.app.put('/api/shorts/attribution', protect, async (req, res) => {
      try { return res.json({ success: true, result: await studio.saveAttribution(req.body?.name, req.body?.text) }); } catch (error) { return responder(res, error); }
    });
    this.app.delete('/api/shorts/files/:area/:name', protect, async (req, res) => {
      try { return res.json({ success: true, result: await studio.remove(req.params.area, req.params.name) }); } catch (error) { return responder(res, error); }
    });
    this.app.get('/api/shorts/media/:area/:name', async (req, res) => {
      try {
        const full = await studio.mediaPath(req.params.area, req.params.name);
        if (req.query.download) return res.download(full);
        return res.sendFile(full);
      } catch (error) { return responder(res, error); }
    });
    this.app.post('/api/shorts/run', protect, async (req, res) => {
      try {
        const { kind, ...opciones } = req.body || {};
        return res.status(202).json({ success: true, result: await studio.start(kind, opciones) });
      } catch (error) { return responder(res, error); }
    });
    this.app.post('/api/shorts/cancel', protect, (_req, res) => {
      try { return res.json({ success: true, result: studio.cancel() }); } catch (error) { return responder(res, error); }
    });
  }

  setupOperatorAPI() {
    const protect = this.requireAPIKey();

    this.app.get('/api/stock/status', async (_req, res) => {
      try {
        return res.json({ success: true, result: {
          available: await this.stockMedia.isAvailable(),
          providers: {
            adobe_stock: Boolean(process.env.ADOBE_STOCK_API_KEY),
            pexels: Boolean(process.env.PEXELS_API_KEY),
            local: Boolean(process.env.BACKGROUNDS_DIR)
          }
        } });
      } catch (_error) {
        return res.status(503).json({ success: false, error: 'Stock media is unavailable' });
      }
    });

    // Searches consume provider quota, so use the existing operator API key.
    this.app.get('/api/stock/search', protect, async (req, res) => {
      const rawQueries = req.query.queries ?? req.query.q;
      const queries = Array.isArray(rawQueries) ? rawQueries : [rawQueries];
      const preferredAssetType = req.query.type || 'image';
      const orientation = req.query.orientation || 'landscape';
      const limit = Number(req.query.limit ?? 8);
      const minDurationSec = Number(req.query.minDurationSec ?? 5);
      if (!queries.length || queries.length > 3 || queries.some(query =>
        typeof query !== 'string' || !query.trim() || query.length > 200
      ) || !['image', 'video'].includes(preferredAssetType) ||
        !['landscape', 'portrait', 'square'].includes(orientation) ||
        !Number.isInteger(limit) || limit < 1 || limit > 30 ||
        !Number.isFinite(minDurationSec) || minDurationSec < 0 || minDurationSec > 600) {
        return res.status(400).json({ success: false, error: 'Provide 1–3 queries, a valid type/orientation, limit 1–30, and duration 0–600 seconds' });
      }
      try {
        const assets = await this.stockMedia.search({
          queries: queries.map(query => query.trim()), preferredAssetType, orientation, minDurationSec, limit
        });
        // Raw provider responses may contain signed download credentials.
        const result = assets.map(({ raw: _raw, ...asset }) => asset);
        return res.json({ success: true, result });
      } catch (_error) {
        return res.status(503).json({ success: false, error: 'Stock search is unavailable' });
      }
    });

    this.setupShortsAPI(protect);
    this.setupOutliersAPI(protect);
    this.setupAccountsAPI(protect);

    this.app.get('/api/dashboard', async (_req, res) => {
      try {
        const [stats, jobs, pipeline, schedule, events, notifications, profile, settings, ideas, analytics, learning, activation, channelStrategy, operatorRuns, readiness, engagement, experiments] = await Promise.all([
          this.db.getStats(),
          this.db.listGenerationJobs(20),
          this.db.getPipelineOverview(50),
          this.db.getUpcomingSchedule(30),
          this.db.getRecentAutomationEvents(20),
          this.db.listNotifications(20),
          this.db.getChannelProfile(),
          this.db.getAllSettings().then(require('./utils/dashboard-safety').dashboardSettings),
          this.db.listContentIdeas(),
          this.agents.analytics
            ? this.agents.analytics.getRecentAnalytics(30)
            : Promise.resolve({ totalVideos: 0, averagePerformanceScore: 0, topPerformers: [], insights: [] }),
          this.agents.analytics?.getLearningSummary
            ? this.agents.analytics.getLearningSummary()
            : Promise.resolve({ measuredVideos: 0, snapshotCount: 0, baseline: {}, recommendations: [], approvedCount: 0, pendingCount: 0 }),
          this.activation
            ? this.activation.getSummary()
            : Promise.resolve({ privacy: 'local-only', counts: {}, milestones: {} }),
          this.db.getChannelStrategy(),
          this.db.listOperatorRuns(10),
          this.readiness
            ? this.readiness.getSummary()
            : Promise.resolve({ status: 'unverified', stale: false, blockingFailures: [], checks: [] }),
          this.engagement
            ? this.engagement.getSummary()
            : Promise.resolve({
                videosTracked: 0, pendingDrafts: 0, postedToday: 0, needsAttentionCount: 0,
                pendingAudienceIdeas: 0, postingEnabled: false, postingDisabledReason: 'setup_required',
                insights: [], recentThemes: [],
                evidencePolicy: 'Comments are fetched read-only from YouTube. Replies post only after operator approval, and fallback analysis never proposes drafts or ideas.'
              }),
          this.experiments
            ? this.experiments.getSummary()
            : Promise.resolve({ experiments: [], candidates: [], activeCount: 0, awaitingDecisionCount: 0, evidencePolicy: 'Finish setup to create a controlled growth experiment.' })
        ]);
        if (this.telemetry) void this.telemetry.sync(activation);
        res.json({
          stats, jobs, pipeline, schedule, events, notifications, profile, settings, ideas, analytics, learning, activation,
          channelStrategy, operatorRuns, readiness, engagement, experiments,
          system: {
            initialized: this.isInitialized,
            setupRequired: this.setupRequired,
            uptime: process.uptime(),
            activeJobs: this.activeJobs.size,
            automationPaused: this.scheduler ? !this.scheduler.isEnabled : true,
            agents: Object.keys(this.agents),
            autonomousRunning: Boolean(await this.db.getActiveOperatorRun()),
            videoProviders: this.agents.production?.aiVideoGenerator?.mediaGeneration?.listProviders() || [],
            researchInboxConfigured: this.researchInbox.isConfigured(),
            nicheEngineConfigured: this.nicheEngine.isConfigured()
          }
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    const researchError = (res, error) => res
      .status(error.status || 502)
      .json({ success: false, error: error.message });

    this.app.get('/api/research/state', async (_req, res) => {
      try {
        return res.json({ success: true, result: await this.researchInbox.getState() });
      } catch (error) {
        return researchError(res, error);
      }
    });

    this.app.get('/api/research/templates', async (_req, res) => {
      try {
        return res.json({ success: true, result: await this.researchInbox.getTemplates() });
      } catch (error) {
        return researchError(res, error);
      }
    });

    this.app.get('/api/research/ideas', async (req, res) => {
      try {
        return res.json({
          success: true,
          result: await this.researchInbox.getIdeas({ topic: req.query.topic, title: req.query.title })
        });
      } catch (error) {
        return researchError(res, error);
      }
    });

    this.app.get('/api/research/niche', async (req, res) => {
      try {
        return res.json({ success: true, result: await this.researchInbox.getNiche(req.query.slug) });
      } catch (error) {
        return researchError(res, error);
      }
    });

    this.app.post('/api/research/note', protect, async (req, res) => {
      try {
        return res.status(201).json({ success: true, result: await this.researchInbox.saveNote(req.body) });
      } catch (error) {
        return researchError(res, error);
      }
    });

    this.app.post('/api/research/niche', protect, async (req, res) => {
      try {
        return res.status(201).json({ success: true, result: await this.researchInbox.saveNiche(req.body) });
      } catch (error) {
        return researchError(res, error);
      }
    });

    this.app.get('/api/research/opportunities/status', async (_req, res) => {
      try {
        return res.json({ success: true, result: await this.nicheEngine.getStatus() });
      } catch (error) {
        return researchError(res, error);
      }
    });

    this.app.get('/api/research/opportunities/runs', async (_req, res) => {
      try {
        return res.json({ success: true, result: await this.nicheEngine.listRuns() });
      } catch (error) {
        return researchError(res, error);
      }
    });

    this.app.get('/api/research/opportunities/runs/:runId', async (req, res) => {
      try {
        return res.json({ success: true, result: await this.nicheEngine.getRun(req.params.runId) });
      } catch (error) {
        return researchError(res, error);
      }
    });

    this.app.post('/api/research/opportunities/scan', protect, async (req, res) => {
      try {
        const seed = String(req.body?.seed || '').trim();
        const region = String(req.body?.region || 'US').trim().toUpperCase();
        const language = String(req.body?.language || 'en').trim().toLowerCase();
        const maxCandidates = Number(req.body?.maxCandidates || 5);
        if (seed.length < 3 || seed.length > 120) {
          return res.status(400).json({ success: false, error: 'A seed between 3 and 120 characters is required' });
        }
        if (!/^[A-Z]{2}$/.test(region) || !/^[a-z]{2,3}$/.test(language)) {
          return res.status(400).json({ success: false, error: 'Use a valid region and language code' });
        }
        if (!Number.isInteger(maxCandidates) || maxCandidates < 1 || maxCandidates > 8) {
          return res.status(400).json({ success: false, error: 'Candidate count must be between 1 and 8' });
        }
        const result = await this.nicheEngine.startScan({ seed, region, language, maxCandidates });
        return res.status(202).json({ success: true, result });
      } catch (error) {
        return researchError(res, error);
      }
    });

    this.app.get('/api/jobs/:jobId', async (req, res) => {
      const job = await this.db.getGenerationJob(req.params.jobId);
      if (!job) return res.status(404).json({ error: 'Job not found' });
      job.checkpoints = await this.db.listGenerationCheckpoints(job.id);
      job.mediaTasks = await this.db.listMediaGenerationTasks(job.id);
      job.resumeFrom = this.recovery?.resumePoint(job.checkpoints);
      return res.json(job);
    });

    this.app.post('/api/jobs/:jobId/resume', protect, async (req, res) => {
      try {
        const result = await this.resumeGenerationJob(req.params.jobId, { stage: req.body?.stage });
        return res.status(202).json({ success: true, result });
      } catch (error) {
        return res.status(error.status || 400).json({ success: false, error: error.message });
      }
    });

    this.app.get('/api/readiness', async (_req, res) => {
      if (!this.readiness) return res.status(503).json({ error: 'Readiness service is not initialized' });
      return res.json(await this.readiness.getSummary());
    });

    this.app.post('/api/readiness/run', protect, async (req, res) => {
      try {
        if (!this.readiness) return res.status(503).json({ error: 'Readiness service is not initialized' });
        const result = await this.readiness.run({
          includePaidMedia: req.body?.includePaidMedia === true,
          includePaidVideo: req.body?.includePaidVideo === true
        });
        return res.json({ success: true, result });
      } catch (error) {
        return res.status(error.status || 500).json({ success: false, error: error.message });
      }
    });

    this.app.post('/api/jobs/:jobId/cancel', protect, async (req, res) => {
      const job = await this.db.getGenerationJob(req.params.jobId);
      if (!job) return res.status(404).json({ error: 'Job not found' });
      if (!['queued', 'running'].includes(job.status)) {
        return res.status(409).json({ error: 'Only queued or running jobs can be cancelled' });
      }
      const updated = await this.db.updateGenerationJob(job.id, { cancelRequested: true, details: { cancelReason: req.body?.reason || 'Cancelled by operator' } });
      return res.json({ success: true, result: updated });
    });

    this.app.get('/api/content/:productionId', async (req, res) => {
      let bundle = await this.db.getProductionBundle(req.params.productionId);
      if (!bundle) return res.status(404).json({ error: 'Content not found' });
      if (this.scenes && !bundle.scenes?.length) {
        await this.scenes.ensureManifest(bundle);
        bundle = await this.db.getProductionBundle(req.params.productionId);
      }
      return res.json(this.decorateContentBundle(bundle));
    });

    this.app.get('/api/content/:productionId/storyboard', async (req, res) => {
      try {
        const result = await this.db.getProductionStoryboard(req.params.productionId);
        if (!result) return res.status(404).json({ success: false, code: 'STORYBOARD_NOT_FOUND', error: 'Storyboard not found' });
        if (!result.storyboard || !Array.isArray(result.storyboard.scenes)) {
          throw new Error('Invalid saved storyboard');
        }
        const assetRoot = `/api/content/${encodeURIComponent(req.params.productionId)}/storyboard/assets`;
        const storyboard = { ...result.storyboard, scenes: result.storyboard.scenes.map(scene => ({
          ...scene,
          shots: (scene.shots || []).map(shot => ({
            ...shot,
            selectedAsset: shot.selectedAsset ? {
              ...shot.selectedAsset,
              previewUrl: shot.selectedAsset.localPath
                ? `${assetRoot}/${encodeURIComponent(scene.id)}/${encodeURIComponent(shot.id)}`
                : null
            } : null
          }))
        })) };
        return res.json({ success: true, result: { ...result, storyboard } });
      } catch (error) {
        this.logger.warn(`Storyboard could not be loaded: ${error.message}`);
        return res.status(500).json({ success: false, code: 'STORYBOARD_UNAVAILABLE', error: 'Storyboard could not be loaded' });
      }
    });

    this.app.get('/api/content/:productionId/storyboard/assets/:sceneId/:shotId', async (req, res) => {
      try {
        const result = await this.db.getProductionStoryboard(req.params.productionId);
        const scene = result?.storyboard?.scenes?.find(item => item.id === req.params.sceneId);
        const shot = scene?.shots?.find(item => item.id === req.params.shotId);
        const filePath = shot?.selectedAsset?.localPath;
        if (!filePath) return res.status(404).json({ error: 'Storyboard asset not found' });
        const resolved = await fs.realpath(filePath);
        const roots = [path.join(__dirname, 'data'), this.stockMedia.cacheDir, process.env.BACKGROUNDS_DIR].filter(Boolean);
        const canonicalRoots = await Promise.all(roots.map(root => fs.realpath(root).catch(() => null)));
        const allowed = canonicalRoots.some(root => root && root !== path.parse(root).root && resolved.startsWith(`${root}${path.sep}`));
        if (!allowed || !/\.(?:mp4|mov|webm|m4v|jpe?g|png|webp)$/i.test(resolved)) {
          return res.status(403).json({ error: 'Storyboard asset path is not allowed' });
        }
        return res.sendFile(resolved);
      } catch (_error) {
        return res.status(404).json({ error: 'Storyboard asset not found' });
      }
    });

    this.app.get('/api/content/:productionId/scenes/:sceneId/estimate', async (req, res) => {
      try {
        if (!this.scenes) return res.status(503).json({ error: 'Scene repair requires completed setup' });
        const result = await this.scenes.regenerationEstimate(req.params.productionId, req.params.sceneId, {
          provider: req.query.provider
        });
        return res.json(result);
      } catch (error) {
        return res.status(error.status || 400).json({ error: error.message, code: error.code, details: error.details });
      }
    });

    this.app.patch('/api/content/:productionId/scenes/:sceneId', protect, async (req, res) => {
      try {
        if (!this.scenes) return res.status(503).json({ error: 'Scene repair requires completed setup' });
        const result = await this.scenes.updateScene(req.params.productionId, req.params.sceneId, req.body || {});
        await this.refreshContentReview(req.params.productionId, 'Scene changes require review before scheduling');
        return res.json({ success: true, result: this.scenes.decorateScene(result, req.params.productionId) });
      } catch (error) {
        return res.status(error.status || 400).json({ success: false, error: error.message, code: error.code, details: error.details });
      }
    });

    this.app.post('/api/content/:productionId/scenes/reorder', protect, async (req, res) => {
      try {
        if (!this.scenes) return res.status(503).json({ error: 'Scene repair requires completed setup' });
        const result = await this.scenes.reorder(req.params.productionId, req.body?.sceneIds);
        await this.refreshContentReview(req.params.productionId, 'Timeline order changed; rebuild and review before scheduling');
        return res.json({ success: true, result: result.map(scene => this.scenes.decorateScene(scene, req.params.productionId)) });
      } catch (error) {
        return res.status(error.status || 400).json({ success: false, error: error.message, code: error.code, details: error.details });
      }
    });

    this.app.post('/api/content/:productionId/scenes/:sceneId/regenerate', protect, async (req, res) => {
      try {
        if (!this.scenes) return res.status(503).json({ error: 'Scene repair requires completed setup' });
        const result = await this.scenes.regenerate(req.params.productionId, req.params.sceneId, req.body || {});
        await this.refreshContentReview(req.params.productionId, 'Regenerated scene must be rebuilt and reviewed');
        return res.status(202).json({ success: true, result: {
          ...result,
          scene: this.scenes.decorateScene(result.scene, req.params.productionId)
        } });
      } catch (error) {
        return res.status(error.status || 400).json({ success: false, error: error.message, code: error.code, details: error.details });
      }
    });

    this.app.post('/api/content/:productionId/shorts/propose', protect, async (req, res) => {
      try {
        if (!this.shorts) return res.status(503).json({ error: 'Shorts repurposing requires completed setup' });
        const result = await this.shorts.propose(req.params.productionId, req.body || {});
        return res.json({ success: true, result });
      } catch (error) {
        return res.status(error.status || 400).json({ success: false, error: error.message, code: error.code });
      }
    });

    this.app.patch('/api/content/:productionId/shorts/:clipId', protect, async (req, res) => {
      try {
        if (!this.shorts) return res.status(503).json({ error: 'Shorts repurposing requires completed setup' });
        const result = await this.shorts.update(req.params.productionId, req.params.clipId, req.body || {});
        return res.json({ success: true, result });
      } catch (error) {
        return res.status(error.status || 400).json({ success: false, error: error.message, code: error.code });
      }
    });

    this.app.post('/api/content/:productionId/shorts/:clipId/render', protect, async (req, res) => {
      try {
        if (!this.shorts) return res.status(503).json({ error: 'Shorts repurposing requires completed setup' });
        const result = await this.shorts.render(req.params.productionId, req.params.clipId);
        return res.status(202).json({ success: true, result });
      } catch (error) {
        return res.status(error.status || 400).json({ success: false, error: error.message, code: error.code });
      }
    });

    this.app.post('/api/content/:productionId/shorts/:clipId/approve', protect, async (req, res) => {
      try {
        if (!this.shorts) return res.status(503).json({ error: 'Shorts repurposing requires completed setup' });
        const result = await this.shorts.approve(req.params.productionId, req.params.clipId, req.body || {});
        return res.json({ success: true, result });
      } catch (error) {
        return res.status(error.status || 400).json({ success: false, error: error.message, code: error.code });
      }
    });

    this.app.get('/api/content/:productionId/shorts/:clipId/asset/:kind', async (req, res) => {
      try {
        const clip = await this.db.getShortClip(req.params.clipId);
        if (!clip || clip.productionId !== req.params.productionId) return res.status(404).json({ error: 'Short asset not found' });
        const filePath = req.params.kind === 'video' ? clip.outputPath : req.params.kind === 'captions' ? clip.captionsPath : null;
        if (!filePath) return res.status(404).json({ error: 'Short asset not found' });
        const resolved = path.resolve(filePath);
        const shortsRoot = path.resolve(__dirname, 'data', 'shorts');
        if (!resolved.startsWith(`${shortsRoot}${path.sep}`)) return res.status(403).json({ error: 'Short asset path is not allowed' });
        await fs.access(resolved);
        return res.sendFile(resolved);
      } catch (_error) {
        return res.status(404).json({ error: 'Short asset not found' });
      }
    });

    this.app.post('/api/content/:productionId/scenes/:sceneId/narration', protect, async (req, res) => {
      try {
        if (!this.scenes) return res.status(503).json({ error: 'Narration recovery requires completed setup' });
        const result = await this.scenes.regenerateNarration(req.params.productionId, req.params.sceneId, req.body || {});
        await this.refreshContentReview(req.params.productionId, 'Narration regenerated; rebuild the final video before approval');
        return res.status(202).json({ success: true, result: this.scenes.decorateScene(result, req.params.productionId) });
      } catch (error) {
        return res.status(error.status || 400).json({ success: false, error: error.message, code: error.code, details: error.details });
      }
    });

    this.app.post('/api/content/:productionId/narration/silence', protect, async (req, res) => {
      try {
        if (!this.scenes) return res.status(503).json({ error: 'Narration recovery requires completed setup' });
        const result = await this.scenes.setSilenceOverride(req.params.productionId, req.body || {});
        await this.refreshContentReview(
          req.params.productionId,
          result.enabled ? 'Intentional silence recorded; rebuild and review before approval' : 'Narration is required again; regenerate it before approval'
        );
        return res.json({ success: true, result });
      } catch (error) {
        return res.status(error.status || 400).json({ success: false, error: error.message, code: error.code, details: error.details });
      }
    });

    this.app.put(
      '/api/content/:productionId/scenes/:sceneId/asset',
      protect,
      express.raw({ type: ['image/*', 'video/*'], limit: '100mb' }),
      async (req, res) => {
        try {
          if (!this.scenes) return res.status(503).json({ error: 'Scene repair requires completed setup' });
          const result = await this.scenes.replaceAsset(req.params.productionId, req.params.sceneId, {
            buffer: req.body,
            contentType: req.get('content-type'),
            filename: req.get('x-file-name'),
            rightsConfirmed: req.get('x-rights-confirmed') === 'true',
            containsSyntheticMedia: req.get('x-synthetic-media') === 'true'
          });
          await this.refreshContentReview(req.params.productionId, 'Replacement scene asset must be rebuilt and reviewed');
          return res.json({ success: true, result: this.scenes.decorateScene(result, req.params.productionId) });
        } catch (error) {
          return res.status(error.status || 400).json({ success: false, error: error.message, code: error.code, details: error.details });
        }
      }
    );

    this.app.post('/api/content/:productionId/scenes/rebuild', protect, async (req, res) => {
      try {
        if (!this.scenes) return res.status(503).json({ error: 'Scene repair requires completed setup' });
        const result = await this.scenes.rebuild(req.params.productionId);
        await this.refreshContentReview(req.params.productionId, 'Scene repair rebuilt; final approval is required');
        return res.json({ success: true, result });
      } catch (error) {
        return res.status(error.status || 400).json({ success: false, error: error.message, code: error.code, details: error.details });
      }
    });

    this.app.get('/api/content/:productionId/scenes/:sceneId/asset', async (req, res) => {
      try {
        const scene = await this.db.getProductionScene(req.params.productionId, req.params.sceneId);
        if (!scene?.assetPath) return res.status(404).json({ error: 'Scene asset not found' });
        const resolved = path.resolve(scene.assetPath);
        const dataRoot = path.resolve(__dirname, 'data');
        if (!resolved.startsWith(`${dataRoot}${path.sep}`)) return res.status(403).json({ error: 'Scene asset path is not allowed' });
        await fs.access(resolved);
        return res.sendFile(resolved);
      } catch (_error) {
        return res.status(404).json({ error: 'Scene asset not found' });
      }
    });

    this.app.patch('/api/content/:productionId', protect, async (req, res) => {
      try {
        const bundle = await this.db.getProductionBundle(req.params.productionId);
        if (!bundle) return res.status(404).json({ error: 'Content not found' });
        if (bundle.review_status === 'approved' && bundle.schedule?.status === 'published') {
          return res.status(409).json({ error: 'Published content cannot be edited here' });
        }
        const editorData = this.validateEditorData(req.body, bundle.editorData);
        const result = await this.db.saveContentReview(bundle.id, {
          status: bundle.review_status || 'needs_review',
          editorData,
          qualityChecks: bundle.qualityChecks,
          reviewNotes: req.body.reviewNotes ?? bundle.review_notes,
          reviewedAt: bundle.reviewed_at
        });
        return res.json({ success: true, result: this.decorateContentBundle(result) });
      } catch (error) {
        return res.status(400).json({ success: false, error: error.message });
      }
    });

    this.app.post('/api/content/:productionId/approve', protect, async (req, res) => {
      try {
        const result = await this.approveContent(req.params.productionId, req.body || {});
        return res.json({ success: true, result });
      } catch (error) {
        return res.status(error.status || 400).json({ success: false, error: error.message, quality: error.quality });
      }
    });

    this.app.post('/api/content/:productionId/reject', protect, async (req, res) => {
      const bundle = await this.db.getProductionBundle(req.params.productionId);
      if (!bundle) return res.status(404).json({ error: 'Content not found' });
      await this.db.saveContentReview(bundle.id, {
        status: 'rejected',
        editorData: bundle.editorData,
        qualityChecks: bundle.qualityChecks,
        reviewNotes: req.body?.notes || 'Rejected by operator',
        reviewedAt: new Date().toISOString()
      });
      await this.db.updateProductionStatus(bundle.id, 'rejected');
      return res.json({ success: true });
    });

    this.app.post('/api/content/:productionId/retry', protect, async (req, res) => {
      const bundle = await this.db.getProductionBundle(req.params.productionId);
      if (!bundle) return res.status(404).json({ error: 'Content not found' });
      const job = await this.startGenerationJob({
        topic: bundle.strategy.topic || bundle.editorData.title || null,
        style: bundle.strategy.requestedStyle || bundle.strategy.contentType || null,
        length: bundle.strategy.requestedLengthKey || 'medium',
        source: 'retry'
      });
      return res.status(202).json({ success: true, result: job });
    });

    this.app.get('/api/content/:productionId/asset/:kind', async (req, res) => {
      try {
        const bundle = await this.db.getProductionBundle(req.params.productionId);
        if (!bundle) return res.status(404).json({ error: 'Content not found' });
        const allowed = {
          video: bundle.assets?.finalVideo?.path,
          thumbnail: bundle.assets?.thumbnail?.path,
          captions: bundle.assets?.captions?.path,
          script: bundle.assets?.script?.originalPath
        };
        const experimentMatch = req.params.kind.match(/^experiment-thumbnail-(\d+)$/);
        const experimentPath = experimentMatch
          ? bundle.editorData?.packagingExperiment?.thumbnailVariants?.[Number(experimentMatch[1])]?.path
          : null;
        const filePath = allowed[req.params.kind] || experimentPath;
        if (!filePath) return res.status(404).json({ error: 'Asset not found' });
        const resolved = path.resolve(filePath);
        const dataRoot = path.resolve(__dirname, 'data');
        const experimentRoot = path.resolve(__dirname, 'uploads', 'thumbnails');
        const allowedPath = [dataRoot, experimentRoot]
          .some(root => resolved.startsWith(`${root}${path.sep}`));
        if (!allowedPath) return res.status(403).json({ error: 'Asset path is not allowed' });
        await fs.access(resolved);
        return res.sendFile(resolved);
      } catch (_error) {
        return res.status(404).json({ error: 'Asset not found' });
      }
    });

    // The panel's "Social" area (utils/redes-estado.js).
    this.app.get('/api/redes', protect, async (req, res) => {
      try {
        return res.json({ success: true, piezas: await require('./utils/redes-estado').estadoRedes(this.db) });
      } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
      }
    });
    // Each user's profile and preferences (utils/preferencias.js). No API key: oauth2-proxy
    // identifies the user and each one only touches their own.
    this.app.get('/api/me', async (req, res) => {
      try { return res.json({ success: true, ...(await require('./utils/preferencias').perfil(this.db, req)) }); } catch (error) { return res.status(500).json({ success: false, error: error.message }); }
    });
    this.app.put('/api/me/prefs', async (req, res) => {
      try {
        const r = await require('./utils/preferencias').guardaPrefs(this.db, req, req.body || {});
        return r.error ? res.status(400).json({ success: false, error: r.error }) : res.json({ success: true, prefs: r.prefs });
      } catch (error) { return res.status(500).json({ success: false, error: error.message }); }
    });

    // Connections (what works and what's missing) and the book and links metrics.
    const { creaMonitor, estadoConexiones } = require('./utils/conexiones');
    const conexiones = creaMonitor({ check: () => estadoConexiones({ db: this.db, researchInbox: this.researchInbox, nicheEngine: this.nicheEngine, youtube: this.agents.publishing?.youtube || null }) });
    this.app.get('/api/conexiones', protect, async (req, res) => {
      res.set('Cache-Control', 'no-store');
      try { return res.json({ success: true, conexiones: await conexiones() }); } catch (_error) { return res.status(502).json({ success: false, error: 'No se pudieron comprobar las conexiones.' }); }
    });
    this.app.get('/api/metricas-web', protect, async (req, res) => {
      try { return res.json({ success: true, ...(await require('./utils/contador').resumen(this.db)) }); } catch (error) { return res.status(500).json({ success: false, error: error.message }); }
    });

    // Textos del canal editables (utils/textos-canal.js).
    this.app.get('/api/textos', protect, (req, res) => res.json({ success: true, textos: require('./utils/textos-canal').catalogo() }));
    this.app.put('/api/textos', protect, async (req, res) => {
      try {
        const r = await require('./utils/textos-canal').guarda(this.db, req.body || {});
        return r.error ? res.status(400).json({ success: false, error: r.error }) : res.json({ success: true });
      } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
      }
    });
    this.app.put('/api/redes/:id', protect, async (req, res) => {
      try {
        const r = await require('./utils/redes-estado').cambiaPieza(this.db, req.params.id, req.body || {});
        return r.error ? res.status(400).json({ success: false, error: r.error }) : res.json({ success: true });
      } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
      }
    });

    // Messages section (utils/mensajes/): several IG, FB and WhatsApp accounts, inbox, per-post
    // rules and their run log (15/10/2026).
    const msj = {
      cuentas: require('./utils/mensajes/cuentas'),
      reglas: require('./utils/mensajes/reglas'),
      motor: require('./utils/mensajes/motor'),
      bandeja: require('./utils/mensajes/bandeja'),
      clientes: require('./utils/mensajes/clientes'),
      conectores: require('./utils/mensajes/conectores')
    };
    const yt = () => this.agents.publishing?.youtube || null; // canal de YouTube ya conectado (Sistema → Cuentas)
    // Errors with a status (400/404/502) are for the user; the rest, generic (never tokens).
    const msjRuta = fn => async (req, res) => {
      res.set('Cache-Control', 'no-store');
      try {
        return res.json({ success: true, ...(await fn(req)) });
      } catch (error) {
        if (!error.status) this.logger.warn(`Mensajes: ${error.message}`);
        return res.status(error.status || 500).json({ success: false, error: error.status ? error.message : 'No se pudo completar. Mira los logs.' });
      }
    };
    this.app.get('/api/mensajes/conectores', protect, msjRuta(async () => ({ conectores: msj.conectores.CONECTORES })));
    this.app.get('/api/mensajes/resumen', protect, msjRuta(async () => msj.bandeja.resumen({ db: this.db, youtube: yt() })));
    this.app.get('/api/mensajes/cuentas', protect, msjRuta(async () => ({ cuentas: await msj.cuentas.lista(this.db, { youtube: yt() }) })));
    this.app.post('/api/mensajes/cuentas', protect, msjRuta(async req => ({ cuenta: await msj.cuentas.agrega(this.db, req.body || {}) })));
    this.app.put('/api/mensajes/cuentas/:id', protect, msjRuta(async req => { await msj.cuentas.cambia(this.db, req.params.id, req.body || {}); return {}; }));
    this.app.delete('/api/mensajes/cuentas/:id', protect, msjRuta(async req => { await msj.cuentas.quita(this.db, req.params.id); return {}; }));
    this.app.get('/api/mensajes/cuentas/:id/publicaciones', protect, msjRuta(async req => {
      const cuenta = await msj.cuentas.una(this.db, req.params.id, { youtube: yt() });
      if (!cuenta?.token) throw Object.assign(new Error('Account not found'), { status: 404 });
      try {
        return { publicaciones: await msj.clientes.cliente(cuenta, { db: this.db, youtube: yt() }).publicaciones(25) };
      } catch (error) { throw Object.assign(error, { status: 502 }); }
    }));
    this.app.get('/api/mensajes/reglas', protect, msjRuta(async () => ({ reglas: await msj.reglas.lista(this.db) })));
    const cuentasValidas = async () => new Map((await msj.cuentas.lista(this.db, { youtube: yt() })).map(c => [c.id, c.red]));
    this.app.post('/api/mensajes/reglas', protect, msjRuta(async req => msj.reglas.guarda(this.db, req.body || {}, { cuentas: await cuentasValidas() })));
    this.app.put('/api/mensajes/reglas/:id', protect, msjRuta(async req => {
      const b = req.body || {};
      if (Object.keys(b).length === 1 && 'activa' in b) { await msj.reglas.activa(this.db, req.params.id, Boolean(b.activa)); return {}; }
      return msj.reglas.guarda(this.db, b, { id: req.params.id, cuentas: await cuentasValidas() });
    }));
    this.app.delete('/api/mensajes/reglas/:id', protect, msjRuta(async req => { await msj.reglas.borra(this.db, req.params.id); return {}; }));
    this.app.get('/api/mensajes/ejecuciones', protect, msjRuta(async req => ({
      ejecuciones: await msj.motor.ejecuciones(this.db, { cuentaId: req.query.cuenta, reglaId: req.query.regla, estado: req.query.estado, limite: req.query.limite })
    })));
    this.app.get('/api/mensajes/bandeja', protect, msjRuta(async req => msj.bandeja.conversaciones({ db: this.db, cuentaId: req.query.cuenta || null })));
    this.app.get('/api/mensajes/bandeja/:cuenta/:conv', protect, msjRuta(async req => ({
      mensajes: await msj.bandeja.mensajes({ db: this.db, cuentaId: req.params.cuenta, convId: req.params.conv }).catch(e => { throw Object.assign(e, { status: e.status || 502 }); })
    })));
    this.app.post('/api/mensajes/bandeja/:cuenta', protect, msjRuta(async req => {
      await msj.bandeja.responde({ db: this.db, cuentaId: req.params.cuenta, destinoId: req.body?.destinoId, texto: req.body?.texto });
      return {};
    }));
    // WhatsApp webhook: public (Meta calls it), protected by the verify token and HMAC signature.
    this.app.get('/webhooks/whatsapp/:cuenta', async (req, res) => {
      try {
        const reto = await msj.bandeja.verificaWebhook(this.db, req.params.cuenta, req.query || {});
        return reto === null ? res.sendStatus(403) : res.type('text/plain').send(reto);
      } catch (_error) { return res.sendStatus(500); }
    });
    this.app.post('/webhooks/whatsapp/:cuenta', async (req, res) => {
      try {
        const r = await msj.bandeja.recibeWebhook(this.db, req.params.cuenta, { rawBody: req.rawBody, firma: req.get('x-hub-signature-256'), body: req.body });
        res.sendStatus(r.status);
        // Meta wants the 200 right away: the automatic replies come after.
        if (r.nuevos?.length) {
          msj.motor.ejecutaChat({ db: this.db, cuenta: r.cuenta, cliente: r.cliente, mensajes: r.nuevos, logger: this.logger })
            .catch(error => this.logger.warn(`WhatsApp (automatic reply): ${error.message}`));
        }
        return undefined;
      } catch (error) {
        this.logger.warn(`Webhook WhatsApp: ${error.message}`);
        return res.sendStatus(500);
      }
    });

    this.app.put('/api/profile', protect, async (req, res) => {
      try {
        const profile = this.validateProfile(req.body || {});
        return res.json({ success: true, result: await this.db.saveChannelProfile(profile) });
      } catch (error) {
        return res.status(400).json({ success: false, error: error.message });
      }
    });

    this.app.put('/api/operator/strategy', protect, async (req, res) => {
      try {
        const current = await this.db.getChannelStrategy() || {};
        const strategy = this.validateChannelStrategy(req.body || {}, current);
        return res.json({ success: true, result: await this.db.saveChannelStrategy(strategy) });
      } catch (error) {
        return res.status(400).json({ success: false, error: error.message });
      }
    });

    this.app.post('/api/operator/start', protect, async (req, res) => {
      try {
        if (this.setupRequired || !this.agents.strategy) {
          return res.status(503).json({ success: false, error: 'Finish setup with npm run walkthrough before activating the autonomous operator' });
        }
        if (this.activeJobs.size) {
          return res.status(409).json({ success: false, error: 'Wait for the current generation job to finish before starting an autonomous run' });
        }
        await this.readiness?.assertReady('Autonomous production');
        const current = await this.db.getChannelStrategy() || {};
        const strategy = this.validateChannelStrategy({ ...(req.body || {}), status: 'active' }, current);
        const saved = await this.db.saveChannelStrategy(strategy);
        const run = await this.autonomous.start(saved);
        return res.status(202).json({ success: true, result: run });
      } catch (error) {
        return res.status(error.status || 400).json({ success: false, error: error.message });
      }
    });

    this.app.post('/api/operator/pause', protect, async (_req, res) => {
      const strategy = await this.db.getChannelStrategy();
      if (!strategy) return res.status(404).json({ error: 'Channel strategy not found' });
      const active = await this.db.getActiveOperatorRun();
      if (active) await this.autonomous.cancel(active.id);
      const saved = await this.db.saveChannelStrategy({ ...strategy, status: 'paused' });
      return res.json({ success: true, result: saved });
    });

    this.app.post('/api/operator/runs/:runId/cancel', protect, async (req, res) => {
      const run = await this.autonomous.cancel(req.params.runId);
      if (!run) return res.status(404).json({ error: 'Operator run not found' });
      return res.json({ success: true, result: run });
    });

    this.app.put('/api/content/:productionId/provenance', protect, async (req, res) => {
      try {
        const bundle = await this.db.getProductionBundle(req.params.productionId);
        if (!bundle) return res.status(404).json({ error: 'Content not found' });
        if (bundle.review_status === 'approved' || bundle.schedule) {
          return res.status(409).json({ error: 'Provenance is locked after content is approved or scheduled' });
        }
        if (!this.provenance) this.provenance = new ProvenanceService(this.db);
        await this.provenance.review(bundle.id, req.body || {});
        const updated = await this.db.getProductionBundle(bundle.id);
        const profile = await this.db.getChannelProfile() || {};
        const quality = await this.operator.runQualityChecks({
          ...updated,
          scheduledPublishTime: updated.scheduled_publish_time
        }, profile);
        const reviewStatus = quality.passed ? 'needs_review' : 'needs_attention';
        const result = await this.db.saveContentReview(bundle.id, {
          status: reviewStatus,
          editorData: updated.editorData,
          qualityChecks: quality.checks,
          reviewNotes: quality.passed ? null : `Blocking checks failed: ${quality.blockingFailures.join(', ')}`,
          reviewedAt: null
        });
        return res.json({ success: true, result: this.decorateContentBundle(result) });
      } catch (error) {
        return res.status(error.status || 400).json({ success: false, error: error.message });
      }
    });

    this.app.post('/api/operator/runs/:runId/resume', protect, async (req, res) => {
      try {
        if (this.setupRequired || !this.agents.strategy) {
          return res.status(503).json({ success: false, error: 'Finish setup before resuming the autonomous operator' });
        }
        await this.readiness?.assertReady('Autonomous production recovery');
        const strategy = await this.db.getChannelStrategy();
        const run = await this.autonomous.resume(req.params.runId, strategy);
        return res.status(202).json({ success: true, result: run });
      } catch (error) {
        return res.status(error.status || 400).json({ success: false, error: error.message });
      }
    });

    this.app.post('/api/learning/recommendations/:recommendationId/:action', protect, async (req, res) => {
      const { recommendationId, action } = req.params;
      if (!['approve', 'reject'].includes(action)) {
        return res.status(400).json({ error: 'Action must be approve or reject' });
      }
      const status = action === 'approve' ? 'approved' : 'rejected';
      const recommendation = await this.db.reviewLearningRecommendation(recommendationId, status);
      if (!recommendation) return res.status(404).json({ error: 'Learning recommendation not found' });
      await this.operator.notify({
        type: 'learning_recommendation_reviewed',
        level: action === 'approve' ? 'success' : 'info',
        title: action === 'approve' ? 'Channel learning approved' : 'Channel learning rejected',
        message: recommendation.title,
        data: { recommendationId, status }
      });
      return res.json({ success: true, result: recommendation });
    });

    this.app.post('/api/content/:productionId/discoverability/run', protect, async (req, res) => {
      try {
        const bundle = await this.db.getProductionBundle(req.params.productionId);
        if (!bundle) return res.status(404).json({ success: false, error: 'Content not found' });
        const profile = await this.db.getChannelProfile() || {};
        const audit = await this.discoverability.auditProduction(bundle, profile, req.body?.platform || 'youtube');
        if (bundle.review_status !== 'approved' && !bundle.schedule) {
          const updated = await this.db.getProductionBundle(bundle.id);
          const quality = await this.operator.runQualityChecks({
            ...updated,
            scheduledPublishTime: updated.scheduled_publish_time
          }, profile);
          await this.db.saveContentReview(bundle.id, {
            status: quality.passed ? 'needs_review' : 'needs_attention',
            editorData: updated.editorData,
            qualityChecks: quality.checks,
            reviewNotes: quality.passed ? null : `Blocking checks failed: ${quality.blockingFailures.join(', ')}`,
            reviewedAt: null
          });
        }
        const result = await this.db.getProductionBundle(bundle.id);
        return res.json({ success: true, result: this.decorateContentBundle(result), audit });
      } catch (error) {
        return res.status(error.status || 400).json({ success: false, error: error.message });
      }
    });

    this.app.patch('/api/discoverability/findings/:findingId', protect, async (req, res) => {
      try {
        const finding = await this.discoverability.reviewFinding(req.params.findingId, req.body || {});
        const audit = await this.db.getLatestDiscoverabilityAudit(finding.production_id, finding.platform);
        return res.json({ success: true, result: { finding, audit } });
      } catch (error) {
        return res.status(error.status || 400).json({ success: false, error: error.message });
      }
    });

    this.app.get('/api/experiments', async (_req, res) => {
      try {
        const summary = this.experiments
          ? await this.experiments.getSummary()
          : { experiments: [], candidates: [], activeCount: 0, awaitingDecisionCount: 0 };
        return res.json({ success: true, result: summary });
      } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
      }
    });

    this.app.post('/api/experiments', protect, async (req, res) => {
      try {
        if (!this.experiments) return res.status(503).json({ error: 'Finish setup before creating experiments' });
        const experiment = await this.experiments.create(req.body || {});
        return res.status(201).json({ success: true, result: experiment });
      } catch (error) {
        return res.status(error.status || 400).json({ success: false, error: error.message, code: error.code });
      }
    });

    this.app.post('/api/experiments/:experimentId/:action', protect, async (req, res) => {
      try {
        if (!this.experiments) return res.status(503).json({ error: 'Finish setup before controlling experiments' });
        const actions = {
          approve: () => this.experiments.approve(req.params.experimentId, req.body),
          start: () => this.experiments.start(req.params.experimentId, req.body),
          refresh: () => this.experiments.refresh(req.params.experimentId),
          adopt: () => this.experiments.adoptWinner(req.params.experimentId, req.body),
          cancel: () => this.experiments.cancel(req.params.experimentId, req.body)
        };
        if (!actions[req.params.action]) return res.status(400).json({ error: 'Unsupported experiment action' });
        const experiment = await actions[req.params.action]();
        await this.operator.notify({
          type: 'growth_experiment_updated',
          level: ['adopt', 'approve'].includes(req.params.action) ? 'success' : 'info',
          title: `Growth experiment ${req.params.action}`,
          message: experiment.title,
          data: { experimentId: experiment.id, status: experiment.status }
        });
        return res.json({ success: true, result: experiment });
      } catch (error) {
        return res.status(error.status || 400).json({ success: false, error: error.message, code: error.code });
      }
    });

    this.app.get('/api/retention/:videoId', async (req, res) => {
      const videoId = String(req.params.videoId || '').trim();
      if (!/^[A-Za-z0-9_-]{1,100}$/.test(videoId)) {
        return res.status(400).json({ error: 'A valid YouTube video ID is required' });
      }
      const snapshots = await this.db.listRetentionSnapshots({ videoId, limit: 10 });
      return res.json({ success: true, result: snapshots });
    });

    this.app.post('/api/retention/:videoId/refresh', protect, async (req, res) => {
      try {
        const videoId = String(req.params.videoId || '').trim();
        const measurementWindow = String(req.body?.measurementWindow || 'rolling');
        if (!/^[A-Za-z0-9_-]{1,100}$/.test(videoId)) {
          return res.status(400).json({ error: 'A valid YouTube video ID is required' });
        }
        if (!['24h', '7d', 'rolling'].includes(measurementWindow)) {
          return res.status(400).json({ error: 'Measurement window must be 24h, 7d, or rolling' });
        }
        if (!this.agents.analytics) {
          return res.status(503).json({ error: 'YouTube Analytics is not initialized' });
        }
        const report = await this.agents.analytics.analyzeVideoPerformance(videoId, { measurementWindow });
        return res.json({
          success: true,
          result: report.retentionSnapshot || null,
          retention: report.retention
        });
      } catch (error) {
        return res.status(error.status || 400).json({ error: error.message });
      }
    });

    const ENGAGEMENT_VIDEO_ID = /^[A-Za-z0-9_-]{1,100}$/;

    this.app.get('/api/engagement/:videoId', async (req, res) => {
      try {
        const videoId = String(req.params.videoId || '').trim();
        if (!ENGAGEMENT_VIDEO_ID.test(videoId)) {
          return res.status(400).json({ error: 'A valid YouTube video ID is required' });
        }
        const [insight, comments, drafts] = await Promise.all([
          this.db.getEngagementInsight(videoId),
          this.db.listAudienceComments({ videoId, limit: 200 }),
          this.db.listReplyDrafts({ videoId, limit: 100 })
        ]);
        return res.json({ success: true, result: { insight, comments, drafts } });
      } catch (error) {
        return res.status(error.status || 400).json({ success: false, error: error.message });
      }
    });

    this.app.post('/api/engagement/:videoId/sync', protect, async (req, res) => {
      try {
        if (!this.engagement) return res.status(503).json({ error: 'Audience engagement requires completed setup' });
        const videoId = String(req.params.videoId || '').trim();
        if (!ENGAGEMENT_VIDEO_ID.test(videoId)) {
          return res.status(400).json({ error: 'A valid YouTube video ID is required' });
        }
        const sync = await this.engagement.syncVideoComments(videoId, req.body || {});
        const insight = sync.fetched > 0 || req.body?.analyze === true
          ? await this.engagement.analyzeVideo(videoId)
          : sync.insight;
        return res.status(202).json({ success: true, result: { ...sync, insight } });
      } catch (error) {
        return res.status(error.status || 400).json({ success: false, error: error.message, code: error.code });
      }
    });

    this.app.post('/api/engagement/:videoId/draft-replies', protect, async (req, res) => {
      try {
        if (!this.engagement) return res.status(503).json({ error: 'Audience engagement requires completed setup' });
        const videoId = String(req.params.videoId || '').trim();
        if (!ENGAGEMENT_VIDEO_ID.test(videoId)) {
          return res.status(400).json({ error: 'A valid YouTube video ID is required' });
        }
        const result = await this.engagement.draftReplies(videoId, req.body || {});
        return res.json({ success: true, result });
      } catch (error) {
        return res.status(error.status || 400).json({ success: false, error: error.message, code: error.code });
      }
    });

    this.app.patch('/api/engagement/replies/:draftId', protect, async (req, res) => {
      try {
        if (!this.engagement) return res.status(503).json({ error: 'Audience engagement requires completed setup' });
        const result = await this.engagement.updateReplyDraft(req.params.draftId, req.body || {});
        return res.json({ success: true, result });
      } catch (error) {
        return res.status(error.status || 400).json({ success: false, error: error.message, code: error.code });
      }
    });

    this.app.post('/api/engagement/replies/:draftId/approve', protect, async (req, res) => {
      try {
        if (!this.engagement) return res.status(503).json({ error: 'Audience engagement requires completed setup' });
        const result = await this.engagement.approveReplyDraft(req.params.draftId, req.body || {});
        // The reply is already live on YouTube; a notification failure must not report an error.
        try {
          await this.operator.notify({
            type: 'audience_reply_posted',
            level: 'success',
            title: 'Audience reply posted',
            message: `A reply was posted on video ${result.videoId}`,
            data: { draftId: result.id, videoId: result.videoId, postedCommentId: result.postedCommentId }
          });
        } catch (notifyError) {
          this.logger.warn(`Posted reply notification failed: ${notifyError.message}`);
        }
        return res.json({ success: true, result });
      } catch (error) {
        return res.status(error.status || 400).json({ success: false, error: error.message, code: error.code });
      }
    });

    this.app.post('/api/ideas', protect, async (req, res) => {
      const topic = String(req.body?.topic || '').trim();
      if (!topic || topic.length > 200) return res.status(400).json({ error: 'A topic of 200 characters or less is required' });
      const idea = await this.db.createContentIdea({ ...req.body, topic });
      return res.status(201).json({ success: true, result: idea });
    });

    this.app.patch('/api/ideas/:ideaId', protect, async (req, res) => {
      const idea = await this.db.updateContentIdea(req.params.ideaId, req.body || {});
      if (!idea) return res.status(404).json({ error: 'Idea not found' });
      return res.json({ success: true, result: idea });
    });

    this.app.post('/api/ideas/:ideaId/generate', protect, async (req, res) => {
      const idea = await this.db.updateContentIdea(req.params.ideaId, { status: 'generating' });
      if (!idea) return res.status(404).json({ error: 'Idea not found' });
      const job = await this.startGenerationJob({ topic: idea.topic, style: idea.style, length: req.body?.length || 'medium', source: 'idea' });
      await this.db.updateContentIdea(idea.id, { status: 'generated' });
      return res.status(202).json({ success: true, result: job });
    });

    this.app.post('/api/automation/:action', protect, async (req, res) => {
      if (!this.scheduler) return res.status(409).json({ error: 'Finish setup before controlling automation' });
      const { action } = req.params;
      if (action === 'pause') {
        await this.scheduler.pauseAutomation();
        await this.db.setSetting('automation_paused', 'true');
      } else if (action === 'resume') {
        await this.scheduler.resumeAutomation();
        await this.db.setSetting('automation_paused', 'false');
      } else {
        return res.status(400).json({ error: 'Action must be pause or resume' });
      }
      return res.json({ success: true, paused: !this.scheduler.isEnabled });
    });

    this.app.put('/api/settings', protect, async (req, res) => {
      const allowed = ['approval_required', 'notification_enabled', 'channel_timezone', 'max_daily_posts', 'content_buffer_days'];
      for (const key of allowed) {
        if (req.body?.[key] !== undefined) await this.db.setSetting(key, String(req.body[key]));
      }
      // Daily publishing times (long videos and Shorts): validated, "off" turns them off.
      for (const key of ['daily_publish_time', 'daily_shorts_time']) {
        if (req.body?.[key] === undefined) continue;
        try {
          await this.db.setSetting(key, validaHoras(req.body[key]));
        } catch (error) {
          return res.status(400).json({ success: false, error: error.message });
        }
      }
      // «Elementos del vídeo» (03/10/2026): se guarda ya normalizado (utils/extras-video.js).
      if (req.body?.video_extras !== undefined) {
        const { normalizaExtras } = require('./utils/extras-video');
        await this.db.setSetting('video_extras', JSON.stringify(normalizaExtras(req.body.video_extras)));
      }
      const provider = req.body?.video_provider;
      if (provider !== undefined) {
        const supported = ['slideshow', 'auto', 'seedance', 'minimax_h3', 'google_omni', 'kling', 'wan'];
        if (!supported.includes(provider)) return res.status(400).json({ error: 'Unsupported video provider' });
        await this.db.setSetting('video_provider', provider);
      }
      const mode = req.body?.video_generation_mode;
      if (mode !== undefined) {
        if (!['hybrid', 'slideshow'].includes(mode)) return res.status(400).json({ error: 'Unsupported video generation mode' });
        await this.db.setSetting('video_generation_mode', mode);
      }
      if (req.body?.video_clip_duration !== undefined) {
        const value = Number(req.body.video_clip_duration);
        if (!Number.isInteger(value) || value < 3 || value > 30) return res.status(400).json({ error: 'Clip duration must be between 3 and 30 seconds' });
        await this.db.setSetting('video_clip_duration', String(value));
      }
      if (req.body?.video_max_generated_seconds !== undefined) {
        const value = Number(req.body.video_max_generated_seconds);
        if (!Number.isInteger(value) || value < 0 || value > 600) return res.status(400).json({ error: 'Generated seconds cap must be between 0 and 600' });
        await this.db.setSetting('video_max_generated_seconds', String(value));
      }
      return res.json({ success: true, result: require('./utils/dashboard-safety').dashboardSettings(await this.db.getAllSettings()) });
    });

    this.app.post('/api/notifications/:notificationId/read', protect, async (req, res) => {
      await this.db.markNotificationRead(req.params.notificationId);
      return res.json({ success: true });
    });
  }

  async startGenerationJob(input = {}) {
    if (this.setupRequired || !this.agents.strategy) {
      const error = new Error('Finish setup with npm run walkthrough before generating content');
      error.status = 503;
      throw error;
    }
    if (['scheduler', 'autonomous_operator'].includes(input.source)) {
      await this.readiness?.assertReady('Automated generation');
    }
    const maxConcurrent = Math.max(1, parseInt(process.env.MAX_CONCURRENT_JOBS || '1', 10));
    if (this.activeJobs.size >= maxConcurrent) {
      const error = new Error(`Generation is busy (${this.activeJobs.size}/${maxConcurrent} active jobs). Try again when the current job finishes.`);
      error.status = 429;
      throw error;
    }

    const validation = this.validateGenerateRequestBody(input);
    if (!validation.valid) {
      const error = new Error(validation.error);
      error.status = validation.status;
      throw error;
    }

    const job = await this.db.createGenerationJob({
      ...validation.value,
      source: input.source || 'manual'
    });

    const work = this.runGenerationJob(job.id, validation.value)
      .catch(error => this.logger.error(`Generation job ${job.id} failed:`, error))
      .finally(() => this.activeJobs.delete(job.id));
    this.activeJobs.set(job.id, work);
    return job;
  }

  async resumeGenerationJob(jobId, options = {}) {
    if (this.setupRequired || !this.agents.strategy) {
      const error = new Error('Finish setup with npm run walkthrough before resuming content generation');
      error.status = 503;
      throw error;
    }
    const job = await this.db.getGenerationJob(jobId);
    if (!job) {
      const error = new Error('Generation job not found');
      error.status = 404;
      throw error;
    }
    if (!['failed', 'interrupted'].includes(job.status)) {
      const error = new Error('Only failed or interrupted generation jobs can be resumed');
      error.status = 409;
      throw error;
    }
    if (this.activeJobs.has(job.id)) {
      const error = new Error('This generation job is already running');
      error.status = 409;
      throw error;
    }
    const maxConcurrent = Math.max(1, parseInt(process.env.MAX_CONCURRENT_JOBS || '1', 10));
    if (this.activeJobs.size >= maxConcurrent) {
      const error = new Error(`Generation is busy (${this.activeJobs.size}/${maxConcurrent} active jobs). Try again when the current job finishes.`);
      error.status = 429;
      throw error;
    }
    if (['scheduler', 'autonomous_operator'].includes(job.source)) {
      await this.readiness?.assertReady('Automated generation recovery');
    }

    const checkpoints = await this.db.listGenerationCheckpoints(job.id);
    const resumeFrom = options.stage || this.recovery.resumePoint(checkpoints);
    if (!GENERATION_STAGES.includes(resumeFrom)) {
      const error = new Error('Resume stage is not supported');
      error.status = 400;
      throw error;
    }
    if (options.stage) await this.recovery.resetFrom(job.id, resumeFrom);
    const input = {
      topic: job.topic,
      style: job.style,
      length: job.length || 'medium',
      strategyContext: job.details?.strategyContext || {}
    };
    const updated = await this.db.updateGenerationJob(job.id, {
      status: 'queued',
      stage: resumeFrom,
      error: null,
      cancelRequested: false,
      completedAt: null,
      details: {
        resumeCount: Number(job.details?.resumeCount || 0) + 1,
        resumeFrom,
        failedStage: null
      }
    });
    const work = this.runGenerationJob(job.id, input)
      .catch(error => this.logger.error(`Resumed generation job ${job.id} failed:`, error))
      .finally(() => this.activeJobs.delete(job.id));
    this.activeJobs.set(job.id, work);
    return updated;
  }

  async waitForGenerationJob(jobId) {
    const work = this.activeJobs.get(jobId);
    if (work) await work;
    const job = await this.db.getGenerationJob(jobId);
    if (!job) throw new Error(`Generation job ${jobId} was not found after it ran`);
    return job;
  }

  async queueScheduledContent(input = {}) {
    const strategy = await this.db.getChannelStrategy();
    if (strategy?.status === 'active') {
      const weeklyOutput = await this.db.getRow(
        `SELECT COUNT(*) AS count FROM generation_jobs
         WHERE source = 'autonomous_operator' AND status = 'completed'
         AND created_at >= datetime('now', '-7 days')`
      );
      const remaining = Math.max(1, strategy.cadence_per_week - Number(weeklyOutput?.count || 0));
      return this.autonomous.start({
        ...strategy,
        videos_per_run: Math.min(strategy.videos_per_run, remaining)
      });
    }
    return this.startGenerationJob(input);
  }

  async runGenerationJob(jobId, input) {
    try {
      await this.db.updateGenerationJob(jobId, { status: 'running', progress: 2, error: null, completedAt: null });
      const result = await this.generateContent(input.topic, input.style, input.length, {
        jobId,
        strategyContext: input.strategyContext
      });
      await this.db.updateGenerationJob(jobId, {
        status: 'completed',
        stage: result.reviewStatus === 'approved' ? 'scheduled' : result.reviewStatus,
        progress: 100,
        productionId: result.contentId,
        title: result.title,
        details: { reviewStatus: result.reviewStatus, qualityScore: result.qualityScore },
        completedAt: new Date().toISOString()
      });
      await this.db.setSetting('last_content_generation', new Date().toISOString());
      return result;
    } catch (error) {
      const cancelled = error.code === 'JOB_CANCELLED';
      const current = await this.db.getGenerationJob(jobId);
      const failedStage = current?.stage || 'starting';
      await this.db.updateGenerationJob(jobId, {
        status: cancelled ? 'cancelled' : 'failed',
        stage: failedStage,
        error: error.message,
        details: { failedStage },
        completedAt: new Date().toISOString()
      });
      await this.operator.notify({
        type: cancelled ? 'generation_cancelled' : 'generation_failure',
        level: cancelled ? 'warning' : 'error',
        title: cancelled ? 'Generation cancelled' : 'Generation failed',
        message: error.message,
        data: { jobId }
      });
      throw error;
    }
  }

  async updateJobStage(jobId, stage, progress, details = {}) {
    if (!jobId) return;
    const job = await this.db.getGenerationJob(jobId);
    if (job?.cancelRequested) {
      const error = new Error(job.details?.cancelReason || 'Generation cancelled by operator');
      error.code = 'JOB_CANCELLED';
      throw error;
    }
    await this.db.updateGenerationJob(jobId, { stage, progress, details });
  }

  async generateContent(topic = null, style = null, length = 'medium', options = {}) {
    this.logger.info('Starting content generation pipeline...');
    const { jobId = null } = options;
    const strategyContext = options.strategyContext || {};
    const profile = await this.db.getChannelProfile() || {};
    const lengthLabels = { short: '2-4 minutes', medium: process.env.DEFAULT_VIDEO_LENGTH || '8-12 minutes', long: process.env.LONG_VIDEO_LENGTH || '20-30 minutes' };

    // Format (long/Short) and publishing slot travel with the job (utils/formato.js).
    const formato = normalizaFormato(strategyContext.format);
    const franja = strategyContext.franja || null;
    const temaPedido = topic || (franja ? `Oración de la ${franja.toLowerCase()}` : null);

    // Step 1: Strategy
    const strategy = await this.runGenerationStage(jobId, 'strategy', 10, async () => {
      const generated = await this.agents.strategy.generateContentStrategy(temaPedido);
      const contentStyles = new Set(['tutorial', 'explainer', 'list', 'review', 'story']);
      const requestedStyle = style || profile.default_style || null;
      if (requestedStyle && contentStyles.has(requestedStyle.toLowerCase())) {
        generated.contentType = requestedStyle.charAt(0).toUpperCase() + requestedStyle.slice(1).toLowerCase();
      }
      generated.requestedStyle = requestedStyle;
      generated.requestedLengthKey = length;
      generated.requestedLength = formato === SHORT ? SHORT_LENGTH : (lengthLabels[length] || lengthLabels.medium);
      generated.contentFormat = formato;
      generated.franja = franja;
      generated.publishSlot = strategyContext.publishSlot || null;
      generated.angle = strategyContext.angle || generated.angle;
      generated.planRationale = strategyContext.rationale || null;
      generated.targetAudience = strategyContext.audience || profile.target_audience || generated.targetAudience;
      generated.brandVoice = profile.brand_voice || null;
      generated.channelGoal = strategyContext.objective || profile.goal || null;
      generated.channelValueProposition = strategyContext.valueProposition || null;
      generated.channelConstraints = strategyContext.constraints || null;
      generated.contentPillar = strategyContext.pillar || null;
      generated.callToAction = profile.call_to_action || null;
      generated.researchSources = Array.isArray(strategyContext.researchSources)
        ? strategyContext.researchSources
        : [];
      return generated;
    });
    this.logger.info(`Strategy generated: ${strategy.topic}`);
    // 12/10/2026: the Shorts scriptwriter sees the channel's most-viewed Shorts at 7 days (the
    // shape, not the text).
    if (formato === SHORT) strategy.ejemplosQueFuncionan = await this.db.getBestShortTitles?.(5).catch(() => []) || [];

    // Step 2: Script Writing
    const script = await this.runGenerationStage(
      jobId,
      'script',
      25,
      () => this.agents.scriptWriter.generateScript(strategy)
    );
    this.logger.info(`Script generated: ${script.title}`);
    // Without AI the script is the generic template: don't spend voice or render on something
    // quality control is going to block anyway.
    if (String(process.env.ALLOW_TEMPLATE_CONTENT || '').toLowerCase() !== 'on' &&
        script?.metadata?.generationSource !== 'ai') {
      throw new Error('AI script generation failed (check the AI text provider credits); refusing to produce a template video');
    }

    // Step 3: Thumbnail Design
    const thumbnail = await this.runGenerationStage(
      jobId,
      'thumbnail',
      40,
      // On Shorts YouTube shows a frame, not the thumbnail: no point paying for an image.
      async () => (formato === SHORT
        ? { skipped: true, reason: 'short' }
        : this.agents.thumbnailDesigner.generateThumbnail(script))
    ).then(artifact => (artifact?.skipped ? null : artifact));
    this.logger.info('Thumbnail generated');

    // Step 4: SEO Optimization
    // 05/10/2026: the AI repeated titles («Oración de la noche para dormir en paz») and the
    // duplicate was only caught AFTER paying for voice and editing (9 videos unpublished). Now
    // it's given the titles already used and it's checked here, before the voice: if it comes out
    // repeated it retries once and, if it still does, it stops for free.
    strategy.titulosUsados = await this.db.getRecentPublicationTitles?.(40).catch(() => []) || [];
    const seoData = await this.runGenerationStage(
      jobId,
      'seo',
      52,
      async () => {
        let seo = await this.agents.seoOptimizer.optimize(script, strategy);
        let repetido = seo?.title ? await this.db.findDuplicatePublicationTitle(seo.title, null) : null;
        if (repetido) {
          this.logger.warn(`Repeated title («${seo.title}»): asking for another before spending on voice`);
          strategy.titulosUsados = [repetido.title, ...strategy.titulosUsados];
          seo = await this.agents.seoOptimizer.optimize(script, strategy);
          repetido = seo?.title ? await this.db.findDuplicatePublicationTitle(seo.title, null) : null;
        }
        if (repetido) throw new Error(`The title «${seo.title}» already exists; stopping before the voice to avoid spending`);
        return seo;
      }
    );
    this.logger.info('SEO optimization complete');

    // Step 5: Production Management
    const productionData = await this.runGenerationStage(
      jobId,
      'production',
      62,
      () => this.agents.production.processContent({ strategy, script, thumbnail, seo: seoData, jobId })
    );
    this.logger.info('Production processing complete');

    // Re-persist reused production artifacts in case a restart happened between checkpointing and persistence.
    const contentId = await this.db.saveProductionData(productionData);
    await this.db.saveProductionSnapshot(productionData);
    if (!this.provenance) this.provenance = new ProvenanceService(this.db);
    productionData.provenance = await this.provenance.initialize(contentId, productionData);
    productionData.discoverability = this.discoverability
      ? await this.discoverability.auditProduction(productionData, profile, 'youtube')
      : null;
    this.logger.info(`Content saved with ID: ${contentId}`);

    // Step 6: Quality and approval gate
    return this.runGenerationStage(jobId, 'quality_review', 90, async () => {
      const approvalRequired = await this.db.getSetting('approval_required') !== 'false';
      const packagingExperiment = approvalRequired
        ? await this.preparePackagingExperiment(thumbnail, productionData, seoData, script)
        : null;
      const quality = await this.operator.runQualityChecks(productionData, profile);
      const reviewStatus = quality.passed
        ? (approvalRequired ? 'needs_review' : 'approved')
        : 'needs_attention';
      await this.db.saveContentReview(contentId, {
        status: reviewStatus,
        qualityChecks: quality.checks,
        editorData: packagingExperiment ? {
          packagingExperiment,
          selectedTitleVariant: 0,
          selectedThumbnailVariant: 0
        } : {},
        reviewNotes: quality.passed ? null : `Blocking checks failed: ${quality.blockingFailures.join(', ')}`,
        reviewedAt: approvalRequired ? null : new Date().toISOString()
      });

      let scheduleEntry = null;
      if (reviewStatus === 'approved') {
        scheduleEntry = await this.agents.publishing.scheduleContent(productionData);
        await this.db.updateProductionStatus(contentId, scheduleEntry ? 'scheduled' : productionData.status);
      } else {
        await this.db.updateProductionStatus(contentId, reviewStatus);
        await this.operator.notify({
          type: 'review_required',
          level: quality.passed ? 'info' : 'warning',
          title: quality.passed ? 'Content ready for review' : 'Content needs attention',
          message: `${script.title} ${quality.passed ? 'is ready for approval' : 'failed one or more quality checks'}`,
          data: { contentId, qualityScore: quality.score }
        });
      }

      return {
        contentId,
        title: script.title,
        status: productionData.status,
        reviewStatus,
        qualityScore: quality.score,
        scheduledFor: scheduleEntry ? scheduleEntry.publishTime : null
      };
    });
  }

  async runGenerationStage(jobId, stage, progress, producer) {
    if (!jobId) {
      await this.updateJobStage(jobId, stage, progress);
      return producer();
    }
    if (!this.recovery) {
      this.recovery = new GenerationRecoveryService(this.db, {
        logger: this.logger,
        updateJobStage: (...args) => this.updateJobStage(...args)
      });
    }
    return this.recovery.run(jobId, stage, progress, producer);
  }

  validateEditorData(input = {}, existing = {}) {
    const output = { ...existing };
    if (input.title !== undefined) {
      const title = String(input.title).trim();
      if (!title || title.length > 100) throw new Error('Title must be between 1 and 100 characters');
      output.title = title;
    }
    if (input.description !== undefined) {
      const description = String(input.description).trim();
      if (description.length > 5000) throw new Error('Description must be 5,000 characters or less');
      output.description = description;
    }
    if (input.tags !== undefined) {
      const tags = Array.isArray(input.tags)
        ? input.tags
        : String(input.tags).split(',');
      output.tags = tags.map(tag => String(tag).trim()).filter(Boolean).slice(0, 30);
    }
    if (input.publishTime !== undefined) {
      const date = new Date(input.publishTime);
      if (Number.isNaN(date.getTime())) throw new Error('Publish time must be a valid date');
      output.publishTime = date.toISOString();
    }
    if (input.privacyStatus !== undefined) {
      if (!['private', 'unlisted', 'public'].includes(input.privacyStatus)) throw new Error('Invalid privacy status');
      output.privacyStatus = input.privacyStatus;
    }
    if (input.factChecked !== undefined) output.factChecked = input.factChecked === true;
    if (input.rightsConfirmed !== undefined) output.rightsConfirmed = input.rightsConfirmed === true;
    const experiment = output.packagingExperiment;
    if (input.selectedTitleVariant !== undefined) {
      const selected = Number(input.selectedTitleVariant);
      if (!Number.isInteger(selected) || !experiment?.titleVariants?.[selected]) {
        throw new Error('Selected title variant is invalid');
      }
      output.selectedTitleVariant = selected;
    }
    if (input.selectedThumbnailVariant !== undefined) {
      const selected = Number(input.selectedThumbnailVariant);
      if (!Number.isInteger(selected) || !experiment?.thumbnailVariants?.[selected]) {
        throw new Error('Selected thumbnail variant is invalid');
      }
      output.selectedThumbnailVariant = selected;
    }
    return output;
  }

  buildTitleExperimentVariants(title) {
    const control = String(title || '').trim().slice(0, 100);
    const withoutPunctuation = control.replace(/[.!?]+$/, '');
    return [
      { label: 'Control', title: control },
      { label: 'Step-by-step', title: `${withoutPunctuation}: Step-by-Step`.slice(0, 100) },
      { label: 'Curiosity', title: `${withoutPunctuation}: What Most People Miss`.slice(0, 100) }
    ];
  }

  async preparePackagingExperiment(thumbnail, productionData, seoData, script) {
    const approved = await this.db.listLearningRecommendations({ status: 'approved', limit: 25 });
    const recommendation = approved.find(item => item.proposedChange?.experiment === 'title_thumbnail_variant');
    if (!recommendation) return null;
    try {
      const generated = await this.agents.thumbnailDesigner.generateABVariants(thumbnail.concept);
      return {
        sourceRecommendationId: recommendation.id,
        hypothesis: recommendation.title,
        status: 'draft',
        titleVariants: this.buildTitleExperimentVariants(seoData.title || script.title),
        thumbnailVariants: [
          { label: 'Control', path: productionData.assets?.thumbnail?.path, concept: thumbnail.concept },
          ...generated
        ],
        createdAt: new Date().toISOString()
      };
    } catch (error) {
      this.logger.warn(`Packaging experiment preparation failed without blocking production: ${error.message}`);
      return null;
    }
  }

  validateProfile(input) {
    const textFields = ['channelName', 'goal', 'targetAudience', 'brandVoice', 'defaultStyle', 'callToAction', 'visualStyle', 'timezone'];
    const result = {};
    for (const field of textFields) {
      if (input[field] !== undefined) {
        const value = String(input[field]).trim();
        if (value.length > 500) throw new Error(`${field} is too long`);
        result[field] = value;
      }
    }
    if (input.bannedTopics !== undefined) {
      const topics = Array.isArray(input.bannedTopics) ? input.bannedTopics : String(input.bannedTopics).split(',');
      result.bannedTopics = topics.map(topic => String(topic).trim()).filter(Boolean).slice(0, 50);
    }
    return result;
  }

  decorateContentBundle(bundle) {
    const experiment = bundle.editorData?.packagingExperiment;
    const sceneLabels = new Map((bundle.scenes || []).map(scene => [scene.id, scene.label]));
    return {
      ...bundle,
      scenes: (bundle.scenes || []).map(scene => this.scenes
        ? this.scenes.decorateScene(scene, bundle.id)
        : scene),
      shorts: (bundle.shorts || []).map(clip => ({
        ...clip,
        sourceSceneLabels: clip.sourceSceneIds.map(id => sceneLabels.get(id)).filter(Boolean),
        assetUrls: {
          video: clip.outputPath ? `/api/content/${bundle.id}/shorts/${clip.id}/asset/video` : null,
          captions: clip.captionsPath ? `/api/content/${bundle.id}/shorts/${clip.id}/asset/captions` : null
        }
      })),
      assetUrls: {
        video: bundle.assets?.finalVideo?.path && !bundle.assets?.finalVideo?.simulated ? `/api/content/${bundle.id}/asset/video` : null,
        thumbnail: bundle.assets?.thumbnail?.path ? `/api/content/${bundle.id}/asset/thumbnail` : null,
        experimentThumbnails: (experiment?.thumbnailVariants || []).map((_variant, index) =>
          `/api/content/${bundle.id}/asset/experiment-thumbnail-${index}`
        ),
        captions: bundle.assets?.captions?.path ? `/api/content/${bundle.id}/asset/captions` : null,
        script: bundle.assets?.script?.originalPath ? `/api/content/${bundle.id}/asset/script` : null
      }
    };
  }

  async refreshContentReview(productionId, reviewNotes) {
    const bundle = await this.db.getProductionBundle(productionId);
    if (!bundle) return null;
    const profile = await this.db.getChannelProfile() || {};
    const quality = await this.operator.runQualityChecks({
      ...bundle,
      scheduledPublishTime: bundle.scheduled_publish_time
    }, profile);
    const status = quality.passed ? 'needs_review' : 'needs_attention';
    return this.db.saveContentReview(productionId, {
      status,
      editorData: { ...(bundle.editorData || {}), factChecked: false, rightsConfirmed: false },
      qualityChecks: quality.checks,
      reviewNotes: reviewNotes || (quality.passed ? null : `Blocking checks failed: ${quality.blockingFailures.join(', ')}`),
      reviewedAt: null
    });
  }

  async approveContent(productionId, input) {
    const bundle = await this.db.getProductionBundle(productionId);
    if (!bundle) {
      const error = new Error('Content not found');
      error.status = 404;
      throw error;
    }
    if (bundle.schedule?.status === 'published') {
      const error = new Error('Content is already published');
      error.status = 409;
      throw error;
    }

    const editorData = this.validateEditorData(input, bundle.editorData);
    const packagingExperiment = editorData.packagingExperiment;
    const thumbnailVariant = packagingExperiment?.thumbnailVariants?.[editorData.selectedThumbnailVariant];
    const titleVariant = packagingExperiment?.titleVariants?.[editorData.selectedTitleVariant];
    if (titleVariant && input.title === undefined) editorData.title = titleVariant.title;
    if (!editorData.factChecked || !editorData.rightsConfirmed) {
      const error = new Error('Confirm the factual review and media rights checks before approval');
      error.status = 409;
      throw error;
    }
    const productionData = {
      id: bundle.id,
      status: bundle.status,
      strategy: bundle.strategy,
      script: { ...bundle.script, title: editorData.title || bundle.script.title },
      thumbnail: bundle.thumbnail,
      seo: {
        ...bundle.seo,
        title: editorData.title || bundle.seo.title,
        description: editorData.description || bundle.seo.description,
        tags: editorData.tags || bundle.seo.tags
      },
      assets: thumbnailVariant
        ? { ...bundle.assets, thumbnail: { ...bundle.assets.thumbnail, path: thumbnailVariant.path } }
        : bundle.assets,
      timeline: bundle.timeline,
      scheduledPublishTime: editorData.publishTime || input.publishTime || bundle.scheduled_publish_time,
      priority: bundle.priority,
      estimatedDuration: bundle.estimated_duration,
      privacyStatus: editorData.privacyStatus || process.env.DEFAULT_PRIVACY_STATUS || 'private',
      provenance: bundle.provenance,
      containsSyntheticMedia: bundle.provenance?.containsSyntheticMedia === true,
      scenes: bundle.scenes || []
    };
    const profile = await this.db.getChannelProfile() || {};
    const quality = await this.operator.runQualityChecks(productionData, profile);
    if (!quality.passed) {
      await this.db.saveContentReview(bundle.id, {
        status: 'needs_attention', editorData, qualityChecks: quality.checks,
        reviewNotes: `Blocking checks failed: ${quality.blockingFailures.join(', ')}`
      });
      const error = new Error('Content still has blocking quality failures');
      error.status = 409;
      error.quality = quality;
      throw error;
    }

    let scheduleEntry = bundle.schedule;
    if (!scheduleEntry) {
      scheduleEntry = await this.agents.publishing.scheduleContent(productionData);
    } else if (scheduleEntry.status !== 'published') {
      scheduleEntry.title = productionData.seo?.title || productionData.script.title;
      scheduleEntry.publishTime = productionData.scheduledPublishTime;
      scheduleEntry.status = 'scheduled';
      scheduleEntry.metadata = {
        ...scheduleEntry.metadata,
        seo: productionData.seo,
        thumbnail: productionData.assets.thumbnail,
        shortCover: productionData.assets.shortCover || null,
        video: productionData.assets.finalVideo,
        audio: productionData.assets.audio,
        captions: productionData.assets.captions,
        privacyStatus: editorData.privacyStatus || process.env.DEFAULT_PRIVACY_STATUS || 'private',
        containsSyntheticMedia: productionData.containsSyntheticMedia
      };
      await this.db.updateScheduleEntry(scheduleEntry);
      await this.agents.publishing.loadPublishQueue();
    }
    if (!scheduleEntry) {
      const error = new Error('A real MP4 is required before content can be approved for scheduling');
      error.status = 409;
      throw error;
    }

    await this.db.saveContentReview(bundle.id, {
      status: 'approved', editorData, qualityChecks: quality.checks,
      reviewNotes: input.reviewNotes || 'Approved by operator', reviewedAt: new Date().toISOString()
    });
    await this.db.updateProductionStatus(bundle.id, 'scheduled');
    await this.operator.notify({
      type: 'content_approved', level: 'success', title: 'Content approved',
      message: `${productionData.script.title} is scheduled for ${scheduleEntry.publishTime}`,
      data: { productionId, publishTime: scheduleEntry.publishTime }
    });
    return { productionId, reviewStatus: 'approved', qualityScore: quality.score, schedule: scheduleEntry };
  }

  async start() {
    const initialized = await this.initialize();
    
    if (!initialized) {
      console.log(chalk.red('\n❌ Failed to initialize. Please check your configuration.'));
      process.exit(1);
    }
    
    const PORT = process.env.PORT || 3456;
    this.app.listen(PORT, () => {
      console.log(chalk.green(`\n✅ Oraflow running on port ${PORT}`));
      console.log(chalk.gray('─'.repeat(50)));
      console.log(chalk.white('📊 Dashboard: ') + chalk.cyan(`http://localhost:${PORT}`));
      console.log(chalk.white('🔧 API Health: ') + chalk.cyan(`http://localhost:${PORT}/health`));
      console.log(chalk.white('📅 Schedule: ') + chalk.cyan(`http://localhost:${PORT}/schedule`));
      console.log(chalk.white('📈 Analytics: ') + chalk.cyan(`http://localhost:${PORT}/analytics`));
      console.log(chalk.gray('─'.repeat(50)));
      if (this.setupRequired) {
        console.log(chalk.yellow('\n⚙️  Setup is required. The dashboard is available; run npm run walkthrough to enable generation.'));
      } else {
        console.log(chalk.yellow('\n🤖 Automation is active. Approved content will be published on schedule.'));
      }
    });
  }
}

// Start the agent
if (require.main === module) {
  const agent = new YouTubeAutomationAgent();
  agent.start().catch(error => {
    console.error(chalk.red('Fatal error:'), error);
    process.exit(1);
  });
}

module.exports = { YouTubeAutomationAgent };
