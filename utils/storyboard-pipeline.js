/**
 * Storyboard pipeline — the audio-first production path:
 *
 *   narration plan → voice (with timestamps) → timing → storyboard →
 *   asset search/selection → captions → timeline render → audio mux → QA
 *
 * Called by ProductionManagementAgent.processContent(). Everything it produces
 * is stored on production.assets.* so the rest of Oraflow (scene manifest,
 * shorts, review UI, upload) keeps working unchanged.
 */
const { leeFichas, busca, registraUso, elegirVariante } = require('./biblioteca-stock');
const fs = require('fs').promises;
const path = require('path');
const { voicePacing, buildNarrationPlan, renderTtsText, ajusteCorto } = require('./voice-pacing');
const { vozPara } = require('./voces');
const { buildTiming } = require('./narration-timing');
const { buildStoryboard, allShots, rangosDeClip } = require('./storyboard-service');
const captionService = require('./caption-service');
const { renderTimeline, probe, titleCards } = require('./timeline-renderer');
const { runProductionQA } = require('./production-qa');
const { StockMediaService } = require('./stock-media-service');
const { tokenizeWords } = require('./narration-timing');
const { normalizeReference } = require('./bible-reference');
const { esShort } = require('./formato');
const { momentoDe, consultaPaisaje, ajustePaisaje } = require('./paisaje-franja');

// Un Short de 60-90 s con planos de 14 s serían 5 fotos: en vertical se corta más.
const SHORT_SHOTS = { image: { min: 3, target: 5, max: 7 }, video: { min: 3, target: 5, max: 8 }, hero: { min: 4, target: 6, max: 9 } };
// Largo de clip en los Shorts (02/10/2026): SHORT_SHOT_SECONDS=15 → clips de ~15 s
// como en los largos. Sin la variable, los 5 s rápidos de siempre.
function shortShots(env = process.env) {
  const t = Number(env.SHORT_SHOT_SECONDS);
  if (!Number.isFinite(t) || t < 3) return SHORT_SHOTS;
  return rangosDeClip(Math.min(40, t));
}
// 1080 px de ancho: frases de 3-4 palabras o libass parte las líneas a su manera.
const SHORT_CAPTIONS = { maxWords: 4, maxCharsPerLine: 16 };
// Largos con letra ×1,5 (caption-service longScale): frases más cortas para que
// cada línea quepa centrada sin tocar los bordes.
const LONG_CAPTIONS = { maxWords: 4, maxCharsPerLine: 20 };

const norm = word => String(word || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

// Content the channel never shows. Matched against stock titles/keywords
// (STOCK_BLOCKLIST adds terms, comma-separated). Best effort: stock metadata is
// the only signal we have without looking at the pixels.
const DEFAULT_BLOCKLIST = ['kiss', 'kissing', 'besos', 'beso', 'lgbt', 'gay', 'lesbian', 'same-sex', 'same sex', 'pride parade', 'romantic couple', 'lovers', 'lingerie', 'bikini', 'nude', 'sexy', 'alcohol', 'cocktail', 'casino', 'horror', 'halloween', 'tarot', 'witch'];
// El canal es de oración: los planos son lugares naturales. Estas palabras
// delatan el falso positivo típico de "morning light" → gente en una oficina.
const NO_NATURAL = ['office', 'desk', 'laptop', 'computer', 'meeting', 'business', 'coworking',
  'startup', 'city street', 'traffic', 'urban', 'shopping', 'gym', 'bar', 'party',
  'oficina', 'escritorio', 'ordenador', 'reunión'];

const PEOPLE_TERMS = ['man', 'woman', 'men', 'women', 'person', 'people', 'girl', 'boy', 'couple', 'family', 'portrait', 'face', 'businessman', 'businesswoman', 'model', 'crowd', 'hombre', 'mujer', 'persona', 'gente', 'pareja', 'familia', 'rostro'];

function assetText(asset) {
  return `${asset?.title || ''} ${(asset?.keywords || []).map(k => (typeof k === 'string' ? k : k?.name || '')).join(' ')}`.toLowerCase();
}

function blocklist() {
  const extra = String(process.env.STOCK_BLOCKLIST || '').split(',').map(term => term.trim().toLowerCase()).filter(Boolean);
  // ONLY_NATURE=on (por defecto en el tema de oración): fuera oficinas y ciudad.
  const soloNaturaleza = String(process.env.ONLY_NATURE || (preferLandscapes() ? 'on' : 'off')).toLowerCase() === 'on';
  return [...new Set([...DEFAULT_BLOCKLIST, ...(soloNaturaleza ? NO_NATURAL : []), ...extra])];
}

function isBlocked(asset, terms = blocklist()) {
  const text = assetText(asset);
  return terms.some(term => text.includes(term));
}

function showsPeople(asset) {
  const words = new Set(assetText(asset).split(/[^\p{L}]+/u).filter(Boolean));
  return PEOPLE_TERMS.some(term => words.has(term));
}

function preferLandscapes() {
  const explicit = String(process.env.PREFER_LANDSCAPES || '').toLowerCase();
  if (explicit) return explicit === 'on' || explicit === 'true';
  return String(process.env.CHANNEL_THEME || '').toLowerCase() === 'prayer';
}

/** Find each scripture quote in the word timing → { reference, text, start, end }. */
function locateVerseCards(scriptures = [], timing) {
  const words = timing?.words || [];
  const cards = [];
  let searchFrom = 0;
  for (const verse of scriptures) {
    const tokens = tokenizeWords(verse.text).map(norm).filter(Boolean);
    if (tokens.length < 3) continue;
    let at = -1;
    for (let i = searchFrom; i < words.length - 2; i += 1) {
      if (norm(words[i].text) === tokens[0] && norm(words[i + 1].text) === tokens[1] && norm(words[i + 2].text) === tokens[2]) { at = i; break; }
    }
    if (at === -1) continue;
    const last = Math.min(words.length - 1, at + tokens.length - 1);
    const end = words[last + 1] ? Math.max(words[last].end, words[last + 1].start) : words[last].end + 0.6;
    cards.push({ reference: normalizeReference(verse.reference), text: verse.text, start: Number(words[at].start.toFixed(3)), end: Number(end.toFixed(3)) });
    searchFrom = last + 1;
  }
  return cards;
}

function enabled() {
  return String(process.env.STORYBOARD_PIPELINE || 'on').toLowerCase() !== 'off';
}

class StoryboardPipeline {
  constructor({ db, logger, videoGenerator, aiTextService = null, stockMedia = null, dataRoot = null }) {
    this.db = db;
    this.logger = logger;
    this.videoGenerator = videoGenerator;
    this.aiTextService = aiTextService;
    this.dataRoot = dataRoot || path.join(__dirname, '..', 'data');
    this.stockMedia = stockMedia || new StockMediaService({ logger, cacheDir: path.join(this.dataRoot, 'assets', 'stock') });
  }

  /** Step 1-2: narration plan + voice. Returns { plan, ttsText, audioPath, alignment }. */
  async narrate(production) {
    const pacing = voicePacing();
    const plan = buildNarrationPlan(production.script);
    if (!plan.length) throw new Error('The script has no spoken text');
    const ttsText = renderTtsText(plan, pacing);
    const ttsPath = production.assets?.script?.ttsPath;
    if (ttsPath) await fs.writeFile(ttsPath, ttsText).catch(() => {});

    const audioPath = path.join(this.dataRoot, 'audio', `${production.id}_narration.mp3`);
    await fs.mkdir(path.dirname(audioPath), { recursive: true });

    // Varias voces (03/10/2026): cada vídeo la suya, estable por su id
    // (utils/voces.js). Sin lista, la de ELEVENLABS_VOICE_ID.
    // 07/10/2026: calendario de voces (principal / secundaria / mujer).
    const voiceId = vozPara(production.id, process.env, {
      fecha: production.scheduledPublishTime || null,
      short: esShort(production.strategy || {})
    }) || process.env.ELEVENLABS_VOICE_ID || null;
    // Narration cache keyed by voice + pacing + text: a retry of the same script
    // never pays the TTS provider again, and keeps the word alignment too. The
    // pacing is in the key so a calmer setting really re-narrates.
    const crypto = require('crypto');
    const propio = ajusteCorto(ttsText); // modelo y velocidad propios de los Shorts (12/10/2026)
    const cacheKey = crypto.createHash('sha1').update(`${voiceId || ''}|${pacing.speed}|${pacing.stability}|${pacing.style}|${ttsText}${propio ? `|${propio}` : ''}`).digest('hex');
    const cacheDir = path.join(this.dataRoot, 'audio', 'cache');
    const cachedAudio = path.join(cacheDir, `${cacheKey}.mp3`);
    const cachedAlignment = path.join(cacheDir, `${cacheKey}.alignment.json`);
    let generatedPath;
    let alignment = null;
    let evidence;
    if (await fs.stat(cachedAudio).then(st => st.size > 0).catch(() => false)) {
      await fs.copyFile(cachedAudio, audioPath);
      generatedPath = audioPath;
      alignment = JSON.parse(await fs.readFile(cachedAlignment, 'utf8').catch(() => 'null'));
      evidence = { provider: 'elevenlabs', model: process.env.ELEVENLABS_TTS_MODEL || null, generatedAt: new Date().toISOString(), cost: { provider: 'cache', amount: 0 } };
      this.logger.info('Narration served from cache (same voice, speed and text)');
    } else {
      generatedPath = await this.videoGenerator.generateTTSAudio(ttsText, audioPath, { voiceId });
      evidence = this.videoGenerator.lastNarrationResult || {};
      alignment = this.videoGenerator.lastAlignment || null;
      if (await this.videoGenerator.isUsableAudioFile(generatedPath)) {
        await fs.mkdir(cacheDir, { recursive: true });
        await fs.copyFile(generatedPath, cachedAudio).catch(() => {});
        if (alignment) await fs.writeFile(cachedAlignment, JSON.stringify(alignment)).catch(() => {});
      }
    }
    const usable = await this.videoGenerator.isUsableAudioFile(generatedPath);
    const duration = usable ? await this.videoGenerator.probeAudioDuration(generatedPath) : 0;

    production.assets.audio = {
      path: generatedPath,
      duration: duration ? formatClock(duration) : production.estimatedDuration,
      durationSec: duration,
      format: 'mp3',
      generatedWith: 'AI',
      quality: usable ? 'high' : null,
      status: usable ? 'ready' : 'unavailable',
      simulated: !usable,
      provider: evidence.provider || null,
      model: evidence.model || null,
      externalTaskId: evidence.externalTaskId || null,
      generatedAt: evidence.generatedAt || new Date().toISOString(),
      cost: evidence.cost || {},
      error: usable ? null : 'No live narration provider returned usable audio',
      intentionalSilence: false,
      voiceId,
      pacing
    };
    if (usable) production.timeline.audioGenerated = new Date().toISOString();
    return { plan, ttsText, audioPath: generatedPath, alignment, duration, pacing, usable };
  }

  /** Step 3-4: timing + storyboard. */
  async storyboard(production, { plan, alignment, duration, pacing }) {
    const timing = buildTiming(plan, { alignment, duration, pacing });
    if (timing.source === 'estimated') this.logger.warn('Narration timestamps unavailable; captions and scenes use estimated timing');
    const profile = production.strategy || {};
    const storyboard = await buildStoryboard({
      script: production.script, plan, timing,
      aiTextService: this.aiTextService, logger: this.logger,
      context: { language: process.env.CONTENT_LANGUAGE || 'en', visualStyle: profile.visualStyle || process.env.VISUAL_STYLE || null },
      seed: production.id,
      format: esShort(profile) ? 'short' : null,
      visualTimingOverrides: esShort(profile) ? shortShots() : {}
    });
    return { timing, storyboard };
  }

  /**
   * Step 5: assets per shot. ONE stock search per scene (2 queries) whose
   * candidates are shared by the scene's shots — Pexels allows 200 requests/hour
   * and each search costs several. Leftover candidates carry over to the next
   * scene so a failed search still gets a related visual instead of a placeholder.
   */
  async selectAssets(production, storyboard) {
    const usedIds = new Set();
    const cacheDir = path.join(this.dataRoot, 'assets', 'stock');
    await fs.mkdir(cacheDir, { recursive: true });
    const aiImages = (production.assets?.video?.visualAssets || []).filter(p => typeof p === 'string' && /\.(png|jpe?g|webp)$/i.test(p));
    let aiCursor = 0;
    let lastAssetId = null;
    let pool = [];
    const stockAvailable = await this.stockMedia.isAvailable().catch(() => false);
    const maxQueries = Math.max(1, Number(process.env.STOCK_QUERIES_PER_SCENE) || 2);
    const landscapes = preferLandscapes();
    // Mañana / tarde / noche del contenido: paisajes de esa hora (02/10/2026).
    const momento = momentoDe(production);
    let searches = 0;
    let failures = 0;
    // Biblioteca (30/09): clips ya descargados con ficha. Se buscan primero y, al
    // repetirse, van con otra variante (utils/biblioteca-stock.js).
    const fichas = await leeFichas(cacheDir).catch(() => []);
    const usosEnVideo = new Map();       // assetId → veces usado en ESTE vídeo
    const elegidos = new Map();          // assetId → { chosen, asset } para repetir si faltan clips
    let deBiblioteca = 0;
    let sinBuscar = 0;
    let repetidos = 0;
    let n = 0;

    for (const scene of storyboard.scenes) {
      const terms = blocklist();
      // Con paisajes activados, una de las búsquedas de cada escena es un paisaje
      // de la franja (rota por escena); la otra sigue siendo la del guion.
      const consultas = [...(landscapes ? [consultaPaisaje(momento, scene.order ?? n)] : []), ...scene.stockQueries, scene.visualIntent].filter(Boolean);
      const biblioteca = busca(fichas, {
        queries: consultas,
        tipo: scene.preferredAssetType,
        orientacion: storyboard.aspectRatio === '9:16' ? 'portrait' : 'landscape',
        minDuracion: Math.ceil(Math.max(...scene.shots.map(shot => shot.duration))),
        excluir: usedIds,
        limite: Math.max(6, scene.shots.length * 3)
      }).filter(asset => !isBlocked(asset, terms));
      // Con material de sobra en la biblioteca no se busca en Pexels.
      const bastante = biblioteca.length >= scene.shots.length * 2;
      if (bastante) sinBuscar += 1;
      pool = [...biblioteca, ...pool.filter(asset => !biblioteca.some(item => item.id === asset.id))].slice(0, 40);
      if (stockAvailable && !bastante) {
        try {
          searches += 1;
          const found = await this.stockMedia.search({
            queries: consultas.slice(0, maxQueries),
            preferredAssetType: scene.preferredAssetType,
            orientation: storyboard.aspectRatio === '9:16' ? 'portrait' : 'landscape',
            minDurationSec: Math.ceil(Math.max(...scene.shots.map(shot => shot.duration))),
            excludeIds: usedIds,
            limit: Math.max(6, scene.shots.length * 3)
          });
          const allowed = found.filter(asset => !isBlocked(asset, terms));
          if (allowed.length < found.length) this.logger.info(`Blocklist removed ${found.length - allowed.length} stock candidate(s)`);
          // fresh candidates first, then whatever was left from earlier scenes
          pool = [...allowed, ...pool.filter(asset => !allowed.some(item => item.id === asset.id))].slice(0, 40);
        } catch (error) {
          failures += 1;
          this.logger.warn(`Stock search failed for scene ${scene.order + 1}: ${error.message}`);
        }
      }

      for (const shot of scene.shots) {
        let chosen = null;
        if (pool.length) {
          const ranked = pool
            .filter(asset => !usedIds.has(asset.id))
            .map(asset => ({ asset, score: this.stockMedia.score(asset, { visualIntent: scene.visualIntent, sceneQueries: scene.stockQueries, usedIds, aspectRatio: storyboard.aspectRatio })
              + (asset.type === shot.preferredAssetType ? 5 : 0)
              + (asset.desdeBiblioteca ? 4 : 0)   // ya descargado: más rápido y sin gastar disco
              // calm channels: landscapes over people unless the scene asks for a person
              - (landscapes && showsPeople(asset) && !showsPeople({ title: scene.visualIntent }) ? 25 : 0)
              // paisajes de la hora del contenido; lo que choca con ella (estrellas de mañana) se hunde
              + (landscapes ? ajustePaisaje(asset, momento) : 0) }))
            .sort((a, b) => b.score - a.score);
          for (const pick of ranked) {
            if (pick.asset.id === lastAssetId) continue;
            try {
              const localPath = await this.stockMedia.download(pick.asset, cacheDir);
              chosen = { source: pick.asset.source, assetId: pick.asset.id, url: pick.asset.url || null, localPath, type: pick.asset.type, score: pick.score, license: pick.asset.license || null, durationSec: pick.asset.durationSec || null };
              if (pick.asset.desdeBiblioteca) deBiblioteca += 1;
              elegidos.set(chosen.assetId, { chosen, usos: pick.asset.usos || 0 });
              break;
            } catch (error) {
              this.logger.warn(`Stock download failed (${pick.asset.source} ${pick.asset.id}): ${error.message}`);
              pool = pool.filter(asset => asset.id !== pick.asset.id);
            }
          }
        }
        if (!chosen && aiImages.length) {
          const localPath = aiImages[aiCursor % aiImages.length];
          aiCursor += 1;
          chosen = { source: 'generated', assetId: `ai_${aiCursor}`, url: null, localPath, type: 'image', score: null, license: 'generated' };
        }
        if (!chosen) {
          // Sin clips nuevos: repetir uno de este vídeo (el menos repetido), con otra variante.
          const otro = [...elegidos.values()]
            .filter(e => e.chosen.assetId !== lastAssetId && (e.chosen.type === shot.preferredAssetType || e.chosen.type === 'video'))
            .sort((a, b) => (usosEnVideo.get(a.chosen.assetId) || 0) - (usosEnVideo.get(b.chosen.assetId) || 0))[0];
          if (otro) { chosen = { ...otro.chosen }; repetidos += 1; }
        }
        if (chosen) {
          const previos = (elegidos.get(chosen.assetId)?.usos || 0) + (usosEnVideo.get(chosen.assetId) || 0);
          shot.variante = chosen.source === 'generated' ? null : elegirVariante(previos, `${production.id}:${chosen.assetId}:${n}`);
          usosEnVideo.set(chosen.assetId, (usosEnVideo.get(chosen.assetId) || 0) + 1);
          usedIds.add(chosen.assetId);
          lastAssetId = chosen.assetId;
          pool = pool.filter(asset => asset.id !== chosen.assetId);
          if (chosen.type === 'video') shot.visualMotion = { type: 'none' };
        }
        n += 1;
        shot.selectedAsset = chosen; // null → placeholder background at render time
      }
    }
    for (const { chosen } of elegidos.values()) {
      if (path.resolve(path.dirname(chosen.localPath)) === path.resolve(cacheDir)) await registraUso(chosen.localPath, production.id).catch(() => {});
    }
    this.logger.info(`Stock selection (${momento}${landscapes ? ", paisajes" : ""}): ${searches} searches (${failures} failed), ${usedIds.size} assets for ${allShots(storyboard).length} shots`
      + ` — biblioteca: ${deBiblioteca} reutilizados, ${sinBuscar} escenas sin ir a Pexels, ${repetidos} planos repetidos con variante`);
    return storyboard;
  }

  /** Step 6: captions from word timing, attached to scenes too. */
  async captions(production, storyboard, timing) {
    const segments = captionService.segmentWords(timing.words, storyboard.format === 'short' ? SHORT_CAPTIONS : LONG_CAPTIONS);
    for (const scene of storyboard.scenes) {
      scene.captions = segments.filter(s => s.start >= scene.audioStart - 0.01 && s.start < scene.audioEnd);
    }
    const [width, height] = storyboard.resolution.split('x').map(Number);
    const burn = String(process.env.BURN_CAPTIONS || 'on').toLowerCase() !== 'off';
    const verseCards = locateVerseCards(production.script?.scriptures || [], timing);
    storyboard.verseCards = verseCards;
    const files = await captionService.writeCaptionFiles(burn ? segments : [], path.join(this.dataRoot, 'captions'), `${production.id}_captions`, { width, height, titleCards: titleCards(storyboard), verseCards });
    if (!burn) await fs.writeFile(files.srtPath, captionService.toSrt(segments)); // SRT always has the real captions
    production.assets.captions = {
      path: files.srtPath, assPath: files.assPath, jsonPath: files.jsonPath,
      format: 'srt', language: process.env.CONTENT_LANGUAGE || 'en', autoGenerated: true,
      timingSource: timing.source, count: segments.length
    };
    production.timeline.captionsGenerated = new Date().toISOString();
    return segments;
  }

  /**
   * Portada del Short (02/10/2026): una de data/assets/portadas-short con el
   * título encima. Desde el 11/10/2026 solo se pega en el vídeo si
   * SHORT_COVER_SECONDS > 0; si no, se compone igual y queda en /portadas para
   * ponerla a mano. Nunca tumba el render.
   */
  async portadaShort(production, visualPath) {
    const { eligePortada, componePortadaShort, aplicaPortada, segundosPortada } = require('./portada-short');
    const segundos = segundosPortada();
    try {
      const fondo = await eligePortada({ logger: this.logger });
      if (!fondo) return;
      const { logoDelCanal } = require('./background-picker');
      const portada = visualPath.replace(/\.mp4$/i, '_portada.jpg');
      const sharp = require('./safe-sharp');
      const titulo = production.script?.title || '';
      const topic = production.strategy?.topic || '';
      const { eligeDeBiblioteca } = require('./biblioteca-miniaturas');
      const dePropias = await eligeDeBiblioteca({ title: titulo, topic, formato: 'short', logger: this.logger }).catch(() => null);
      if (dePropias) {
        // 11/10/2026: las portadas que hace el autor (data/assets/portadas-propias) van primero.
        await sharp(dePropias.ruta).resize(1080, 1920, { fit: 'cover' }).jpeg({ quality: 92 }).toFile(portada);
      } else try {
        // 11/10/2026: mismo diseño que la miniatura de los largos (referencia del autor).
        const { titularesMiniatura } = require('./titular-miniatura');
        const { componeMiniaturaYeshua } = require('./miniatura-yeshua');
        const { titulares } = await titularesMiniatura({
          topic, title: titulo, guion: production.script?.fullScript || '', formato: 'short', aiTextService: this.aiTextService, logger: this.logger
        });
        await componeMiniaturaYeshua({ sharp, fondo, titular: titulares[0], formato: 'short', logoPath: await logoDelCanal(), salida: portada });
      } catch (error) {
        this.logger.warn(`Portada nueva del Short no disponible (${error.message}); sale la de antes`);
        await componePortadaShort({ sharp, fondo, logoPath: await logoDelCanal(), titulo, topic, salida: portada });
      }
      if (segundos) await aplicaPortada({ video: visualPath, portada, segundos, logger: this.logger });
      production.assets.shortCover = { path: portada, background: path.basename(fondo), seconds: segundos };
    } catch (error) {
      this.logger.warn(`Portada del Short no aplicada (${error.message}); sigue sin portada`);
    }
  }

  /** Step 7-8: render visuals at narration length, then mux narration (+music). */
  async render(production, storyboard, audioPath) {
    const finalVideoPath = path.join(this.dataRoot, 'videos', `${production.id}_final.mp4`);
    const visualPath = finalVideoPath.replace(/\.mp4$/i, '_visual.mp4');
    const workDir = path.join(this.dataRoot, 'temp', 'timeline', production.id);
    await fs.mkdir(path.dirname(finalVideoPath), { recursive: true });
    const largo = storyboard.format !== 'short';
    const marcaVideo = require('./marca-video');
    // «Elementos del vídeo» (ajuste del panel, 03/10/2026): qué va encima y cuándo.
    const extras = this.db?.getSetting ? await this.db.getSetting('video_extras').catch(() => null) : null;
    const duracion = Number(production.assets?.audio?.durationSec) || null;
    // Shorts: suscribirse también (03/10/2026), a 6 s del final.
    const marca = largo
      ? await marcaVideo.marcaCuerpo({ dataRoot: this.dataRoot, logger: this.logger, extras, duracion })
      : await marcaVideo.marcaShort({ dataRoot: this.dataRoot, logger: this.logger, extras, duracion });
    const rendered = await renderTimeline(storyboard, {
      outputPath: visualPath,
      captionsAssPath: production.assets.captions?.assPath || null,
      workDir, logger: this.logger,
      concurrency: Math.max(1, Number(process.env.RENDER_CONCURRENCY) || 2),
      marca
    });
    if (storyboard.format === 'short') await this.portadaShort(production, visualPath);
    await this.videoGenerator.addAudioToVideo(visualPath, audioPath, finalVideoPath, {
      format: storyboard.format === 'short' ? 'short' : 'long', seed: production.id
    });
    // Intro de marca delante del vídeo ya mezclado: voz, música y subtítulos no se mueven entre sí.
    rendered.introSec = 0;
    if (largo && marca) {
      const [width, height] = String(storyboard.resolution || '1920x1080').split('x').map(Number);
      const { ENCODE } = require('./timeline-renderer');
      rendered.introSec = await marcaVideo.pegaIntro({
        dataRoot: this.dataRoot, finalPath: finalVideoPath, width, height, fps: storyboard.fps || 30,
        momento: momentoDe(production), encode: ENCODE, logger: this.logger
      });
    }
    // Volumen final a -14 LUFS (lo que pide YouTube), con voz, música e intro ya juntas.
    rendered.sonoridad = await require('./sonoridad').normalizaVideo(finalVideoPath, { logger: this.logger });
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
    await fs.unlink(visualPath).catch(() => {});
    return { finalVideoPath, rendered };
  }

  /** Runs the whole path. Throws on hard failure so the caller can fall back. */
  async produce(production) {
    const started = Date.now();
    const narration = await this.narrate(production);
    if (!narration.usable) throw new Error(production.assets.audio.error || 'Narration failed');

    const { timing, storyboard } = await this.storyboard(production, narration);
    await this.selectAssets(production, storyboard);
    const captions = await this.captions(production, storyboard, timing);
    const { finalVideoPath, rendered } = await this.render(production, storyboard, narration.audioPath);

    const [width, height] = storyboard.resolution.split('x').map(Number);
    const qa = await runProductionQA({
      videoPath: finalVideoPath, storyboard, captions, timing,
      narrationDurationSec: narration.duration, introSec: rendered.introSec || 0, expectedWidth: width, expectedHeight: height, logger: this.logger
    });
    await this.db.saveProductionStoryboard(production.id, { storyboard, timing, captions, qa });

    const info = await probe(finalVideoPath);
    const stats = await fs.stat(finalVideoPath);
    production.assets.storyboard = { scenes: storyboard.scenes.length, shots: rendered.shots, source: storyboard.source, timingSource: timing.source, titleCards: rendered.titleCards, introSec: rendered.introSec || 0 };
    production.assets.video = {
      ...(production.assets.video || {}),
      duration: formatClock(narration.duration), format: 'mp4', resolution: storyboard.resolution, fps: storyboard.fps, generatedWith: 'storyboard'
    };
    production.assets.finalVideo = {
      path: finalVideoPath, fileSize: stats.size, duration: formatClock(Number(info?.format?.duration) || narration.duration),
      generatedWith: 'storyboard', resolution: storyboard.resolution, format: 'mp4',
      provider: { requestedProvider: 'storyboard', actualProvider: 'storyboard', model: 'local-ffmpeg', mode: 'storyboard', generatedSeconds: 0, tasks: [], scenes: [] },
      qa
    };
    production.qualityChecks = { ...(production.qualityChecks || {}), storyboardQA: qa };
    production.timeline.videoGenerated = new Date().toISOString();
    this.logger.info(`Storyboard pipeline finished in ${((Date.now() - started) / 1000).toFixed(0)}s: ${storyboard.scenes.length} scenes, ${rendered.shots} shots, QA ${qa.passed ? 'passed' : 'FAILED'}`);
    return { storyboard, timing, captions, qa, finalVideoPath };
  }

  /** Scene manifest rows for scene-repair-service / shorts, from the storyboard. */
  static manifestFromStoryboard(storyboard, production) {
    const audio = production.assets?.audio || {};
    return storyboard.scenes.map(scene => {
      const first = scene.shots[0] || {};
      return {
        id: scene.id,
        label: scene.sectionTitle && scene.sectionStart ? scene.sectionTitle : `${scene.part} ${scene.order + 1}`,
        scriptText: scene.narration,
        prompt: scene.visualIntent,
        duration: scene.duration,
        assetType: first.selectedAsset?.type || 'image',
        assetOrigin: first.selectedAsset ? (first.selectedAsset.source === 'generated' ? 'generated' : 'stock') : 'generated',
        assetPath: first.selectedAsset?.localPath || null,
        assetSource: first.selectedAsset?.source || 'placeholder',
        visualIntent: scene.visualIntent,
        stockQueries: scene.stockQueries,
        motionType: first.visualMotion?.type || null,
        transitionType: first.transition?.type || null,
        audioStart: scene.audioStart,
        audioEnd: scene.audioEnd,
        captions: scene.captions,
        provider: first.selectedAsset?.source || 'storyboard',
        model: 'local-ffmpeg',
        status: 'ready',
        narrationProvider: audio.provider || null,
        narrationModel: audio.model || null,
        narrationStatus: 'current',
        revision: 1, locked: false, rightsConfirmed: first.selectedAsset?.license !== null,
        provenanceSourceIds: [], containsSyntheticMedia: false, estimatedCost: {}, actualCost: {}
      };
    });
  }
}

function formatClock(seconds) {
  const total = Math.round(Number(seconds) || 0);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

module.exports = { shortShots, StoryboardPipeline, enabled, allShots, locateVerseCards, isBlocked, showsPeople, blocklist, preferLandscapes, NO_NATURAL };
