const { google } = require('googleapis');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const { Logger } = require('../utils/logger');
const { assertValidYouTubeMetadata } = require('../utils/youtube-metadata-validator');
const { nextFreeSlot, parseClocks, uploadPlan, DEFAULT_TZ, DEFAULT_CLOCK } = require('../utils/daily-slot');
const { esShort } = require('../utils/formato');
const { facebookConfig, publicaReel, publicaVideoLargo } = require('../utils/facebook-reels');
const { preparaReelIG, estadoIG, publicaIG, tokenInstagram, renuevaTokenSiToca } = require('../utils/instagram-reels');
const { textoParaRed } = require('../utils/texto-social');
const { enlacePublicoConfig, publicaCopia, borraCopia, limpiaCopiasViejas } = require('../utils/enlace-publico');

const MAX_INTENTOS_RED = 3;
// Un intento fallido se repite en las vueltas siguientes de la cola (cada 15 min).
const tocaSubir = estado => !estado || (estado.status === 'failed' && !estado.permanent && (estado.attempts || 0) < MAX_INTENTOS_RED);

// Shorts de oración (29/09/2026): mañana y noche, separados de los largos (04:00 y 18:30).
const DEFAULT_SHORT_CLOCKS = '07:00,21:00';

class PublishingSchedulingAgent {
  constructor(db, credentials) {
    this.db = db;
    this.credentials = credentials;
    this.logger = new Logger('PublishingScheduling');
    this.youtube = null;
    this.publishQueue = [];
  }

  async initialize() {
    this.logger.info('Initializing Publishing & Scheduling Agent...');
    await this.setupYouTubeAPI();
    await this.loadPublishQueue();
    return true;
  }

  async setupYouTubeAPI() {
    try {
      const auth = this.credentials.getYouTubeAuth();
      this.youtube = google.youtube({ version: 'v3', auth });
      this.logger.info('YouTube API initialized');
    } catch (error) {
      this.logger.error('Failed to initialize YouTube API:', error);
      throw error;
    }
  }

  async loadPublishQueue() {
    try {
      const queue = await this.db.getPublishQueue();
      this.publishQueue = queue || [];
      this.logger.info(`Loaded ${this.publishQueue.length} items in publish queue`);
    } catch (error) {
      this.logger.warn('No existing publish queue found');
    }
  }

  async scheduleContent(productionData) {
    try {
      const finalVideo = productionData.assets?.finalVideo;
      if (!finalVideo || finalVideo.simulated || path.extname(finalVideo.path || '').toLowerCase() !== '.mp4') {
        this.logger.warn(`Not scheduling ${productionData.id}: no real video file was produced (placeholder/simulated output). Fix your AI provider keys and FFmpeg, then regenerate.`);
        return null;
      }
      if (!await this.isNarrationReady(productionData.assets?.audio)) {
        this.logger.warn(`Not scheduling ${productionData.id}: narration is missing. Regenerate narration or explicitly confirm an intentional silent video.`);
        return null;
      }

      this.logger.info(`Scheduling content: ${productionData.id}`);
      const existing = await this.db.getLatestScheduleEntry?.(productionData.id);
      if (existing) {
        if (['scheduled', 'paused'].includes(existing.status) && !this.publishQueue.some(entry => entry.id === existing.id)) {
          this.publishQueue.push(existing);
          this.publishQueue.sort((a, b) => new Date(a.publishTime) - new Date(b.publishTime));
        }
        this.logger.info(`Reusing existing ${existing.status} schedule entry for: ${productionData.id}`);
        return existing;
      }

      const isLongForm = (productionData.contentType || 'long_form') === 'long_form' && !productionData.shortClipId;
      const daily = isLongForm ? await this.dailySlotConfig() : null;
      const formato = esShort(productionData.strategy) ? 'short' : 'long';
      const publishTime = daily
        ? await this.slotFor(productionData.strategy?.publishSlot, formato, daily)
        : productionData.scheduledPublishTime;

      const scheduleEntry = {
        productionId: productionData.id,
        title: productionData.seo?.title || productionData.script.title,
        publishTime,
        status: 'scheduled',
        priority: productionData.priority,
        metadata: {
          seo: productionData.seo,
          thumbnail: productionData.assets.thumbnail,
          shortCover: productionData.assets.shortCover || null,
          video: productionData.assets.finalVideo,
          audio: productionData.assets.audio,
          captions: productionData.assets.captions,
          privacyStatus: productionData.privacyStatus || process.env.DEFAULT_PRIVACY_STATUS || 'private',
          containsSyntheticMedia: productionData.containsSyntheticMedia === true,
          contentType: productionData.contentType || 'long_form',
          sourceProductionId: productionData.sourceProductionId || productionData.id,
          shortClipId: productionData.shortClipId || null,
          dailySlot: Boolean(daily),
          contentFormat: formato
        },
        createdAt: new Date().toISOString()
      };
      
      const saved = await this.db.saveScheduleEntry(scheduleEntry) || scheduleEntry;
      this.publishQueue.push(saved);
      this.publishQueue.sort((a, b) => new Date(a.publishTime) - new Date(b.publishTime));
      
      this.logger.info(`Content scheduled for: ${saved.publishTime}`);
      return saved;
    } catch (error) {
      this.logger.error('Failed to schedule content:', error);
      throw error;
    }
  }

  async publishContent(contentId) {
    try {
      let productionBundle = null;
      if (this.db.getLatestReadinessRun) {
        const readiness = await this.db.getLatestReadinessRun();
        if (readiness?.status === 'failed') {
          const failures = readiness.checks
            .filter(check => check.blocking && check.status === 'failed')
            .map(check => check.id);
          const error = new Error(`Publishing is blocked by the production readiness gate. Fix ${failures.join(', ')} and run the check again.`);
          error.status = 409;
          error.code = 'READINESS_BLOCKED';
          throw error;
        }
      }
      if (this.db.getProductionBundle) {
        productionBundle = await this.db.getProductionBundle(contentId);
        if (productionBundle && !['verified', 'not_required'].includes(productionBundle.provenance?.status || 'not_required')) {
          const error = new Error('Publishing is blocked until every factual claim is supported or explicitly waived');
          error.status = 409;
          error.code = 'PROVENANCE_BLOCKED';
          throw error;
        }
      }
      this.logger.info(`Publishing content: ${contentId}`);
      
      let scheduleEntry = this.publishQueue.find(entry =>
        entry.productionId === contentId || entry.id === contentId
      );
      if (!scheduleEntry && this.db.getLatestScheduleEntry) {
        scheduleEntry = await this.db.getLatestScheduleEntry(contentId);
      }
      
      if (!scheduleEntry) {
        throw new Error(`Content not found in queue: ${contentId}`);
      }
      if (scheduleEntry.status === 'published') return scheduleEntry;
      if (!await this.isNarrationReady(scheduleEntry.metadata?.audio || productionBundle?.assets?.audio)) {
        const error = new Error('Publishing is blocked because narration is missing or the intentional-silence override is incomplete');
        error.status = 409;
        error.code = 'NARRATION_REQUIRED';
        throw error;
      }
      if (scheduleEntry.youtubeId) {
        return this.reconcileUploadedVideo(scheduleEntry);
      }
      if (['uploading', 'reconciliation_required'].includes(scheduleEntry.status)) {
        const error = new Error('A previous upload may have reached YouTube without returning a video ID. Reconcile the channel before attempting another upload.');
        error.status = 409;
        error.code = 'UPLOAD_OUTCOME_UNKNOWN';
        throw error;
      }

      const duplicateTitle = await this.db.findDuplicatePublicationTitle(
        scheduleEntry.metadata?.seo?.title || scheduleEntry.title, scheduleEntry.productionId
      );
      if (duplicateTitle) {
        const error = new Error(`Final title duplicates production ${duplicateTitle.productionId || duplicateTitle.id}. Edit the title and approve it again before uploading.`);
        error.status = 409;
        error.code = 'DUPLICATE_TITLE';
        throw error;
      }

      scheduleEntry.status = 'uploading';
      scheduleEntry.error = null;
      await this.db.updateScheduleEntry(scheduleEntry);
      await this.syncShortStatus(scheduleEntry, 'uploading');
      
      let uploadResult;
      try {
        uploadResult = await this.uploadToYouTube(scheduleEntry);
      } catch (error) {
        if (scheduleEntry.uploadAttempted && this.isUploadOutcomeUnknown(error)) {
          scheduleEntry.status = 'reconciliation_required';
          scheduleEntry.error = 'Upload outcome is unknown; verify the YouTube channel before retrying';
          await this.db.updateScheduleEntry(scheduleEntry);
          await this.syncShortStatus(scheduleEntry, 'reconciliation_required', scheduleEntry.error);
          error.code = 'UPLOAD_OUTCOME_UNKNOWN';
          error.status = 409;
        } else {
          scheduleEntry.status = 'failed';
          scheduleEntry.error = error.message;
          await this.db.updateScheduleEntry(scheduleEntry);
          await this.syncShortStatus(scheduleEntry, 'failed', error.message);
        }
        throw error;
      }
      
      // Update database
      scheduleEntry.status = 'published';
      scheduleEntry.publishedAt = scheduleEntry.publicAt || new Date().toISOString();
      scheduleEntry.youtubeId = uploadResult.id;
      scheduleEntry.youtubeUrl = `https://www.youtube.com/watch?v=${uploadResult.id}`;
      
      await this.db.updateScheduleEntry(scheduleEntry);
      await this.syncShortStatus(scheduleEntry, 'published');
      
      // Remove from queue
      this.publishQueue = this.publishQueue.filter(entry => entry.productionId !== scheduleEntry.productionId);
      
      this.logger.success(`Content published: ${scheduleEntry.youtubeUrl}`);
      await this.syncSocial(scheduleEntry).catch(error => this.logger.warn(`Reels (Facebook/Instagram): ${error.message}`));
      return scheduleEntry;
    } catch (error) {
      this.logger.error('Failed to publish content:', error);
      throw error;
    }
  }

  async uploadToYouTube(scheduleEntry) {
    const { metadata } = scheduleEntry;
    const validation = assertValidYouTubeMetadata(metadata.seo);
    if (validation.warnings.length) {
      this.logger.warn(`YouTube metadata warnings: ${validation.warnings.join(' ')}`);
    }
    const safeMetadata = validation.value;
    
    // Prepare video metadata
    const videoMetadata = {
      snippet: {
        title: safeMetadata.title,
        description: safeMetadata.description,
        tags: safeMetadata.tags,
        categoryId: safeMetadata.categoryId,
        defaultLanguage: safeMetadata.defaultLanguage,
        defaultAudioLanguage: safeMetadata.defaultAudioLanguage
      },
      status: {
        ...(metadata.dailySlot
          ? uploadPlan({ publishTime: scheduleEntry.publishTime })
          : {
            privacyStatus: metadata.privacyStatus || process.env.DEFAULT_PRIVACY_STATUS || 'private',
            publishAt: scheduleEntry.publishTime
          }),
        selfDeclaredMadeForKids: false,
        containsSyntheticMedia: metadata.containsSyntheticMedia === true
      }
    };
    
    // Resolve the file before marking the network upload as attempted.
    if (metadata.dailySlot) scheduleEntry.publicAt = videoMetadata.status.publishAt;
    const videoStream = await this.getVideoStream(metadata.video.path);
    scheduleEntry.uploadAttempted = true;
    const videoUpload = await this.youtube.videos.insert({
      part: 'snippet,status',
      requestBody: videoMetadata,
      media: {
        body: videoStream
      }
    });
    
    const videoId = videoUpload.data.id;
    this.logger.info(`Video uploaded with ID: ${videoId}`);
    scheduleEntry.status = 'uploaded';
    scheduleEntry.youtubeId = videoId;
    scheduleEntry.youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
    scheduleEntry.error = null;
    await this.db.updateScheduleEntry(scheduleEntry);
    
    // Miniatura y subtítulos: si fallan (p. ej. cuota agotada) quedan apuntados y
    // reintentaPendientes() los vuelve a subir en las siguientes vueltas (06/10/2026).
    const pendientes = {};
    /* Short (11/10/2026): su portada vertical como miniatura, SIN pegarla dentro
       del vídeo (eso bajaba las vistas). YouTube la acepta por la API: probado
       ese día con un Short del canal. */
    const miniatura = metadata.thumbnail?.path || await this.portadaDelShort(scheduleEntry);
    if (miniatura && !await this.uploadThumbnail(videoId, miniatura)) pendientes.thumbnail = true;
    if (metadata.captions && metadata.captions.path && !await this.uploadCaptions(videoId, metadata.captions.path)) pendientes.captions = true;
    if (Object.keys(pendientes).length) {
      scheduleEntry.metadata = { ...metadata, pendientesYouTube: pendientes };
      await this.db.updateScheduleEntry(scheduleEntry);
    }

    return videoUpload.data;
  }

  /**
   * Copia el vídeo a Facebook e Instagram. YouTube ya está hecho: nada de aquí
   * lo deshace, y el estado de cada red queda en metadata.facebook / .instagram.
   * - Short → Reel en Facebook (programado a la hora de YouTube) y Reel en
   *   Instagram (se sube ahora y se publica a su hora en syncRecentSocial(),
   *   porque la API de Instagram no programa).
   * - Largo → vídeo de la Página de Facebook, con miniatura y programado.
   *   A Instagram no va: un horizontal de 7 min no funciona como Reel.
   */
  async syncSocial(scheduleEntry, opts = {}) {
    const deps = { ...this.socialDeps, ...opts };
    const env = deps.env || process.env;
    const now = deps.now || new Date();
    const metadata = scheduleEntry.metadata || {};
    const esCorto = metadata.contentFormat === 'short';
    if (!['short', 'long'].includes(metadata.contentFormat) || !metadata.video?.path) return null;
    metadata.socialPublishAt = metadata.socialPublishAt || scheduleEntry.publicAt || scheduleEntry.publishTime;
    const publishAt = metadata.socialPublishAt;
    let cambio = false;

    const fbConfig = facebookConfig(env);
    if (fbConfig && tocaSubir(metadata.facebook)) {
      cambio = true;
      const attempts = (metadata.facebook?.attempts || 0) + 1;
      try {
        const comoVideo = () => (deps.publicarFacebookLargo || publicaVideoLargo)({
          config: fbConfig, videoPath: metadata.video.path,
          title: metadata.seo?.title || scheduleEntry.title || '',
          description: textoParaRed(metadata.seo, esCorto ? 'facebook' : 'facebook_video', env),
          thumbPath: metadata.thumbnail?.path || null, publishAt, now
        });
        let comoReel = esCorto;
        let subido;
        if (esCorto) {
          try {
            subido = await (deps.publicarFacebook || publicaReel)({
              config: fbConfig, videoPath: metadata.video.path,
              description: textoParaRed(metadata.seo, 'facebook', env), publishAt, now
            });
          } catch (error) {
            // Un Short de más de ~100 s no cabe como Reel (07/10/2026): sale como vídeo de la Página.
            if (error.code !== 'reel_demasiado_largo') throw error;
            this.logger.info(`Facebook: ${error.message}; se publica como vídeo normal de la Página`);
            comoReel = false;
            subido = await comoVideo();
          }
        } else {
          subido = await comoVideo();
        }
        metadata.facebook = {
          status: subido.state === 'SCHEDULED' ? 'scheduled' : 'published',
          kind: comoReel ? 'reel' : 'video',
          reelId: subido.videoId,
          url: comoReel ? `https://www.facebook.com/reel/${subido.videoId}` : `https://www.facebook.com/watch/?v=${subido.videoId}`,
          ...(subido.speed ? { speed: subido.speed } : {}),
          attempts, at: now.toISOString()
        };
        this.logger.success(`Facebook ${metadata.facebook.kind} ${metadata.facebook.status}: ${metadata.facebook.url}`);
      } catch (error) {
        metadata.facebook = { status: 'failed', error: error.message, permanent: error.permanent === true, attempts, at: now.toISOString() };
        this.logger.warn(`Facebook Reel failed (intento ${attempts}): ${error.message}`);
      }
    }

    // Instagram necesita un enlace público al vídeo (ver utils/enlace-publico.js).
    const enlace = deps.enlace || enlacePublicoConfig(env);
    const igToken = esCorto && enlace ? await tokenInstagram(this.db, env) : null;
    const ig = { prepara: preparaReelIG, estado: estadoIG, publica: publicaIG, ...deps.ig };
    const copias = { publica: publicaCopia, borra: borraCopia, ...deps.copias };
    if (igToken && tocaSubir(metadata.instagram)) {
      cambio = true;
      const attempts = (metadata.instagram?.attempts || 0) + 1;
      let copia = null;
      let copiaPortada = null;
      try {
        copia = await copias.publica(metadata.video.path, enlace);
        /* La portada (11/10/2026) solo se puede poner al crear el contenedor.
           Si no hay o falla su copia, el Reel sale igual, sin portada. */
        const portada = await this.portadaDelShort(scheduleEntry);
        if (portada) {
          copiaPortada = await copias.publica(portada, enlace).catch((error) => {
            this.logger.warn(`Portada del Reel no disponible (${error.message}); sale sin portada`);
            return null;
          });
        }
        const { containerId, igUserId } = await ig.prepara({
          token: igToken, videoUrl: copia.url, coverUrl: copiaPortada?.url || null,
          caption: textoParaRed(metadata.seo, 'instagram', env)
        });
        metadata.instagram = {
          status: 'uploaded', containerId, igUserId, copia: copia.nombre,
          ...(copiaPortada ? { copiaPortada: copiaPortada.nombre } : {}),
          publishAt, attempts, at: now.toISOString()
        };
        this.logger.info(`Instagram Reel subido${copiaPortada ? ' con portada' : ''}; se publica a las ${publishAt}`);
      } catch (error) {
        if (copia) await copias.borra(copia.nombre, enlace);
        if (copiaPortada) await copias.borra(copiaPortada.nombre, enlace);
        metadata.instagram = { status: 'failed', error: error.message, attempts, at: now.toISOString() };
        this.logger.warn(`Instagram Reel failed (intento ${attempts}): ${error.message}`);
      }
    } else if (igToken && metadata.instagram?.status === 'uploaded' && Date.parse(metadata.instagram.publishAt) <= now.getTime()) {
      const pendiente = metadata.instagram;
      const { status, detail } = await ig.estado({ token: igToken, containerId: pendiente.containerId });
      // FINISHED/PUBLISHED/ERROR/EXPIRED: Instagram ya no necesita la copia pública.
      if (status !== 'IN_PROGRESS') {
        if (pendiente.copia) await copias.borra(pendiente.copia, enlace);
        if (pendiente.copiaPortada) await copias.borra(pendiente.copiaPortada, enlace);
      }
      if (status === 'FINISHED') {
        const { mediaId, permalink } = await ig.publica({ token: igToken, igUserId: pendiente.igUserId, containerId: pendiente.containerId });
        metadata.instagram = { ...pendiente, status: 'published', mediaId, url: permalink, publishedAt: now.toISOString() };
        this.logger.success(`Instagram Reel published: ${permalink || mediaId}`);
        cambio = true;
      } else if (status === 'PUBLISHED') {
        metadata.instagram = { ...pendiente, status: 'published', publishedAt: now.toISOString() };
        cambio = true;
      } else if (status === 'ERROR' || status === 'EXPIRED') {
        // El siguiente intento vuelve a crear el contenedor desde cero.
        metadata.instagram = { ...pendiente, status: 'failed', error: `Instagram: contenedor ${status}${detail ? ` (${detail})` : ''}` };
        this.logger.warn(metadata.instagram.error);
        cambio = true;
      }
    }

    if (cambio) {
      scheduleEntry.metadata = metadata;
      await this.db.updateScheduleEntry(scheduleEntry);
    }
    return { facebook: metadata.facebook || null, instagram: metadata.instagram || null };
  }

  /**
   * Cada vuelta de la cola: renueva el token de Instagram y repasa lo subido a
   * YouTube en las últimas 24 h (reintentos, Instagram a su hora). Lo que ya era
   * público antes de conectar las redes y nunca se tocó se queda fuera: no se
   * vuelca de golpe el contenido viejo en la Página.
   */
  async syncRecentSocial() {
    const deps = this.socialDeps || {};
    const env = deps.env || process.env;
    const now = deps.now || new Date();
    if (!facebookConfig(env) && !await tokenInstagram(this.db, env)) return 0;
    try {
      if (await renuevaTokenSiToca({ db: this.db, env, now, ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}) })) {
        this.logger.info('Instagram token renovado (vale 60 días más)');
      }
    } catch (error) {
      this.logger.warn(`No se pudo renovar el token de Instagram: ${error.message}`);
    }
    await limpiaCopiasViejas(deps.enlace || enlacePublicoConfig(env), now.getTime()).catch(() => {});
    const since = new Date(now.getTime() - 24 * 3600000).toISOString();
    const entries = ((await this.db.getRecentPublishedForSocial?.(since)) || []).filter(entry =>
      entry.metadata?.facebook || entry.metadata?.instagram || Date.parse(entry.publishTime) > now.getTime());
    for (const entry of entries) {
      try {
        await this.syncSocial(entry);
      } catch (error) {
        this.logger.warn(`Reels de ${entry.productionId || entry.id}: ${error.message}`);
      }
    }
    return entries.length;
  }

  async isNarrationReady(audio = {}) {
    if (audio.intentionalSilence === true) {
      return String(audio.silenceReason || '').trim().length >= 10 && Boolean(audio.silenceConfirmedAt);
    }
    if (!audio.path || audio.simulated || String(audio.path).endsWith('.info')) return false;
    try {
      const stats = await fs.stat(audio.path);
      return stats.isFile() && stats.size > 0;
    } catch (_error) {
      return false;
    }
  }

  isUploadOutcomeUnknown(error) {
    const status = Number(error.status || error.response?.status || 0);
    return !status || status >= 500;
  }

  async reconcileUploadedVideo(scheduleEntry) {
    const response = await this.youtube.videos.list({ part: 'id,status', id: scheduleEntry.youtubeId });
    if (!response.data.items?.some(video => video.id === scheduleEntry.youtubeId)) {
      scheduleEntry.status = 'reconciliation_required';
      scheduleEntry.error = 'The recorded YouTube video ID could not be verified';
      await this.db.updateScheduleEntry(scheduleEntry);
      await this.syncShortStatus(scheduleEntry, 'reconciliation_required', scheduleEntry.error);
      const error = new Error('The recorded upload could not be verified on YouTube. Resolve it before attempting another upload.');
      error.status = 409;
      error.code = 'UPLOAD_OUTCOME_UNKNOWN';
      throw error;
    }
    scheduleEntry.status = 'published';
    scheduleEntry.publishedAt = scheduleEntry.publishedAt || new Date().toISOString();
    scheduleEntry.youtubeUrl = scheduleEntry.youtubeUrl || `https://www.youtube.com/watch?v=${scheduleEntry.youtubeId}`;
    scheduleEntry.error = null;
    await this.db.updateScheduleEntry(scheduleEntry);
    await this.syncShortStatus(scheduleEntry, 'published');
    this.publishQueue = this.publishQueue.filter(entry => entry.productionId !== scheduleEntry.productionId);
    this.logger.success(`Reconciled existing YouTube upload: ${scheduleEntry.youtubeUrl}`);
    return scheduleEntry;
  }

  async syncShortStatus(scheduleEntry, status, error = null) {
    const clipId = scheduleEntry.metadata?.shortClipId;
    if (!clipId || !this.db.updateShortClip) return null;
    return this.db.updateShortClip(clipId, {
      status,
      scheduleId: scheduleEntry.id,
      youtubeId: scheduleEntry.youtubeId || null,
      youtubeUrl: scheduleEntry.youtubeUrl || null,
      error
    });
  }

  async getVideoStream(videoPath) {
    try {
      const stats = await fs.stat(videoPath);
      if (!stats.isFile() || path.extname(videoPath).toLowerCase() !== '.mp4') {
        throw new Error('placeholder asset');
      }

      return fsSync.createReadStream(videoPath);
    } catch (error) {
      throw new Error('video file not found — refusing to upload placeholder');
    }
  }
  /**
   * La portada vertical de un Short (storyboard-pipeline la compone en
   * production.assets.shortCover). Las entradas programadas antes del
   * 11/10/2026 no la llevan en metadata: se lee de la producción. Si el
   * archivo no existe, null: reintentarlo no lo va a crear.
   */
  async portadaDelShort(entrada = {}) {
    const m = entrada.metadata || {};
    if (m.contentFormat !== 'short') return null;
    let ruta = m.shortCover?.path || null;
    if (!ruta && entrada.productionId && this.db?.getAllRows) {
      const filas = await this.db.getAllRows('SELECT assets FROM productions WHERE id = ?', [entrada.productionId]).catch(() => []);
      try { ruta = JSON.parse(filas[0]?.assets || '{}')?.shortCover?.path || null; } catch { ruta = null; }
    }
    if (!ruta) return null;
    try { await fs.access(ruta); return ruta; } catch { return null; }
  }

  async uploadThumbnail(videoId, thumbnailPath) {
    try {
      const thumbnailBuffer = await fs.readFile(thumbnailPath);
      
      await this.youtube.thumbnails.set({
        videoId: videoId,
        media: {
          body: thumbnailBuffer
        }
      });
      
      this.logger.info(`Thumbnail uploaded for video: ${videoId}`);
      return true;
    } catch (error) {
      if (require('../utils/cuota-youtube').esCuota(error)) await require('../utils/cuota-youtube').marcaAgotada(this.db).catch(() => {});
      this.logger.error(`Failed to upload thumbnail: ${error.message}`);
      return false;
    }
  }

  async applyVideoPackaging(videoId, packaging = {}, previousPackaging = null) {
    const title = String(packaging.title || '').trim();
    if (!videoId || !title || title.length > 100 || !packaging.thumbnailPath) {
      const error = new Error('A valid video ID, title, and thumbnail are required for a packaging change');
      error.status = 400;
      error.code = 'PACKAGING_INVALID';
      throw error;
    }
    const thumbnail = await fs.readFile(packaging.thumbnailPath);
    const current = await this.youtube.videos.list({ part: 'snippet', id: videoId });
    const snippet = current.data.items?.[0]?.snippet;
    if (!snippet) {
      const error = new Error(`YouTube video not found: ${videoId}`);
      error.status = 404;
      error.code = 'PACKAGING_VIDEO_NOT_FOUND';
      throw error;
    }

    const updateTitle = async nextTitle => this.youtube.videos.update({
      part: 'snippet',
      requestBody: {
        id: videoId,
        snippet: {
          title: nextTitle,
          description: snippet.description || '',
          tags: snippet.tags || [],
          categoryId: snippet.categoryId || '22',
          defaultLanguage: snippet.defaultLanguage,
          defaultAudioLanguage: snippet.defaultAudioLanguage
        }
      }
    });

    await updateTitle(title);
    try {
      await this.youtube.thumbnails.set({
        videoId,
        media: { body: thumbnail }
      });
    } catch (error) {
      try {
        await updateTitle(String(previousPackaging?.title || snippet.title || '').trim());
      } catch (rollbackError) {
        error.message = `${error.message}; title rollback also failed: ${rollbackError.message}`;
      }
      throw error;
    }
    this.logger.info(`Applied approved growth-experiment packaging to video: ${videoId}`);
    return { videoId, title, thumbnailPath: packaging.thumbnailPath };
  }

  async uploadCaptions(videoId, captionsPath) {
    try {
      const captionsContent = await fs.readFile(captionsPath, 'utf8');
      
      await this.youtube.captions.insert({
        part: 'snippet',
        requestBody: {
          snippet: {
            videoId: videoId,
            language: process.env.CONTENT_LANGUAGE || 'en',
            name: String(process.env.CONTENT_LANGUAGE || 'en').startsWith('es') ? 'Español' : 'English',
            isDraft: false
          }
        },
        media: {
          body: captionsContent
        }
      });
      
      this.logger.info(`Captions uploaded for video: ${videoId}`);
      return true;
    } catch (error) {
      if (require('../utils/cuota-youtube').esCuota(error)) await require('../utils/cuota-youtube').marcaAgotada(this.db).catch(() => {});
      this.logger.error(`Failed to upload captions: ${error.message}`);
      return false;
    }
  }

  /**
   * Reintenta la miniatura y los subtítulos que no se pudieron subir (06/10/2026),
   * en vídeos de los últimos 3 días, cuando hay cuota. Máximo 5 intentos por vídeo.
   */
  async reintentaPendientes({ now = new Date() } = {}) {
    if (!this.youtube || await require('../utils/cuota-youtube').agotada(this.db, now)) return 0;
    const desde = new Date(now.getTime() - 3 * 86400000).toISOString();
    const filas = await this.db.getAllRows(
      `SELECT * FROM publish_schedule WHERE youtube_id IS NOT NULL AND publish_time >= ?
       AND json_extract(metadata, '$.pendientesYouTube') IS NOT NULL`, [desde]
    );
    let hechos = 0;
    for (const fila of filas) {
      const entrada = this.db.deserializeScheduleEntry(fila);
      const m = entrada.metadata || {};
      const p = { ...(m.pendientesYouTube || {}) };
      if ((p.intentos || 0) >= 5) continue;
      if (p.thumbnail) {
        const miniatura = m.thumbnail?.path || await this.portadaDelShort(entrada);
        if (miniatura && await this.uploadThumbnail(entrada.youtubeId, miniatura)) delete p.thumbnail;
      }
      if (p.captions && m.captions?.path && await this.uploadCaptions(entrada.youtubeId, m.captions.path)) delete p.captions;
      p.intentos = (p.intentos || 0) + 1;
      const quedan = p.thumbnail || p.captions;
      entrada.metadata = { ...m, pendientesYouTube: quedan ? p : null };
      await this.db.updateScheduleEntry(entrada);
      if (!quedan) { hechos += 1; this.logger.success(`Miniatura/subtítulos subidos al reintentar: ${entrada.youtubeUrl}`); }
    }
    return hechos;
  }

  async processPublishQueue() {
    await this.syncRecentSocial().catch(error => this.logger.warn(`Reels (Facebook/Instagram): ${error.message}`));
    await this.reintentaPendientes().catch(error => this.logger.warn(`Reintento de miniatura/subtítulos: ${error.message}`));
    const now = new Date();
    const scheduled = this.publishQueue
      .filter(entry => entry.status === 'scheduled')
      .sort((a, b) => new Date(a.publishTime) - new Date(b.publishTime));
    const leadMs = (await this.dailySlotConfig())?.uploadLeadMs || 0;
    const readyToPublish = scheduled.filter(entry => {
      const due = new Date(entry.publishTime).getTime();
      // Los huecos diarios se suben antes, privados con publishAt: YouTube los
      // publica a la hora exacta aunque la VPS esté caída en ese momento.
      return due <= now.getTime() + (entry.metadata?.dailySlot ? leadMs : 0);
    });

    if (readyToPublish.length === 0) {
      if (scheduled.length > 0) {
        this.logger.info(`Publish queue: ${scheduled.length} item(s) waiting, next publish at ${scheduled[0].publishTime}`);
      } else {
        this.logger.info('Publish queue is empty — nothing scheduled yet.');
      }
      return 0;
    }

    this.logger.info(`Processing publish queue: ${readyToPublish.length} item(s) ready to publish...`);

    for (const entry of readyToPublish) {
      try {
        await this.publishContent(entry.productionId);
        this.logger.info(`Auto-published: ${entry.title}`);
      } catch (error) {
        if (error.code === 'READINESS_BLOCKED') {
          this.logger.warn(error.message);
          continue;
        }
        this.logger.error(`Failed to auto-publish ${entry.title}:`, error);
        // Mark as failed but don't stop processing other items
        if (error.code !== 'UPLOAD_OUTCOME_UNKNOWN') {
          entry.status = 'failed';
          entry.error = error.message;
          await this.db.updateScheduleEntry(entry);
        }
      }
    }
    
    return readyToPublish.length;
  }

  /** null si el modo diario está apagado (`daily_publish_enabled=false`). */
  async dailySlotConfig() {
    const setting = async (key) => (this.db.getSetting ? await this.db.getSetting(key) : null);
    if (await setting('daily_publish_enabled') === 'false') return null;
    const rawLead = await setting('daily_upload_lead_hours');
    const leadHours = rawLead === null || rawLead === '' ? NaN : Number(rawLead);
    const clocks = parseClocks(await setting('daily_publish_time') || DEFAULT_CLOCK);
    return {
      timeZone: await setting('channel_timezone') || DEFAULT_TZ,
      clock: clocks[0],
      clocks,
      // daily_shorts_time vacío o "off" = sin Shorts diarios.
      shortClocks: await this.shortClocksSetting(setting),
      uploadLeadMs: (Number.isFinite(leadHours) && leadHours >= 0 ? leadHours : 12) * 3600000
    };
  }

  async shortClocksSetting(setting) {
    const raw = await setting('daily_shorts_time');
    if (String(raw || '').trim().toLowerCase() === 'off') return [];
    return parseClocks(raw || DEFAULT_SHORT_CLOCKS, DEFAULT_SHORT_CLOCKS);
  }

  /**
   * Hueco de un encargo: el que le asignó el programador si sigue libre y en
   * el futuro; si no, el próximo libre de su formato.
   */
  async slotFor(requested, formato, daily) {
    const clocks = formato === 'short' ? daily.shortClocks : daily.clocks;
    const taken = await this.takenDailySlots(formato);
    if (requested && new Date(requested).getTime() > Date.now() + 5 * 60000) {
      const libre = nextFreeSlot({ now: new Date(new Date(requested).getTime() - 60000), timeZone: daily.timeZone, clocks, minLeadMinutes: 0, taken });
      if (libre.publishTime === new Date(requested).toISOString()) return libre.publishTime;
    }
    return nextFreeSlot({ timeZone: daily.timeZone, clocks: clocks.length ? clocks : daily.clocks, taken }).publishTime;
  }

  /** Horas futuras que ya tienen un vídeo de ese formato (en cola o ya subido con publishAt). */
  async takenDailySlots(formato = 'long') {
    const rows = this.db.getAllRows
      ? await this.db.getAllRows(
        `SELECT publish_time, metadata FROM publish_schedule
         WHERE status NOT IN ('failed', 'cancelled') AND publish_time >= ?`,
        [new Date(Date.now() - 86400000).toISOString()])
      : this.publishQueue.map(e => ({ publish_time: e.publishTime, metadata: e.metadata }));
    return rows
      .filter(row => {
        let meta = row.metadata;
        if (typeof meta === 'string') { try { meta = JSON.parse(meta); } catch { meta = {}; } }
        // Las entradas anteriores al 29/09 no llevan formato: todas eran largos.
        return meta?.dailySlot === true && (meta?.contentFormat || 'long') === formato;
      })
      .map(row => row.publish_time);
  }

  async getUpcomingSchedule(days = 7) {
    const now = new Date();
    const endDate = new Date(now.getTime() + (days * 24 * 60 * 60 * 1000));
    
    return this.publishQueue
      .filter(entry => {
        const publishTime = new Date(entry.publishTime);
        return publishTime >= now && publishTime <= endDate;
      })
      .sort((a, b) => new Date(a.publishTime) - new Date(b.publishTime));
  }

  async optimizePublishTimes() {
    // Analyze channel analytics to find optimal publish times
    const analytics = await this.getChannelAnalytics();
    const optimalTimes = this.calculateOptimalTimes(analytics);
    
    // Update scheduled content with better times
    for (const entry of this.publishQueue) {
      if (entry.status === 'scheduled' && !entry.metadata?.dailySlot) {
        const currentTime = new Date(entry.publishTime);
        const betterTime = this.findBetterTime(currentTime, optimalTimes);
        
        if (betterTime && betterTime.getTime() !== currentTime.getTime()) {
          entry.publishTime = betterTime.toISOString();
          await this.db.updateScheduleEntry(entry);
          this.logger.info(`Optimized publish time for: ${entry.title}`);
        }
      }
    }
  }

  async getChannelAnalytics() {
    try {
      // Get channel analytics for the last 30 days
      const response = await this.youtube.channels.list({
        part: 'statistics',
        mine: true
      });
      
      // In a full implementation, you'd use YouTube Analytics API
      // For now, we'll return simulated data
      return {
        totalViews: response.data.items[0]?.statistics?.viewCount || 0,
        subscribers: response.data.items[0]?.statistics?.subscriberCount || 0,
        videos: response.data.items[0]?.statistics?.videoCount || 0,
        optimalDays: ['Tuesday', 'Wednesday', 'Thursday'], // Most active days
        optimalHours: [14, 15, 16, 20] // Most active hours
      };
    } catch (error) {
      this.logger.error('Failed to get channel analytics:', error);
      return {
        optimalDays: ['Tuesday', 'Wednesday', 'Thursday'],
        optimalHours: [14, 15, 16]
      };
    }
  }

  calculateOptimalTimes(analytics) {
    const { optimalDays, optimalHours } = analytics;
    
    return {
      bestDays: optimalDays,
      bestHours: optimalHours,
      worstDays: ['Monday', 'Friday'],
      worstHours: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 22, 23]
    };
  }

  findBetterTime(currentTime, optimalTimes) {
    const currentDay = currentTime.toLocaleDateString('en-US', { weekday: 'long' });
    const currentHour = currentTime.getHours();
    
    // If current time is already optimal, return null
    if (optimalTimes.bestDays.includes(currentDay) && 
        optimalTimes.bestHours.includes(currentHour)) {
      return null;
    }
    
    // Find the next optimal time
    const nextOptimalTime = new Date(currentTime);
    
    // Try to find an optimal hour on the same day
    for (const hour of optimalTimes.bestHours) {
      if (hour > currentHour) {
        nextOptimalTime.setHours(hour, 0, 0, 0);
        if (optimalTimes.bestDays.includes(currentDay)) {
          return nextOptimalTime;
        }
      }
    }
    
    // Find next optimal day
    for (let i = 1; i <= 7; i++) {
      const testDate = new Date(currentTime.getTime() + (i * 24 * 60 * 60 * 1000));
      const testDay = testDate.toLocaleDateString('en-US', { weekday: 'long' });
      
      if (optimalTimes.bestDays.includes(testDay)) {
        testDate.setHours(optimalTimes.bestHours[0], 0, 0, 0);
        return testDate;
      }
    }
    
    return null; // No better time found
  }

  async createPublishingReport() {
    const report = {
      queueStatus: {
        total: this.publishQueue.length,
        scheduled: this.publishQueue.filter(e => e.status === 'scheduled').length,
        published: this.publishQueue.filter(e => e.status === 'published').length,
        failed: this.publishQueue.filter(e => e.status === 'failed').length
      },
      upcomingPublications: await this.getUpcomingSchedule(7),
      recentPublications: this.publishQueue
        .filter(e => e.status === 'published' && 
                new Date(e.publishedAt) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))
        .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt)),
      performance: await this.getPublishingPerformance(),
      generatedAt: new Date().toISOString()
    };
    
    return report;
  }

  async getPublishingPerformance() {
    const published = this.publishQueue.filter(e => e.status === 'published');
    
    if (published.length === 0) {
      return {
        totalPublished: 0,
        averageScheduleAccuracy: 0,
        publishingFrequency: 0
      };
    }
    
    // Calculate schedule accuracy
    let totalDelay = 0;
    let accuratePublishes = 0;
    
    published.forEach(entry => {
      const scheduledTime = new Date(entry.publishTime);
      const actualTime = new Date(entry.publishedAt);
      const delay = Math.abs(actualTime - scheduledTime) / (1000 * 60); // minutes
      
      totalDelay += delay;
      if (delay <= 5) accuratePublishes++; // Within 5 minutes is considered accurate
    });
    
    const averageDelay = totalDelay / published.length;
    const accuracyRate = (accuratePublishes / published.length) * 100;
    
    return {
      totalPublished: published.length,
      averageScheduleAccuracy: `${accuracyRate.toFixed(1)}%`,
      averageDelay: `${averageDelay.toFixed(1)} minutes`,
      publishingFrequency: this.calculatePublishingFrequency(published)
    };
  }

  calculatePublishingFrequency(published) {
    if (published.length < 2) return 'Insufficient data';
    
    const dates = published.map(p => new Date(p.publishedAt)).sort((a, b) => a - b);
    const totalDays = (dates[dates.length - 1] - dates[0]) / (1000 * 60 * 60 * 24);
    const frequency = published.length / totalDays;
    
    if (frequency >= 1) return `${frequency.toFixed(1)} videos per day`;
    if (frequency >= 0.14) return `${(frequency * 7).toFixed(1)} videos per week`;
    return `${(frequency * 30).toFixed(1)} videos per month`;
  }

  async emergencyPublish(contentId, delayMinutes = 0) {
    // For urgent publishing needs
    this.logger.info(`Emergency publish requested: ${contentId}`);
    
    const entry = this.publishQueue.find(e => 
      e.productionId === contentId || e.id === contentId
    );
    
    if (!entry) {
      throw new Error(`Content not found: ${contentId}`);
    }
    
    if (delayMinutes > 0) {
      const newPublishTime = new Date(Date.now() + (delayMinutes * 60 * 1000));
      entry.publishTime = newPublishTime.toISOString();
      await this.db.updateScheduleEntry(entry);
      this.logger.info(`Emergency scheduled for: ${entry.publishTime}`);
      return entry;
    } else {
      return await this.publishContent(contentId);
    }
  }

  async pauseScheduledContent(contentId) {
    const entry = this.publishQueue.find(e => 
      e.productionId === contentId || e.id === contentId
    );
    
    if (!entry) {
      throw new Error(`Content not found: ${contentId}`);
    }
    
    entry.status = 'paused';
    await this.db.updateScheduleEntry(entry);
    
    this.logger.info(`Content paused: ${entry.title}`);
    return entry;
  }

  async resumeScheduledContent(contentId, newPublishTime = null) {
    const entry = this.publishQueue.find(e => 
      e.productionId === contentId || e.id === contentId
    );
    
    if (!entry) {
      throw new Error(`Content not found: ${contentId}`);
    }
    
    entry.status = 'scheduled';
    if (newPublishTime) {
      entry.publishTime = new Date(newPublishTime).toISOString();
    }
    
    await this.db.updateScheduleEntry(entry);
    
    this.logger.info(`Content resumed: ${entry.title}`);
    return entry;
  }
}

module.exports = { PublishingSchedulingAgent };
