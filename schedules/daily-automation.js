const cron = require('node-cron');
const { Logger } = require('../utils/logger');
const { nextFreeSlot } = require('../utils/daily-slot');

class DailyAutomation {
  constructor(agents, database, options = {}) {
    this.agents = agents;
    this.db = database;
    this.logger = new Logger('DailyAutomation');
    this.scheduledTasks = new Map();
    this.isEnabled = true;
    this.healthCheckInterval = null;
    this.lastHealthCheck = null;
    this.generateContent = options.generateContent || null;
    this.engagement = options.engagement || null;
    this.experiments = options.experiments || null;
  }

  async initialize() {
    this.logger.info('Initializing daily automation scheduler...');
    
    await this.setupScheduledTasks();
    
    // Start monitoring loop
    this.startMonitoringLoop();
    
    this.logger.success('Daily automation initialized successfully');
    return true;
  }

  async setupScheduledTasks() {
    // Every 2 hours: if any slot in the next 24 h (long videos 04:00/18:30, Shorts per the
    // daily_shorts_time setting, today 05:00 and 19:00) is empty, it generates the nearest one.
    // Otherwise it does nothing.
    this.scheduledTasks.set('daily-content-generation', 
      cron.schedule('0 */2 * * *', async () => {
        if (this.isEnabled) {
          await this.runDailyContentGeneration();
        }
      }, { scheduled: false })
    );

    // Publishing queue processing every 15 minutes
    this.scheduledTasks.set('publish-queue-processing',
      cron.schedule('*/15 * * * *', async () => {
        if (this.isEnabled) {
          await this.processPublishQueue();
        }
      }, { scheduled: false })
    );

    // Analytics collection at 9:00 AM daily
    this.scheduledTasks.set('daily-analytics',
      cron.schedule('0 9 * * *', async () => {
        if (this.isEnabled) {
          await this.collectDailyAnalytics();
        }
      }, { scheduled: false })
    );

    // Weekly strategy review on Sundays at 8:00 AM
    this.scheduledTasks.set('weekly-strategy-review',
      cron.schedule('0 8 * * 0', async () => {
        if (this.isEnabled) {
          await this.weeklyStrategyReview();
        }
      }, { scheduled: false })
    );

    // Optimization tasks daily at 10:00 PM
    this.scheduledTasks.set('daily-optimization',
      cron.schedule('0 22 * * *', async () => {
        if (this.isEnabled) {
          await this.runDailyOptimization();
        }
      }, { scheduled: false })
    );

    // Disk cleanup every day at 3:15 AM (utils/limpieza-disco.js): editing leftovers, videos
    // published 3+ days ago and the clip library above its cap.
    this.scheduledTasks.set('disk-cleanup',
      cron.schedule('15 3 * * *', async () => {
        try {
          const path = require('path');
          const { limpiaDisco } = require('../utils/limpieza-disco');
          await limpiaDisco({ db: this.db, dataRoot: path.join(__dirname, '..', 'data'), logger: this.logger });
        } catch (error) {
          this.logger.warn(`Limpieza de disco fallida: ${error.message}`);
        }
      }, { scheduled: false })
    );

    // The channel's comment on every video that's already public
    // (utils/comentario-fijo.js).
    // Daily prayer carousel on Instagram (utils/carrusel-diario.js).
    this.scheduledTasks.set('instagram-carousel',
      cron.schedule('10,25,40,55 * * * *', async () => {
        if (!this.isEnabled) return;
        try {
          const { publicaCarruselDelDia } = require('../utils/carrusel-diario');
          const ai = this.agents.scriptWriter?.aiTextService || this.agents.strategy?.aiTextService;
          if (ai) await publicaCarruselDelDia({ db: this.db, ai, logger: this.logger });
        } catch (error) {
          this.logger.warn(`Carrusel de Instagram: ${error.message}`);
        }
      }, { scheduled: false })
    );

    // "Prayer of the day": a short Reel on Instagram and Facebook (utils/oracion-corta.js).
    this.scheduledTasks.set('oracion-corta',
      cron.schedule('2,17,32,47 * * * *', async () => {
        if (!this.isEnabled) return;
        try {
          const { publicaOracionDelDia } = require('../utils/oracion-corta');
          const ai = this.agents.scriptWriter?.aiTextService || this.agents.strategy?.aiTextService;
          if (ai) await publicaOracionDelDia({ db: this.db, ai, logger: this.logger });
        } catch (error) {
          this.logger.warn(`Prayer of the day: ${error.message}`);
        }
      }, { scheduled: false })
    );

    // Dated morning prayer (07:00) and a quote to share (20:00) on IG + FB (utils/piezas-diarias.js).
    this.scheduledTasks.set('piezas-diarias',
      cron.schedule('7,22,37,52 * * * *', async () => {
        if (!this.isEnabled) return;
        const { publicaPieza } = require('../utils/piezas-diarias');
        const ai = this.agents.scriptWriter?.aiTextService || this.agents.strategy?.aiTextService;
        for (const tipo of ai ? ['fecha', 'frase'] : []) {
          try {
            await publicaPieza(tipo, { db: this.db, ai, logger: this.logger });
          } catch (error) {
            this.logger.warn(`Pieza diaria (${tipo}): ${error.message}`);
          }
        }
        try {
          // A story on IG + FB for every long video that's already public (utils/historia-diaria.js).
          await require('../utils/historia-diaria').publicaHistorias({ db: this.db, logger: this.logger });
        } catch (error) {
          this.logger.warn(`Historia diaria: ${error.message}`);
        }
      }, { scheduled: false })
    );

    // Automatic reply to comments that are just "Amén" (utils/amen-automatico.js).
    this.scheduledTasks.set('amen-automatico',
      cron.schedule('*/10 * * * *', async () => { // cada vuelta real: 30-90 min al azar (amen_proxima)
        if (!this.isEnabled) return;
        try {
          const amen = require('../utils/amen-automatico');
          const { tokenInstagram } = require('../utils/instagram-reels');
          const { facebookConfig } = require('../utils/facebook-reels');
          const youtube = this.agents.publishing?.youtube;
          const token = await tokenInstagram(this.db, process.env);
          const fb = facebookConfig(process.env);
          // With the private-message prayer on, Instagram is handled by
          // utils/mensaje-amen.js (any comment); otherwise Instagram only replies to
          // the «Amén» ones.
          const dmIG = token && await this.db.getSetting('dm_amen_enabled') === 'true';
          const redes = [
            // YouTube off until the owner turns it on (06/10/2026): amen_youtube_enabled='true'.
            youtube && await this.db.getSetting('amen_youtube_enabled') === 'true' && amen.youtubeRed({ youtube, db: this.db }),
            token && !dmIG && amen.instagramRed({ token }),
            fb && amen.facebookRed({ config: fb })
          ].filter(Boolean);
          // Comments already handled by a Messages rule aren't touched here (utils/mensajes/motor.js).
          const motor = require('../utils/mensajes/motor');
          const cuentaDe = { instagram: 'principal-instagram', facebook: 'principal-facebook', youtube: 'principal-youtube' };
          for (const red of redes.filter(r => cuentaDe[r.nombre])) {
            const leer = red.comentarios.bind(red);
            red.comentarios = async opts => motor.filtraAtendidos(this.db, cuentaDe[red.nombre], await leer(opts));
          }
          // First the channel's comment on new Instagram posts (the owner pins it by hand).
          if (token) {
            await require('../utils/comentario-ig').comentaNuevas({ db: this.db, token, logger: this.logger })
              .catch(error => this.logger.warn(`Comentario de Instagram: ${error.message}`));
          }
          // Christian comments that aren't an «Amén» get an AI reply (utils/respuesta-ia.js, 07/10/2026).
          const ai = this.agents.scriptWriter?.aiTextService || this.agents.strategy?.aiTextService;
          const escritor = require('../utils/respuesta-ia').escritorDeRespuestas(ai, { logger: this.logger });
          await amen.respondeAmenes({ db: this.db, redes, logger: this.logger, escritor });
        } catch (error) {
          this.logger.warn(`Automatic Amén: ${error.message}`);
        }
      }, { scheduled: false })
    );

    // Instagram: a prayer by private message + a notice ~5 min after the comment (05/10/2026).
    // Every 5 min; only comments 4+ min old, so the reply arrives between 4 and 9 min.
    this.scheduledTasks.set('instagram-privado',
      cron.schedule('*/5 * * * *', async () => {
        if (!this.isEnabled) return;
        // First the per-post rules of ALL accounts (Messages section, 15/10/2026); whatever
        // they handle is no longer touched by the private-message prayer below.
        const motor = require('../utils/mensajes/motor');
        // Never two rounds at once: the old engine below would also answer what the rules are
        // still sending, and the same person would get two private messages.
        if (this.mensajesReglasEnCurso) return;
        this.mensajesReglasEnCurso = true;
        try {
          await motor.ejecutaTodas({ db: this.db, logger: this.logger, youtube: this.agents.publishing?.youtube || null })
            .catch(error => this.logger.warn(`Mensajes (reglas): ${error.message}`));
          const token = await require('../utils/instagram-reels').tokenInstagram(this.db, process.env);
          if (!token || await this.db.getSetting('dm_amen_enabled') !== 'true') return;
          const amen = require('../utils/amen-automatico');
          const ig = amen.instagramRed({ token });
          const ahora = Date.now();
          const comentarios = (await motor.filtraAtendidos(this.db, 'principal-instagram', await ig.comentarios({ now: new Date() })))
            .filter(c => ahora - Date.parse(c.fecha) >= 4 * 60000);
          await require('../utils/mensaje-amen').enviaMensajesAmen({
            db: this.db, token, comentarios, esAmen: amen.seResponde, respuestaAmen: amen.respuestaPara,
            responde: ig.responde, logger: this.logger
          });
        } catch (error) {
          this.logger.warn(`Instagram (private-message prayer): ${error.message}`);
        } finally {
          this.mensajesReglasEnCurso = false;
        }
      }, { scheduled: false })
    );

    // Messages: Telegram chats (polling, no public webhook) with their automatic replies, and the
    // weekly renewal of Instagram tokens added in Messages → Accounts (15/10/2026).
    this.scheduledTasks.set('mensajes-chats',
      cron.schedule('* * * * *', async () => {
        // A slow round (Telegram not answering) must not overlap the next one: both would read
        // the same messages and answer twice.
        if (!this.isEnabled || this.mensajesChatsEnCurso) return;
        this.mensajesChatsEnCurso = true;
        try {
          const motor = require('../utils/mensajes/motor');
          await motor.recogeChats({ db: this.db, logger: this.logger })
            .catch(error => this.logger.warn(`Mensajes (chats): ${error.message}`));
          const ahora = new Date();
          if (ahora.getMinutes() === 7) {
            await require('../utils/mensajes/cuentas').renuevaTokensIG(this.db, { logger: this.logger })
              .catch(error => this.logger.warn(`Mensajes (renovar tokens): ${error.message}`));
          }
          // From 4:23 on, the first free round of the day (if 4:23 itself was busy it isn't lost).
          const dia = ahora.toDateString();
          if (ahora.getHours() * 60 + ahora.getMinutes() >= 4 * 60 + 23 && this.mensajesLimpiezaDia !== dia) {
            this.mensajesLimpiezaDia = dia;
            await motor.limpia(this.db)
              .then(r => (r.ejecuciones || r.chats) && this.logger.info(`Messages: cleaned ${r.ejecuciones} old runs and ${r.chats} old chat messages`))
              .catch(error => this.logger.warn(`Mensajes (limpieza): ${error.message}`));
          }
        } finally {
          this.mensajesChatsEnCurso = false;
        }
      }, { scheduled: false })
    );

    // Instagram: «BORRAR»/«DELETE» by private message deletes that person's data
    // (utils/borrado-datos.js).
    // The data-deletion page promises it; it's a Meta app requirement (07/10/2026).
    this.scheduledTasks.set('borrado-datos',
      cron.schedule('17,47 * * * *', async () => {
        if (!this.isEnabled) return;
        try {
          const token = await require('../utils/instagram-reels').tokenInstagram(this.db, process.env);
          await require('../utils/borrado-datos').procesaBorrados({ db: this.db, token, logger: this.logger });
        } catch (error) {
          this.logger.warn(`Borrado de datos: ${error.message}`);
        }
      }, { scheduled: false })
    );

    // Recommended videos in the descriptions: the most-watched long video and Short (utils/destacados.js).
    this.scheduledTasks.set('videos-destacados',
      cron.schedule('20 3 * * *', async () => {
        const youtube = this.agents.publishing?.youtube;
        if (!this.isEnabled || !youtube) return;
        try {
          if (await require('../utils/cuota-youtube').agotada(this.db)) return; // the remaining quota is for uploading videos
          await require('../utils/destacados').actualizaDestacados({ youtube, db: this.db });
        } catch (error) {
          this.logger.warn(`Featured videos: ${error.message}`);
        }
      }, { scheduled: false })
    );

    this.scheduledTasks.set('channel-comment',
      cron.schedule('5,35 * * * *', async () => {
        const youtube = this.agents.publishing?.youtube;
        if (!this.isEnabled || !youtube) return;
        try {
          const { comentaPublicados } = require('../utils/comentario-fijo');
          if (await require('../utils/cuota-youtube').agotada(this.db)) return; // the remaining quota is for uploading videos
          await comentaPublicados({ youtube, db: this.db, logger: this.logger });
        } catch (error) {
          this.logger.warn(`Channel comment failed: ${error.message}`);
        }
      }, { scheduled: false })
    );

    // Database maintenance weekly on Saturdays at 3:00 AM
    this.scheduledTasks.set('database-maintenance',
      cron.schedule('0 3 * * 6', async () => {
        if (this.isEnabled) {
          await this.databaseMaintenance();
        }
      }, { scheduled: false })
    );

    // Audience comment sync every 4 hours; the service's own taper decides which videos are due
    this.scheduledTasks.set('audience-engagement-sync',
      cron.schedule('0 */4 * * *', async () => {
        if (this.isEnabled && !await require('../utils/cuota-youtube').agotada(this.db)) { // quota for uploading videos
          await this.collectAudienceEngagement();
        }
      }, { scheduled: false })
    );

    // Collect controlled experiment evidence and advance only pre-approved arms.
    this.scheduledTasks.set('growth-experiment-refresh',
      cron.schedule('30 */4 * * *', async () => {
        if (this.isEnabled && !await require('../utils/cuota-youtube').agotada(this.db)) { // quota for uploading videos
          await this.refreshGrowthExperiments();
        }
      }, { scheduled: false })
    );

    // Start all scheduled tasks
    this.scheduledTasks.forEach((task, name) => {
      task.start();
      this.logger.info(`Started scheduled task: ${name}`);
    });
  }

  async runDailyContentGeneration() {
    try {
      this.logger.info('Starting daily content generation...');
      
      const timer = this.logger.startTimer('Daily Content Generation');
      
      // Check if we should generate content today
      const shouldGenerate = await this.shouldGenerateContentToday();
      
      if (!shouldGenerate) {
        this.logger.info('Skipping content generation - sufficient content in pipeline');
        return;
      }

      if (this.generateContent) {
        const target = this.lastDailyTarget;
        const job = await this.generateContent({
          source: 'scheduler',
          ...(target ? { strategyContext: { format: target.format, franja: target.franja, publishSlot: target.publishTime } } : {})
        });
        await this.db.setSetting('last_content_generation', new Date().toISOString());
        timer.end();
        this.logger.success(`Daily content generation queued: ${job.id}`);
        await this.logAutomationEvent('daily_content_generation', 'queued', { jobId: job.id });
        return;
      }

      // Generate content strategy
      const strategy = await this.agents.strategy.generateContentStrategy();
      this.logger.info(`Generated strategy: ${strategy.topic}`);

      // Generate script
      const script = await this.agents.scriptWriter.generateScript(strategy);
      this.logger.info(`Generated script: ${script.title}`);

      // Generate thumbnail
      const thumbnail = await this.agents.thumbnailDesigner.generateThumbnail(script);
      this.logger.info('Generated thumbnail');

      // Optimize SEO
      const seoData = await this.agents.seoOptimizer.optimize(script, strategy);
      this.logger.info('Completed SEO optimization');

      // Process through production
      const productionData = await this.agents.production.processContent({
        strategy,
        script,
        thumbnail,
        seo: seoData
      });
      this.logger.info(`Production completed: ${productionData.id}`);

      // Schedule for publishing (returns null when only placeholder assets were produced)
      const scheduleEntry = await this.agents.publishing.scheduleContent(productionData);
      if (scheduleEntry) {
        this.logger.info('Content scheduled for publishing');
      } else {
        this.logger.warn('Content was NOT scheduled — production produced placeholder assets. See warnings above.');
      }

      timer.end();
      this.logger.success('Daily content generation completed successfully');

      // Log the event
      await this.logAutomationEvent('daily_content_generation', 'success', {
        contentId: productionData.id,
        topic: strategy.topic,
        scheduledFor: productionData.scheduledPublishTime
      });

    } catch (error) {
      this.logger.error('Daily content generation failed:', error);
      
      await this.logAutomationEvent('daily_content_generation', 'error', {
        error: error.message
      });

      // Send notification about failure
      await this.sendFailureNotification('Daily Content Generation', error);
    }
  }

  async shouldGenerateContentToday() {
    const daily = this.agents.publishing?.dailySlotConfig
      ? await this.agents.publishing.dailySlotConfig()
      : null;
    if (daily) return this.needsDailyVideo(daily);

    // Check content buffer
    const upcomingContent = await this.agents.publishing.getUpcomingSchedule(3);
    const bufferDays = parseInt(await this.db.getSetting('content_buffer_days')) || 3;
    
    // Check if we have enough content scheduled
    if (upcomingContent.length >= bufferDays) {
      return false;
    }

    // Check posting frequency settings
    const lastGeneration = await this.db.getSetting('last_content_generation');
    const channelStrategy = this.db.getChannelStrategy ? await this.db.getChannelStrategy() : null;

    if (channelStrategy?.status === 'active') {
      const weeklyOutput = await this.db.getRow(
        `SELECT COUNT(*) AS count FROM generation_jobs
         WHERE source = 'autonomous_operator' AND status = 'completed'
         AND created_at >= datetime('now', '-7 days')`
      );
      if (Number(weeklyOutput?.count || 0) >= channelStrategy.cadence_per_week) return false;
      if (!lastGeneration) return true;
      const daysSinceLastGeneration = Math.floor(
        (new Date() - new Date(lastGeneration)) / (1000 * 60 * 60 * 24)
      );
      return daysSinceLastGeneration >= 1;
    }

    const frequency = await this.db.getSetting('posting_frequency') || 'daily';
    
    if (lastGeneration) {
      const lastDate = new Date(lastGeneration);
      const today = new Date();
      const daysSinceLastGeneration = Math.floor((today - lastDate) / (1000 * 60 * 60 * 24));
      
      switch (frequency) {
        case 'daily':
          return daysSinceLastGeneration >= 1;
        case 'every-2-days':
          return daysSinceLastGeneration >= 2;
        case '3-per-week':
          return daysSinceLastGeneration >= 2 || [1, 3, 5].includes(today.getDay());
        case 'weekly':
          return daysSinceLastGeneration >= 7;
        default:
          return true;
      }
    }

    return true;
  }

  /**
   * Daily mode: generate only if there's an empty slot in the next 24 h (the
   * nearest of long videos and Shorts), no other generation is running and that
   * slot hasn't already used 3 attempts. Leaves the slot in
   * `this.lastDailyTarget`.
   */
  async needsDailyVideo(daily) {
    this.lastDailyTarget = null;
    const running = await this.db.getRow(
      `SELECT COUNT(*) AS count FROM generation_jobs
       WHERE status IN ('queued', 'running') AND updated_at >= datetime('now', '-6 hours')`
    );
    if (Number(running?.count || 0) > 0) {
      this.logger.info('Daily video: a generation is already running');
      return false;
    }
    const horizonMs = 24 * 3600000;
    const formats = [
      { format: 'long', clocks: daily.clocks || [daily.clock] },
      { format: 'short', clocks: daily.shortClocks || [] }
    ].filter(f => f.clocks.length);
    const candidates = [];
    for (const { format, clocks } of formats) {
      const taken = await this.agents.publishing.takenDailySlots(format);
      const slot = nextFreeSlot({ timeZone: daily.timeZone, clocks, taken });
      if (new Date(slot.publishTime).getTime() - Date.now() > horizonMs) continue;
      // AI provider failures (no credit, key cap) don't use up the slot's attempts
      // (06/10/2026): an OpenRouter outage left the evening of 05/10 without a Short.
      const attempts = await this.db.getRow(
        `SELECT COUNT(*) AS count FROM generation_jobs
         WHERE source = 'scheduler' AND details LIKE ?
         AND NOT (status = 'failed' AND (COALESCE(error, '') LIKE '%AI script generation failed%'
           OR COALESCE(error, '') LIKE '%Key limit%' OR COALESCE(error, '') LIKE '%credits%'))`,
        [`%"publishSlot":"${slot.publishTime}"%`]
      );
      if (Number(attempts?.count || 0) >= 3) {
        this.logger.warn(`Daily ${format} for ${slot.publishTime}: 3 attempts already, skipping that slot`);
        continue;
      }
      candidates.push({ format, ...slot });
    }
    candidates.sort((a, b) => new Date(a.publishTime) - new Date(b.publishTime));
    const target = candidates[0] || null;
    this.logger.info(target
      ? `Daily ${target.format} for ${target.publishTime} (${target.franja}): missing, generating`
      : 'Daily videos: every slot in the next 24 h is covered');
    this.lastDailyTarget = target;
    return Boolean(target);
  }

  async processPublishQueue() {
    try {
      const published = await this.agents.publishing.processPublishQueue();
      
      if (published > 0) {
        this.logger.info(`Published ${published} videos from queue`);
        
        await this.logAutomationEvent('queue_processing', 'success', {
          publishedCount: published
        });
      }
    } catch (error) {
      this.logger.error('Failed to process publish queue:', error);
      
      await this.logAutomationEvent('queue_processing', 'error', {
        error: error.message
      });
      await this.sendFailureNotification('Publishing Queue', error);
    }
  }

  async collectDailyAnalytics() {
    try {
      this.logger.info('Starting daily analytics collection...');
      
      // Keep a 30-day catch-up window so new installs can backfill 24-hour and 7-day evidence.
      const recentVideos = await this.getRecentlyPublishedVideos(30);
      
      let processedCount = 0;
      
      for (const video of recentVideos) {
        try {
          const windows = await this.agents.analytics.getDueMeasurementWindows(video);
          for (const measurementWindow of windows) {
            await this.agents.analytics.analyzeVideoPerformance(video.youtube_id, { measurementWindow });
            processedCount++;
            this.logger.info(`Captured ${measurementWindow} learning evidence for: ${video.title}`);

            // Small delay to avoid API rate limits
            await this.sleep(2000);
          }
        } catch (error) {
          this.logger.error(`Failed to analyze video ${video.youtube_id}:`, error);
        }
      }

      this.logger.success(`Analytics collection completed. Processed ${processedCount} videos`);
      
      await this.logAutomationEvent('analytics_collection', 'success', {
        videosProcessed: processedCount
      });

    } catch (error) {
      this.logger.error('Daily analytics collection failed:', error);
      
      await this.logAutomationEvent('analytics_collection', 'error', {
        error: error.message
      });
      await this.sendFailureNotification('Analytics Collection', error);
    }
  }

  async collectAudienceEngagement() {
    if (!this.engagement) return;
    try {
      this.logger.info('Starting audience comment sync...');
      const recentVideos = await this.getRecentlyPublishedVideos(30);
      const results = await this.engagement.syncDueVideos(recentVideos.map(video => ({
        youtubeId: video.youtube_id,
        title: video.title,
        publishedAt: video.published_at,
        productionId: video.production_id || null
      })));
      this.logger.success(`Audience engagement sync completed: ${results.synced} synced, ${results.skipped} skipped, ${results.failed} failed`);
      await this.logAutomationEvent('audience_engagement_sync', 'success', results);
    } catch (error) {
      this.logger.error('Audience engagement sync failed:', error);
      await this.logAutomationEvent('audience_engagement_sync', 'error', { error: error.message });
    }
  }

  async refreshGrowthExperiments() {
    if (!this.experiments) return;
    try {
      const result = await this.experiments.refreshDue();
      if (result.refreshed || result.failed) {
        await this.logAutomationEvent('growth_experiment_refresh', result.failed ? 'warning' : 'success', result);
      }
    } catch (error) {
      this.logger.error('Growth experiment refresh failed:', error);
      await this.logAutomationEvent('growth_experiment_refresh', 'error', { error: error.message });
    }
  }

  async weeklyStrategyReview() {
    try {
      this.logger.info('Starting weekly strategy review...');
      
      // Analyze performance of last week's content
      const weeklyAnalytics = await this.agents.analytics.getRecentAnalytics(7);
      
      // Update content strategy based on performance
      if (weeklyAnalytics.topPerformers.length > 0) {
        const bestPerformingTopics = weeklyAnalytics.topPerformers
          .map(video => video.videoDetails.title)
          .slice(0, 3);
        
        this.logger.info(`Top performing topics: ${bestPerformingTopics.join(', ')}`);
      }

      // Optimize publishing times
      await this.agents.publishing.optimizePublishTimes();
      
      // Generate strategy insights
      const insights = await this.generateWeeklyInsights(weeklyAnalytics);
      
      this.logger.success('Weekly strategy review completed');
      
      await this.logAutomationEvent('weekly_strategy_review', 'success', {
        insights
      });

    } catch (error) {
      this.logger.error('Weekly strategy review failed:', error);
      
      await this.logAutomationEvent('weekly_strategy_review', 'error', {
        error: error.message
      });
    }
  }

  async runDailyOptimization() {
    try {
      this.logger.info('Starting daily optimization tasks...');
      
      // Optimize existing content SEO
      await this.optimizeExistingContent();
      
      // Update keyword performance data
      await this.updateKeywordPerformance();
      
      // Clean up old files
      await this.cleanupOldFiles();
      
      this.logger.success('Daily optimization completed');
      
      await this.logAutomationEvent('daily_optimization', 'success');

    } catch (error) {
      this.logger.error('Daily optimization failed:', error);
      
      await this.logAutomationEvent('daily_optimization', 'error', {
        error: error.message
      });
    }
  }

  async databaseMaintenance() {
    try {
      this.logger.info('Starting database maintenance...');
      
      // Create backup
      const backupPath = await this.db.backup();
      this.logger.info(`Database backed up to: ${backupPath}`);
      
      // Get database stats
      const stats = await this.db.getStats();
      this.logger.info(`Database stats: ${JSON.stringify(stats)}`);
      
      // Clean old analytics data (older than 90 days)
      await this.cleanOldAnalytics();
      
      this.logger.success('Database maintenance completed');
      
      await this.logAutomationEvent('database_maintenance', 'success', {
        backupPath,
        stats
      });

    } catch (error) {
      this.logger.error('Database maintenance failed:', error);
      
      await this.logAutomationEvent('database_maintenance', 'error', {
        error: error.message
      });
    }
  }

  // Helper methods
  async getRecentlyPublishedVideos(days) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    const rows = await this.db.getAllRows(
      `SELECT * FROM publish_schedule 
       WHERE status = 'published' AND published_at > ?
       ORDER BY published_at DESC`,
      [cutoffDate.toISOString()]
    );
    
    return rows;
  }

  async generateWeeklyInsights(analytics) {
    const insights = [];
    
    if (analytics.averagePerformanceScore > 80) {
      insights.push('Content performance is excellent this week');
    } else if (analytics.averagePerformanceScore < 50) {
      insights.push('Content performance needs improvement');
    }
    
    if (analytics.topPerformers.length > 0) {
      insights.push(`Best performing video: ${analytics.topPerformers[0].videoDetails.title}`);
    }
    
    return insights;
  }

  async optimizeExistingContent() {
    // Get videos published in last 30 days with low performance
    const lowPerformingVideos = await this.db.getAllRows(
      `SELECT ar.* FROM analytics_reports ar
       JOIN publish_schedule ps ON ar.video_id = ps.id
       WHERE ar.performance_score < 50 
       AND ps.published_at > datetime('now', '-30 days')
       LIMIT 5`
    );
    
    for (const video of lowPerformingVideos) {
      // Re-analyze and generate optimization suggestions
      await this.agents.analytics.analyzeVideoPerformance(video.video_id);
      this.logger.info(`Re-analyzed low performing video: ${video.video_id}`);
    }
  }

  async updateKeywordPerformance() {
    // Update keyword performance based on recent analytics
    const recentVideos = await this.getRecentlyPublishedVideos(7);
    
    for (const video of recentVideos) {
      const analyticsData = await this.db.getRow(
        'SELECT * FROM analytics_reports WHERE video_id = ?',
        [video.id]
      );
      
      if (analyticsData) {
        const videoDetails = JSON.parse(analyticsData.video_details);
        const keywords = videoDetails.tags || [];
        
        for (const keyword of keywords) {
          await this.db.updateKeywordPerformance(
            keyword,
            videoDetails.statistics.viewCount,
            video.youtube_id
          );
        }
      }
    }
  }

  async cleanupOldFiles() {
    // Clean up temporary files older than 7 days
    const path = require('path');
    
    const tempDir = path.join(__dirname, '..', 'temp');
    const uploadsDir = path.join(__dirname, '..', 'uploads');
    
    try {
      await this.cleanDirectoryOldFiles(tempDir, 7);
      await this.cleanDirectoryOldFiles(uploadsDir, 30);
      this.logger.info('Old files cleaned up');
    } catch (error) {
      this.logger.error('Failed to clean up old files:', error);
    }
  }

  async cleanDirectoryOldFiles(directory, days) {
    const fs = require('fs').promises;
    const path = require('path');
    
    try {
      const files = await fs.readdir(directory);
      const cutoffTime = Date.now() - (days * 24 * 60 * 60 * 1000);
      
      for (const file of files) {
        const filePath = path.join(directory, file);
        const stats = await fs.stat(filePath);
        
        if (stats.mtime.getTime() < cutoffTime) {
          await fs.unlink(filePath);
        }
      }
    } catch (error) {
      // Directory might not exist, which is fine
    }
  }

  async cleanOldAnalytics() {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 90);
    
    await this.db.executeQuery(
      'DELETE FROM analytics_reports WHERE analyzed_at < ?',
      [cutoffDate.toISOString()]
    );
  }

  async logAutomationEvent(eventType, status, data = {}) {
    await this.db.executeQuery(
      'INSERT INTO automation_events (event_type, status, data, created_at) VALUES (?, ?, ?, datetime("now"))',
      [eventType, status, JSON.stringify(data)]
    );
  }

  async sendFailureNotification(taskName, error) {
    // This would integrate with notification services (email, Slack, etc.)
    this.logger.error(`AUTOMATION FAILURE - ${taskName}: ${error.message}`);
    if (this.db.createNotification) {
      await this.db.createNotification({
        type: 'automation_failure',
        level: 'error',
        title: `${taskName} failed`,
        message: error.message
      });
    }
  }

  startMonitoringLoop() {
    // Monitor system health every hour
    this.healthCheckInterval = setInterval(async () => {
      try {
        await this.performHealthCheck();
      } catch (error) {
        this.logger.error('Health check failed:', error);
      }
    }, 60 * 60 * 1000); // 1 hour
  }

  async performHealthCheck() {
    this.lastHealthCheck = new Date();

    const health = {
      timestamp: new Date().toISOString(),
      database: false,
      agents: {},
      scheduledTasks: {},
      systemResources: {}
    };

    // Check database
    try {
      await this.db.getAllRows('SELECT 1');
      health.database = true;
    } catch (error) {
      health.database = false;
    }

    // Check scheduled tasks
    this.scheduledTasks.forEach((task, name) => {
      health.scheduledTasks[name] = task.running;
    });

    // Get system resources (simplified)
    health.systemResources = {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      nodeVersion: process.version
    };

    // Log health status
    const healthScore = this.calculateHealthScore(health);
    
    if (healthScore < 80) {
      this.logger.warn(`System health score: ${healthScore}/100`, health);
    } else {
      this.logger.info(`System health check passed: ${healthScore}/100`);
    }
    
    return health;
  }

  calculateHealthScore(health) {
    let score = 100;
    
    if (!health.database) score -= 30;
    
    const tasksRunning = Object.values(health.scheduledTasks).filter(Boolean).length;
    const totalTasks = Object.keys(health.scheduledTasks).length;
    
    if (totalTasks > 0 && tasksRunning < totalTasks) {
      score -= ((totalTasks - tasksRunning) / totalTasks) * 20;
    }
    
    return Math.max(0, Math.round(score));
  }

  // Control methods
  async pauseAutomation() {
    this.isEnabled = false;
    this.logger.info('Automation paused');
  }

  async resumeAutomation() {
    this.isEnabled = true;
    this.logger.info('Automation resumed');
  }

  async stopAutomation() {
    this.scheduledTasks.forEach((task, name) => {
      task.stop();
      this.logger.info(`Stopped scheduled task: ${name}`);
    });
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    this.isEnabled = false;
    this.logger.info('All automation tasks stopped');
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async getAutomationStatus() {
    return {
      enabled: this.isEnabled,
      scheduledTasks: Array.from(this.scheduledTasks.keys()).map(name => ({
        name,
        running: this.scheduledTasks.get(name).running
      })),
      lastHealthCheck: this.lastHealthCheck,
      uptime: process.uptime()
    };
  }
}

module.exports = { DailyAutomation };
