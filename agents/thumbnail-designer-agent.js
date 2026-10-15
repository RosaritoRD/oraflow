const sharp = require('../utils/safe-sharp');
const prayerTheme = require('../utils/prayer-theme');
const { fechaDePublicacion, fechaDelEncargo } = require('../utils/daily-slot');
const path = require('path');
const fs = require('fs').promises;
const { Logger } = require('../utils/logger');
const { JeshuaThumbnailService, isJeshuaStyle, inputFromScript } = require('../utils/jeshua-thumbnail-service');

class ThumbnailDesignerAgent {
  constructor(db, credentials) {
    this.db = db;
    this.credentials = credentials;
    this.logger = new Logger('ThumbnailDesigner');
    this.templatesPath = path.join(__dirname, '..', 'data', 'thumbnail-templates');
  }

  async initialize() {
    this.logger.info('Initializing Thumbnail Designer Agent...');
    await this.ensureTemplatesDirectory();
    return true;
  }

  async ensureTemplatesDirectory() {
    try {
      await fs.mkdir(this.templatesPath, { recursive: true });
      await fs.mkdir(path.join(__dirname, '..', 'uploads', 'thumbnails'), { recursive: true });
    } catch (error) {
      this.logger.error('Failed to create directories:', error);
    }
  }

  async generateThumbnail(script) {
    try {
      this.logger.info(`Generating thumbnail for: ${script.title}`);

      if (String(process.env.THUMBNAIL_STYLE || '').toLowerCase() === 'oracion') {
        return await this.createPrayerThumbnail(script);
      }

      if (isJeshuaStyle()) {
        const result = await this.createJeshuaThumbnails(inputFromScript(script));
        const item = result.variants[0];
        const thumbnailData = {
          ...item, brandId: result.brandId, finalized: true,
          concept: item.plan, prompt: item.plan.image_generation_prompt,
          manifestPath: result.manifestPath, createdAt: result.createdAt,
        };
        await this.db.saveThumbnail(thumbnailData);
        return thumbnailData;
      }
      
      // Generate thumbnail concept
      const concept = await this.generateConcept(script);
      
      // Create thumbnail prompt for AI generation
      const prompt = await this.createPrompt(concept);
      
      // Generate base thumbnail
      const thumbnailPath = await this.createThumbnail(concept);
      
      // Add text overlay
      const finalThumbnail = await this.addTextOverlay(thumbnailPath, concept);
      
      // Optimize for YouTube
      const optimizedThumbnail = await this.optimizeForYouTube(finalThumbnail);
      
      const thumbnailData = {
        path: optimizedThumbnail,
        concept,
        prompt,
        dimensions: { width: 1280, height: 720 },
        fileSize: await this.getFileSize(optimizedThumbnail),
        createdAt: new Date().toISOString()
      };
      
      // Save to database
      await this.db.saveThumbnail(thumbnailData);
      
      this.logger.info('Thumbnail generated successfully');
      return thumbnailData;
    } catch (error) {
      this.logger.error('Failed to generate thumbnail:', error);
      throw error;
    }
  }

  async generateConcept(script) {
    const concepts = {
      tutorial: {
        style: 'clean',
        elements: ['step numbers', 'arrows', 'progress indicators'],
        colors: ['blue', 'white', 'green'],
        emotion: 'helpful'
      },
      explainer: {
        style: 'informative',
        elements: ['icons', 'diagrams', 'question marks'],
        colors: ['purple', 'yellow', 'white'],
        emotion: 'curious'
      },
      list: {
        style: 'numbered',
        elements: ['large numbers', 'countdown', 'highlights'],
        colors: ['red', 'yellow', 'black'],
        emotion: 'exciting'
      },
      review: {
        style: 'comparative',
        elements: ['product image', 'rating stars', 'vs symbol'],
        colors: ['orange', 'gray', 'white'],
        emotion: 'analytical'
      },
      story: {
        style: 'dramatic',
        elements: ['faces', 'emotion', 'journey path'],
        colors: ['dark blue', 'gold', 'white'],
        emotion: 'intriguing'
      }
    };

    const baseConcept = concepts[script.metadata?.strategy?.contentType?.toLowerCase()] || concepts.explainer;
    
    return {
      title: prayerTheme.isEnabled() ? String(script.title || '').trim() : this.formatThumbnailTitle(script.title),
      style: baseConcept.style,
      primaryText: this.extractPrimaryText(script.title),
      secondaryText: this.generateSecondaryText(script),
      elements: baseConcept.elements,
      colors: {
        primary: baseConcept.colors[0],
        secondary: baseConcept.colors[1],
        accent: baseConcept.colors[2]
      },
      emotion: baseConcept.emotion,
      composition: this.selectComposition(),
      effects: this.selectEffects()
    };
  }

  formatThumbnailTitle(title) {
    // Shorten title for thumbnail
    const words = title.split(' ');
    if (words.length > 5) {
      return words.slice(0, 5).join(' ') + '...';
    }
    return title;
  }

  extractPrimaryText(title) {
    // Extract most impactful words
    const impactWords = ['ultimate', 'complete', 'secret', 'truth', 'how', 'why', 'best', 'top', 'guide', 'master'];
    const titleWords = title.toLowerCase().split(' ');
    
    const foundImpactWords = titleWords.filter(word => impactWords.includes(word));
    
    if (foundImpactWords.length > 0) {
      return foundImpactWords[0].toUpperCase();
    }
    
    // Extract numbers if present
    const numbers = title.match(/\d+/);
    if (numbers) {
      return numbers[0];
    }
    
    // Use first significant word
    return titleWords.find(word => word.length > 4)?.toUpperCase() || 'WATCH';
  }

  generateSecondaryText(script) {
    if (script.metadata && script.metadata.strategy) {
      const strategy = script.metadata.strategy;
      
      if (strategy.contentType === 'Tutorial') {
        return 'STEP BY STEP';
      } else if (strategy.contentType === 'List') {
        return 'YOU WON\'T BELIEVE #1';
      } else if (strategy.contentType === 'Review') {
        return 'HONEST REVIEW';
      }
    }
    
    return 'MUST WATCH';
  }

  selectComposition() {
    const compositions = [
      'rule-of-thirds',
      'centered',
      'diagonal',
      'golden-ratio',
      'symmetrical'
    ];
    
    return compositions[Math.floor(Math.random() * compositions.length)];
  }

  selectEffects() {
    return {
      blur: Math.random() > 0.5,
      vignette: Math.random() > 0.7,
      glow: Math.random() > 0.6,
      shadow: true,
      border: Math.random() > 0.8
    };
  }

  async createPrompt(concept) {
    const prompt = `Create a YouTube thumbnail with the following specifications:
    Style: ${concept.style}
    Primary Text: "${concept.primaryText}"
    Secondary Text: "${concept.secondaryText}"
    Color Scheme: ${concept.colors.primary}, ${concept.colors.secondary}, ${concept.colors.accent}
    Elements to include: ${concept.elements.join(', ')}
    Emotional tone: ${concept.emotion}
    Composition: ${concept.composition}
    
    The thumbnail should be eye-catching, professional, and optimized for high click-through rate.
    Resolution: 1280x720px
    Format: High contrast, bold text, clear imagery`;
    
    return prompt;
  }

  async createThumbnail(concept, suffix = '') {
    // Create a base thumbnail using Sharp
    const width = 1280;
    const height = 720;
    
    const marker = suffix ? `_${suffix}` : '';
    const outputPath = path.join(__dirname, '..', 'uploads', 'thumbnails', `thumbnail${marker}_${Date.now()}.png`);

    if (prayerTheme.isEnabled()) {
      // Calm theme: dawn background (or a photo from BACKGROUNDS_DIR) with the
      // real title in a serif. Text is baked here, so addTextOverlay skips it.
      const backgrounds = await prayerTheme.listBackgrounds();
      let imageHref = null;
      if (backgrounds.length) {
        const photo = backgrounds[Date.now() % backgrounds.length];
        const buffer = await sharp(photo).resize(width, height, { fit: 'cover' }).jpeg({ quality: 88 }).toBuffer();
        imageHref = `data:image/jpeg;base64,${buffer.toString('base64')}`;
      }
      // THUMBNAIL_STYLE=loud (por defecto en este canal): amarillo enorme con
      // borde negro y la fecha, que es lo que usan los canales de oración que
      // funcionan. 'calm' deja el serif sobrio de antes.
      const estilo = String(process.env.THUMBNAIL_STYLE || 'loud').toLowerCase();
      const opciones = { width, height, imageHref, paletteIndex: Date.now() % prayerTheme.PALETTES.length };
      const svg = estilo === 'calm'
        ? prayerTheme.thumbnailSvg(concept.title, opciones)
        : prayerTheme.thumbnailLoudSvg(concept.title, {
            ...opciones,
            date: String(process.env.THUMBNAIL_DATE || 'on').toLowerCase() === 'off' ? null : prayerTheme.fechaEnEspanol(fechaDePublicacion())
          });
      await sharp(Buffer.from(svg)).resize(width, height).png().toFile(outputPath);
      return outputPath;
    }
    
    // Create gradient background
    const svg = `
      <svg width="${width}" height="${height}">
        <defs>
          <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:${this.hexToRgb(concept.colors.primary)};stop-opacity:1" />
            <stop offset="100%" style="stop-color:${this.hexToRgb(concept.colors.secondary)};stop-opacity:1" />
          </linearGradient>
        </defs>
        <rect width="${width}" height="${height}" fill="url(#gradient)" />
      </svg>
    `;
    
    await sharp(Buffer.from(svg))
      .resize(width, height)
      .png()
      .toFile(outputPath);
    
    return outputPath;
  }

  hexToRgb(color) {
    // Color name to hex mapping
    const colors = {
      'blue': '#0066CC',
      'red': '#CC0000',
      'green': '#00CC66',
      'yellow': '#FFCC00',
      'purple': '#6600CC',
      'orange': '#FF6600',
      'white': '#FFFFFF',
      'black': '#000000',
      'gray': '#808080',
      'dark blue': '#003366',
      'gold': '#FFD700'
    };
    
    return colors[color] || '#000000';
  }

  async addTextOverlay(imagePath, concept, suffix = '') {
    if (prayerTheme.isEnabled()) return imagePath;
    const marker = suffix ? `_${suffix}` : '';
    const outputPath = path.join(__dirname, '..', 'uploads', 'thumbnails', `thumbnail_final${marker}_${Date.now()}.png`);
    
    // Create text overlay SVG
    const textSvg = `
      <svg width="1280" height="720">
        <style>
          .primary { 
            fill: ${concept.colors.accent === 'white' ? 'white' : 'black'}; 
            font-size: 120px; 
            font-weight: bold; 
            font-family: Arial, sans-serif;
            text-anchor: middle;
          }
          .secondary { 
            fill: ${concept.colors.accent}; 
            font-size: 60px; 
            font-weight: bold; 
            font-family: Arial, sans-serif;
            text-anchor: middle;
          }
          .shadow {
            fill: black;
            opacity: 0.5;
          }
        </style>
        
        <!-- Shadow -->
        <text x="642" y="302" class="primary shadow">${concept.primaryText}</text>
        <text x="642" y="402" class="secondary shadow">${concept.secondaryText}</text>
        
        <!-- Main text -->
        <text x="640" y="300" class="primary">${concept.primaryText}</text>
        <text x="640" y="400" class="secondary">${concept.secondaryText}</text>
      </svg>
    `;
    
    const textOverlay = await sharp(Buffer.from(textSvg)).png().toBuffer();
    
    await sharp(imagePath)
      .composite([{
        input: textOverlay,
        top: 0,
        left: 0
      }])
      .toFile(outputPath);
    
    return outputPath;
  }

  async optimizeForYouTube(imagePath, suffix = '') {
    const marker = suffix ? `_${suffix}` : '';
    const outputPath = path.join(__dirname, '..', 'uploads', 'thumbnails', `thumbnail_optimized${marker}_${Date.now()}.jpg`);
    
    // YouTube optimization: JPEG format, proper compression
    await sharp(imagePath)
      .resize(1280, 720, {
        fit: 'cover',
        position: 'centre'
      })
      .jpeg({
        quality: 90,
        progressive: true,
        optimizeScans: true
      })
      .toFile(outputPath);
    
    // Verify file size (YouTube limit is 2MB)
    const stats = await fs.stat(outputPath);
    if (stats.size > 2 * 1024 * 1024) {
      // Re-compress if too large
      await sharp(imagePath)
        .resize(1280, 720)
        .jpeg({ quality: 80 })
        .toFile(outputPath);
    }
    
    return outputPath;
  }

  async getFileSize(filePath) {
    const stats = await fs.stat(filePath);
    return stats.size;
  }

  async generateABVariants(concept) {
    if (concept.brand_id === 'jeshua-divine-dawn') {
      const result = await this.createJeshuaThumbnails(concept.source_input, { variants: 3, startVariant: (concept.variant || 0) + 1 });
      return result.variants.map((item, index) => ({
        ...item, label: `Jeshua ${index + 2}`, concept: item.plan,
        brandId: result.brandId, finalized: true, manifestPath: result.manifestPath,
      }));
    }
    const concepts = [
      {
        label: 'Color contrast',
        concept: {
          ...concept,
          colors: {
            primary: concept.colors.secondary,
            secondary: concept.colors.primary,
            accent: concept.colors.accent
          }
        }
      },
      {
        label: 'Alternate promise',
        concept: { ...concept, primaryText: this.generateAlternativeText(concept.primaryText) }
      },
      {
        label: 'Centered composition',
        concept: { ...concept, composition: 'centered' }
      }
    ];
    const variants = [];
    for (let index = 0; index < concepts.length; index++) {
      const { label, concept: variantConcept } = concepts[index];
      const suffix = `experiment_${index + 1}`;
      const base = await this.createThumbnail(variantConcept, suffix);
      const overlay = await this.addTextOverlay(base, variantConcept, suffix);
      const optimized = await this.optimizeForYouTube(overlay, suffix);
      variants.push({ label, path: optimized, concept: variantConcept });
    }
    return variants;
  }

  generateAlternativeText(originalText) {
    const alternatives = {
      'HOW': 'WHY',
      'BEST': 'TOP',
      'GUIDE': 'SECRETS',
      'TRUTH': 'FACTS',
      'ULTIMATE': 'COMPLETE'
    };
    
    return alternatives[originalText] || originalText + '!';
  }

  /**
   * Miniatura del canal de oración. Desde el 11/10/2026 con el diseño de la
   * referencia del autor («Oración / PODEROSA / para hoy», utils/miniatura-yeshua.js)
   * y en 3 variantes A/B/C para «Probar y comparar» de YouTube Studio; se sube la A.
   * Si el diseño nuevo falla, sale el de antes (24/09) para no quedarse sin miniatura.
   */
  async createPrayerThumbnail(script) {
    const { fondoDeMiniatura, logoDelCanal, carpetaFondosManuales } = require('../utils/background-picker');
    const cuando = fechaDelEncargo(script.metadata?.strategy);
    const fondo = await fondoDeMiniatura({ titulo: script.title, cuando, logger: this.logger });
    const sello = Date.now();
    const dir = path.join(__dirname, '..', 'uploads', 'thumbnails');
    const topic = script.metadata?.strategy?.topic;
    let thumbnailData = null;
    // 11/10/2026: primero las miniaturas que hace el autor (data/assets/miniaturas-propias).
    try {
      const { eligeDeBiblioteca } = require('../utils/biblioteca-miniaturas');
      const elegida = await eligeDeBiblioteca({ title: script.title, topic, formato: 'largo', logger: this.logger });
      if (elegida) {
        const salida = path.join(dir, `oracion_${sello}.jpg`);
        const r = await sharp(elegida.ruta).resize(1920, 1080, { fit: 'cover' }).jpeg({ quality: 90, mozjpeg: true }).toFile(salida);
        thumbnailData = {
          path: salida,
          concept: { style: 'propio', background: elegida.slug, texto: elegida.texto },
          variants: [{ letra: 'A', path: salida }, ...elegida.alternativas.slice(0, 2).map((p, i) => ({ letra: 'BC'[i], path: p }))],
          prompt: null, dimensions: { width: 1920, height: 1080 }, fileSize: r.size,
          generatedWith: 'propio', createdAt: new Date().toISOString()
        };
      }
    } catch (error) { this.logger.warn(`Biblioteca de miniaturas no disponible (${error.message})`); }
    if (!thumbnailData) try {
      const { titularesMiniatura } = require('../utils/titular-miniatura');
      const { componeMiniaturaYeshua } = require('../utils/miniatura-yeshua');
      const { AITextService } = require('../utils/ai-text-service');
      const credentials = this.credentials?.credentials || this.credentials || {};
      const { titulares, origen } = await titularesMiniatura({
        topic, title: script.title, guion: script.fullScript || script.summary || script.description || '',
        aiTextService: new AITextService(credentials), logger: this.logger
      });
      // _centro.json en la colección: fondos con el cielo libre arriba → texto centrado.
      let centro = [];
      try { centro = JSON.parse(await fs.readFile(path.join(carpetaFondosManuales(), 'coleccion', '_centro.json'), 'utf8')); } catch { centro = []; }
      const layout = fondo?.nombre && centro.includes(fondo.nombre) ? 'centro' : 'izquierda';
      const variantes = [];
      for (const [i, titular] of titulares.entries()) {
        const letra = 'ABC'[i];
        const r = await componeMiniaturaYeshua({
          sharp, fondo: fondo?.ruta || null, titular, layout, formato: 'largo',
          salida: path.join(dir, `oracion_${sello}${i ? `_${letra}` : ''}.jpg`)
        });
        variantes.push({ letra, titular, path: r.salida, bytes: r.bytes });
      }
      const principal = variantes[0];
      const { width, height } = await sharp(principal.path).metadata();
      thumbnailData = {
        path: principal.path,
        concept: { style: 'oracion-yeshua', layout, background: fondo?.origen || 'none', titulares: origen },
        variants: variantes,
        prompt: fondo?.prompt || null,
        dimensions: { width, height },
        fileSize: principal.bytes,
        generatedWith: 'composed',
        createdAt: new Date().toISOString()
      };
    } catch (error) {
      this.logger.warn(`Miniatura nueva no disponible (${error.message}); sale la de antes`);
      const { componeMiniatura } = require('../utils/miniatura-oracion');
      const salida = path.join(dir, `oracion_${sello}.jpg`);
      await componeMiniatura({
        // Los fondos con el logo ya dentro (coleccion/_con_logo.json) lo traen en el mismo
        // sitio donde se pinta (x 32, y 28, 100 px): pintarlo encima lo deja nítido.
        sharp, fondo: fondo?.ruta || null, logoPath: await logoDelCanal(),
        topic, title: script.title, escrituras: script.scriptures, salida
      });
      thumbnailData = {
        path: salida,
        concept: { style: 'oracion', background: fondo?.origen || 'none' },
        prompt: fondo?.prompt || null,
        dimensions: { width: 1280, height: 720 },
        fileSize: await this.getFileSize(salida),
        generatedWith: fondo?.origen === 'ia' ? 'AI' : 'composed',
        createdAt: new Date().toISOString()
      };
    }
    await this.db.saveThumbnail(thumbnailData);
    this.logger.info(`Prayer thumbnail composed (${thumbnailData.concept.style}, ${fondo?.origen || 'no background'})`);
    return thumbnailData;
  }

  async createJeshuaThumbnails(input, options = {}) {
    if (!this.jeshuaService) {
      const { AIVideoGenerator } = require('../utils/ai-video-generator');
      const { AITextService } = require('../utils/ai-text-service');
      const credentials = this.credentials?.credentials || this.credentials || {};
      this.jeshuaService = new JeshuaThumbnailService({
        imageGenerator: new AIVideoGenerator(credentials), aiTextService: new AITextService(credentials),
      });
    }
    const artworkPath = process.env.THUMBNAIL_ARTWORK_PATH || null;
    return this.jeshuaService.create(input, {
      outputDir: path.join(__dirname, '..', 'uploads', 'thumbnails'),
      artworkPath, generate: !artworkPath, ...options,
    });
  }
}

module.exports = { ThumbnailDesignerAgent };
