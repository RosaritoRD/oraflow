const { Logger } = require('../utils/logger');
const { fechaDelEncargo } = require('../utils/daily-slot');
const { esShort } = require('../utils/formato');
const { tituloEstiloOracion, usaEstiloOracion } = require('../utils/titulo-oracion');
const { AITextService } = require('../utils/ai-text-service');
const { hashtagsDelGuion } = require('../utils/hashtags-guion');

/** Escapa los saltos de línea que quedan DENTRO de los textos de un JSON (fuera no se tocan). */
function escapaSaltosEnTextos(json) {
  let dentro = false;
  let escapado = false;
  let out = '';
  for (const ch of json) {
    if (dentro && !escapado && (ch === '\n' || ch === '\r')) { out += ch === '\n' ? '\\n' : ''; continue; }
    if (ch === '"' && !escapado) dentro = !dentro;
    escapado = ch === '\\' && !escapado;
    out += ch;
  }
  return out;
}

class SEOOptimizerAgent {
  constructor(db, credentials) {
    this.db = db;
    this.credentials = credentials;
    this.logger = new Logger('SEOOptimizer');
    this.keywordDatabase = new Map();
    this.aiTextService = new AITextService(credentials?.credentials || credentials || {});
  }

  async initialize() {
    this.logger.info('Initializing SEO Optimizer Agent...');
    await this.loadKeywordDatabase();
    return true;
  }

  async loadKeywordDatabase() {
    try {
      const keywords = await this.db.getKeywordHistory();
      keywords.forEach(kw => {
        this.keywordDatabase.set(kw.keyword, kw.performance);
      });
    } catch (error) {
      this.logger.warn('No keyword history found');
    }
  }

  async optimize(script, strategy) {
    try {
      this.logger.info(`Optimizing SEO for: ${script.title}`);
      
      const aiSEO = await this.generateSEOWithAI(script, strategy);
      let title, description, tags;

      let hashtagsIA = null;
      if (aiSEO) {
        ({ title, description, tags } = aiSEO);
        hashtagsIA = Array.isArray(aiSEO.hashtags) ? aiSEO.hashtags : null;
      } else {
        this.logger.info('Using template SEO optimization');
        // Generate optimized title
        title = await this.optimizeTitle(script.title, strategy);
        
        // Generate description
        description = await this.generateDescription(script, strategy);
        
        // Extract and optimize tags
        tags = await this.generateTags(script, strategy);
      }
      
      // Red de seguridad (02/10/2026): venga de la IA o del respaldo, sin fecha,
      // sin «para hoy» y sin gritar en mayúsculas (utils/titulo-limpio.js).
      title = require('../utils/titulo-limpio').tituloLimpio(title);
      // 03/10/2026: los largos del canal de oración, con el formato de los canales
      // grandes («ORACIÓN DE LA MAÑANA | PROMESA: ACCIÓN | Salmo 27»), venga de la
      // IA o del respaldo (utils/titulo-oracion.js).
      if (usaEstiloOracion(strategy)) {
        const { franjaDelContenido } = require('../utils/franja');
        title = tituloEstiloOracion({
          titulo: aiSEO ? aiSEO.title : title,
          franja: franjaDelContenido(script, strategy),
          referencia: (script.scriptures || [])[0]?.reference || null,
          // 05/10/2026: fecha del día en que se publica (hueco de la cola).
          fecha: strategy.publishSlot || null,
          tz: process.env.CHANNEL_TIMEZONE || 'America/New_York'
        });
      }

      // Generate hashtags
      let hashtags = hashtagsDelGuion(hashtagsIA, script, strategy);
      if (!hashtags.length || (hashtags.length === 1 && hashtags[0] === '#shorts')) {
        hashtags = hashtagsDelGuion(await this.generateHashtags(strategy), script, strategy);
      }

      // La descripción se arma por capas: bienvenida fija del canal + lo que
      // escribió la IA + hashtags + pie legal de la música.
      // 05/10/2026 (formato del autor): el versículo del vídeo, citado, tras el texto.
      const verso = (script.scriptures || []).find(v => v?.text && v?.reference);
      if (verso && !String(description || '').includes(verso.reference)) {
        description = `${String(description || '').trim()}\n\n“${String(verso.text).trim().replace(/^[“"«]|[”"»]$/g, '')}” ${verso.reference}`;
      }
      let destacados = null;
      try { destacados = JSON.parse(await this.db.getSetting?.('videos_destacados') || 'null'); } catch (_e) { destacados = null; }
      description = componeDescripcion(description, hashtags, destacados);
      
      // Create chapters/timestamps
      const chapters = await this.generateChapters(script);
      
      // Generate end screen elements
      const endScreen = await this.generateEndScreenStrategy();
      
      // Calculate SEO score
      const seoScore = await this.calculateSEOScore(title, description, tags);
      
      const seoData = {
        title,
        description,
        tags,
        hashtags,
        chapters,
        endScreen,
        seoScore,
        metadata: {
          primaryKeyword: strategy.keywords[0],
          secondaryKeywords: strategy.keywords.slice(1, 5),
          targetLength: this.calculateOptimalLength(strategy.contentType),
          language: process.env.CONTENT_LANGUAGE || 'en',
          category: this.selectCategory(strategy)
        },
        createdAt: new Date().toISOString()
      };
      
      // Save to database
      await this.db.saveSEOData(seoData);
      
      this.logger.info(`SEO optimization complete. Score: ${seoScore}/100`);
      return seoData;
    } catch (error) {
      this.logger.error('Failed to optimize SEO:', error);
      throw error;
    }
  }

  async generateSEOWithAI(script, strategy) {
    if (!this.aiTextService.isAvailable()) {
      this.logger.info('Using template SEO optimization because no AI text provider is configured');
      return null;
    }

    const escritura = (script.scriptures || [])[0];
    const pasaje = escritura?.reference ? `The script quotes ${escritura.reference}. Add the passage at the end only if the title stays under 70 characters.` : '';
    // 30/09/2026: fuera la fecha y las mayúsculas. Un título con fecha envejece al
    // día siguiente; uno por NECESIDAD se sigue buscando meses después
    // ("oración para dormir en paz", "oración para los días de cargas").
    const franjaTxt = String(strategy.franja || 'mañana').toLowerCase();
    const emoji = franjaTxt === 'noche' ? '🌙🙏' : '☀️🙏';

    const prompt = `You are optimizing YouTube metadata.
Return only valid JSON with this exact shape:
{
  "title": "title following the TITLE rules below",
  "description": "YouTube description",
  "tags": ["tag"],
  "hashtags": ["#tag"]
}

Language: ${process.env.CONTENT_LANGUAGE || 'en'} — write everything in this language.
${(strategy.titulosUsados || []).length ? `
ALREADY USED TITLES — the channel already published these; your title must be clearly DIFFERENT from all of them (different need, image or wording, not just another emoji). The examples below are examples of style only, never copy them:
${strategy.titulosUsados.slice(0, 25).map(t => `- ${t}`).join('\n')}
` : ''}
${esShort(strategy) ? `THIS IS A YOUTUBE SHORT (vertical, about one minute).
TITLE — the NEED of the person who searches, evergreen: never a date, a weekday or "hoy". Sentence case (never all caps), under 60 characters, one 🙏 at the end. Good: "Oración de la ${franjaTxt} para dormir en paz 🙏", "Oración para soltar tus cargas 🙏".
${pasaje}
- Highest-demand words in this niche (measured 02/10/2026 on the 114 most-viewed Spanish prayer videos of the year): \"poderosa\", \"protección\", \"ansiedad\", \"dormir en paz\", \"Salmo 91\", \"Padre Nuestro\". Use ONE of them when it is honestly true to this prayer; never force it.
- No clickbait and no claim you cannot back.

DESCRIPTION — plain text, 2 or 3 short lines: what this prayer gives the listener. Do NOT add any call to action (no "Amén", no subscribe): the comment invitation and the channel line are added automatically. Do NOT write a channel welcome or a music credit.

TAGS: 8 to 12, under 400 characters in total.
HASHTAGS: exactly 3, lowercase, no spaces, no accents; the first one MUST be #shorts.` : `${usaEstiloOracion(strategy) ? `TITLE — the format of the biggest Spanish prayer channels (03/10/2026, @AbrazoDivino 219K):
  ORACIÓN DE LA ${franjaTxt.toUpperCase()} | <PROMISE OF GOD FROM THE PASSAGE>: <WHAT THE LISTENER RECEIVES OR SHOULD DO> | <reference>
- The promise comes from the passage this prayer quotes, in its own words ("EL SEÑOR ES MI LUZ Y MI SALVACIÓN", "DIOS ABRIRÁ EL CAMINO", "EN PAZ ME ACOSTARÉ").
- After the colon, speak to the listener in second person: what to do or receive ("NO TEMAS LO QUE TRAIGA ESTE DÍA", "CONFÍA EN ÉL AUNQUE NO SEPAS QUÉ HACER HOY").
- The middle part in ALL CAPS; the reference at the end as written (${escritura?.reference || 'no passage: then leave the reference out'}).
- Never a date or a weekday ("hoy" and "este día" are fine). No emojis. The whole title under 100 characters.
- Examples (copy the style, not the words):
  "ORACIÓN DE LA MAÑANA | EL SEÑOR ES MI LUZ Y MI SALVACIÓN: NO TEMAS LO QUE TRAIGA ESTE DÍA | Salmo 27"
  "ORACIÓN DE LA MAÑANA | DIOS ABRIRÁ EL CAMINO: CONFÍA EN ÉL AUNQUE NO SEPAS QUÉ HACER HOY"
  "ORACIÓN DE LA MAÑANA | ENTREGA ESTE NUEVO DÍA CON FE Y EMPIEZA CON DIRECCIÓN Y PROTECCIÓN DE DIOS"
- No clickbait and no claim you cannot back.

` : `TITLE — the NEED the listener types into YouTube, evergreen so it keeps being found months later:
- Never a date, a weekday, "hoy" or "del día": a dated title looks old the next morning.
- Sentence case (NEVER all caps), between 40 and 70 characters so it is not cut on phones.
- Start with "Oración para …" (the need or the benefit) or "Oración de la ${franjaTxt} para …", and end with ${emoji}.
- The need must come from THIS prayer's topic: cargas, paz, protección de la familia, dormir, ansiedad, empezar el día, gratitud, fortaleza…
- Put the searched words FIRST ("Oración de la mañana…", "Oración de la noche…", "Oración poderosa…"): YouTube weighs the first words most.
- Examples of the style: "Oración para los días de cargas | Oración de la noche 🌙🙏", "Oración para llevar tu día a las manos de Dios ☀️🙏", "Oración para amanecer en la presencia de Dios ☀️🙏", "Oración de la noche para dejar las cargas 🌙🙏", "Oración de la mañana para empezar el día con Dios ☀️🙏", "Oración poderosa de protección para tu familia 🙏".
${pasaje}
- Highest-demand words in this niche (measured 02/10/2026 on the 114 most-viewed Spanish prayer videos of the year): \"poderosa\", \"protección\", \"ansiedad\", \"dormir en paz\", \"Salmo 91\", \"Padre Nuestro\". Use ONE of them when it is honestly true to this prayer; never force it.
- No clickbait and no claim you cannot back.

`}DESCRIPTION — plain text, no markdown, in this order:
1. One paragraph about this prayer and what it gives the listener.
2. If the prayer quotes a Bible verse, that verse on its own line with its exact reference.
Do NOT add any call to action (no "Amén", no subscribe, no notifications): the comment invitation and the channel line are added automatically, and two invitations compete. Do NOT write a channel welcome or a music credit.

TAGS: 12 to 18, under 500 characters in total.
HASHTAGS: exactly 3, lowercase, no spaces, no accents.`}

Video title: ${script.title}
Topic: ${strategy.topic}
Angle: ${strategy.angle}
Content type: ${strategy.contentType}
Target audience: ${strategy.targetAudience}
Keywords: ${(strategy.keywords || []).join(', ')}
Keep tags under YouTube's 500 character total guidance. Avoid fabricated statistics and unsupported claims.
Bible hashtags use the BOOK AND CHAPTER from the script reference, never the verse: Salmo 4:8 → #salmo4; Proverbios 3:5-6 → #proverbios3; 1 Pedro 5:7 → #1pedro5. Never invent a passage.`;

    try {
      // Un JSON ilegible se pide UNA vez más antes de caer en la plantilla (07/10/2026).
      let parsed;
      let tags;
      for (let intento = 1; ; intento += 1) {
        try {
          const response = await this.aiTextService.generateText(prompt, {
            maxTokens: 1400,
            temperature: 0.6
          });
          parsed = this.parseAIJsonResponse(response);
          tags = this.normalizeAITags(parsed?.tags, strategy);
          if (!parsed?.title || !parsed?.description || tags.length === 0) {
            throw new Error('AI SEO response missing required fields');
          }
          break;
        } catch (error) {
          if (intento >= 2) throw error;
          this.logger.info(`AI SEO: respuesta ilegible (${error.message}); se pide otra vez`);
        }
      }

      this.logger.info(`Using AI SEO optimization via ${this.aiTextService.providerName}`);
      return {
        // La franja la manda el guion, no TITLE_FORMULA (utils/franja.js, 27/09/2026).
        title: (() => {
          const { corrigeFranja, franjaDelContenido } = require('../utils/franja');
          return cortaTitulo(corrigeFranja(String(parsed.title).trim(), franjaDelContenido(script, strategy)), 100);
        })(),
        description: String(parsed.description).trim().slice(0, 5000),
        tags,
        // Sin esto se colaban los de la plantilla, que salen del título entero
        // pegado: "#OracióncortaparapediraDiosprotecciónsobremifamiliahoy".
        hashtags: Array.isArray(parsed.hashtags)
          ? parsed.hashtags.map((h) => String(h).trim()).filter(Boolean).slice(0, 3)
          : null
      };
    } catch (error) {
      this.logger.warn(`AI SEO optimization failed; using template fallback: ${error.message}`);
      return null;
    }
  }

  parseAIJsonResponse(response) {
    const text = String(response || '').trim();
    const withoutFences = text
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/```$/i, '')
      .trim();

    try {
      return JSON.parse(withoutFences);
    } catch (error) {
      const match = withoutFences.match(/\{[\s\S]*\}/);
      if (!match) {
        throw error;
      }
      try {
        return JSON.parse(match[0]);
      } catch (_e) {
        // La IA a veces deja saltos de línea crudos dentro de la descripción.
        return JSON.parse(escapaSaltosEnTextos(match[0]));
      }
    }
  }

  normalizeAITags(tags, strategy) {
    const rawTags = Array.isArray(tags) ? tags : [];
    const fallbackTags = rawTags.length > 0 ? rawTags : strategy.keywords || [];
    const uniqueTags = [];
    let totalLength = 0;

    for (const tag of fallbackTags) {
      const cleaned = String(tag).trim();
      if (!cleaned || uniqueTags.includes(cleaned)) continue;
      if (totalLength + cleaned.length + 1 > 500) break;
      uniqueTags.push(cleaned);
      totalLength += cleaned.length + 1;
    }

    return uniqueTags;
  }
  async optimizeTitle(originalTitle, strategy) {
    // YouTube title limit: 100 characters, optimal: 60-70
    let optimizedTitle = originalTitle;
    
    // Add power words if not present
    const powerWords = ['Ultimate', 'Complete', 'Essential', 'Proven', 'Secret', 'Amazing', 'Powerful'];
    const hasPowerWord = powerWords.some(word => 
      originalTitle.toLowerCase().includes(word.toLowerCase())
    );
    
    if (!hasPowerWord && originalTitle.length < 60) {
      const randomPowerWord = powerWords[Math.floor(Math.random() * powerWords.length)];
      optimizedTitle = `${randomPowerWord} ${originalTitle}`;
    }
    
    // Add year if relevant and not present
    const currentYear = new Date().getFullYear();
    if (!optimizedTitle.includes(currentYear.toString()) && optimizedTitle.length < 70) {
      optimizedTitle = `${optimizedTitle} (${currentYear})`;
    }
    
    // Ensure primary keyword is in title
    const primaryKeyword = strategy.keywords[0];
    if (primaryKeyword && !optimizedTitle.toLowerCase().includes(primaryKeyword.toLowerCase())) {
      optimizedTitle = `${optimizedTitle} - ${primaryKeyword}`;
    }
    
    // Truncate if too long
    if (optimizedTitle.length > 100) {
      optimizedTitle = optimizedTitle.substring(0, 97) + '...';
    }
    
    // Capitalize properly
    optimizedTitle = this.titleCase(optimizedTitle);
    
    return optimizedTitle;
  }

  titleCase(str) {
    const smallWords = ['a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'if', 'in', 'of', 'on', 'or', 'the', 'to', 'via', 'vs'];
    
    return str.split(' ').map((word, index) => {
      if (index === 0 || !smallWords.includes(word.toLowerCase())) {
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      }
      return word.toLowerCase();
    }).join(' ');
  }

  async generateDescription(script, strategy) {
    // YouTube description limit: 5000 characters, first 125 shown in search
    
    let description = '';
    
    // First 125 characters - most important for SEO
    const hook = `${script.title} - In this video, you'll discover ${strategy.angle.toLowerCase()}.`;
    description += hook + '\n\n';
    
    // Video overview
    description += '📺 WHAT YOU\'LL LEARN:\n';
    if (script.mainContent && script.mainContent.sections) {
      script.mainContent.sections.slice(0, 5).forEach(section => {
        if (section.title) {
          description += `• ${section.title}\n`;
        }
      });
    }
    description += '\n';
    
    // Timestamps/Chapters
    description += '⏱️ TIMESTAMPS:\n';
    description += '00:00 Introduction\n';
    let timestamp = 20;
    if (script.mainContent && script.mainContent.sections) {
      script.mainContent.sections.forEach(section => {
        const minutes = Math.floor(timestamp / 60);
        const seconds = timestamp % 60;
        description += `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')} ${section.title || 'Section'}\n`;
        timestamp += section.duration || 60;
      });
    }
    description += '\n';
    
    // Keywords paragraph (SEO optimized)
    description += '📝 ABOUT THIS VIDEO:\n';
    description += `This comprehensive guide on ${strategy.topic} covers everything you need to know. `;
    description += `Whether you're a beginner or advanced, you'll find valuable insights about ${strategy.keywords.slice(0, 3).join(', ')}. `;
    description += `Perfect for ${strategy.targetAudience}.\n\n`;
    
    // Links section
    description += '🔗 USEFUL LINKS:\n';
    description += `• Subscribe: [Your Channel URL]\n`;
    description += `• Website: ${process.env.WEBSITE_URL || '[Your Website]'}\n`;
    description += `• Social Media: ${process.env.SOCIAL_LINKS || '[Your Social Media]'}\n\n`;
    
    // Related videos
    description += '📹 RELATED VIDEOS:\n';
    description += '• [Related Video 1]\n';
    description += '• [Related Video 2]\n';
    description += '• [Related Video 3]\n\n';
    
    // Equipment/Tools (if applicable)
    if (strategy.contentType === 'Tutorial') {
      description += '🛠️ TOOLS & RESOURCES MENTIONED:\n';
      description += '• [Tool/Resource 1]\n';
      description += '• [Tool/Resource 2]\n\n';
    }
    
    // Contact/Business
    description += '📧 BUSINESS INQUIRIES:\n';
    description += `${process.env.BUSINESS_EMAIL || '[Your Business Email]'}\n\n`;
    
    // Tags/Hashtags
    description += '🏷️ TAGS:\n';
    const hashtags = await this.generateHashtags(strategy);
    description += hashtags.join(' ') + '\n\n';
    
    // Disclaimer if needed
    description += '⚠️ DISCLAIMER:\n';
    description += 'This video is for educational purposes only.\n\n';
    
    // Copyright
    description += `© ${new Date().getFullYear()} All Rights Reserved\n`;
    
    // Music credits if applicable
    description += '\n🎵 MUSIC:\n';
    description += 'Background music from YouTube Audio Library\n';
    
    return description;
  }

  async generateTags(script, strategy) {
    const tags = new Set();
    
    // Add primary keywords
    strategy.keywords.forEach(keyword => tags.add(keyword));
    
    // Add topic variations
    const topic = strategy.topic.toLowerCase();
    tags.add(topic);
    tags.add(topic.replace(/\s+/g, ''));
    tags.add(topic.replace(/\s+/g, '_'));
    
    // Add content type tags
    const contentTypeTags = {
      'Tutorial': ['how to', 'tutorial', 'guide', 'step by step', 'learn'],
      'Explainer': ['explained', 'what is', 'understanding', 'explanation'],
      'Review': ['review', 'comparison', 'vs', 'best', 'top'],
      'List': ['top 10', 'best', 'list', 'countdown'],
      'Story': ['story', 'journey', 'experience', 'case study']
    };
    
    const typeTags = contentTypeTags[strategy.contentType] || [];
    typeTags.forEach(tag => tags.add(tag));
    
    // Add year tags
    const year = new Date().getFullYear();
    tags.add(year.toString());
    tags.add(`${topic} ${year}`);
    
    // Add niche-specific tags
    const niche = this.identifyNiche(strategy);
    const nicheTags = this.getNicheTags(niche);
    nicheTags.forEach(tag => tags.add(tag));
    
    // Add long-tail keywords
    const longTailKeywords = this.generateLongTailKeywords(strategy);
    longTailKeywords.forEach(keyword => tags.add(keyword));
    
    // Extract tags from script content
    if (script.keywords) {
      script.keywords.forEach(keyword => tags.add(keyword));
    }
    
    // Add channel branding tags
    if (process.env.CHANNEL_NAME) {
      tags.add(process.env.CHANNEL_NAME);
    }
    
    // YouTube allows max 500 characters in tags, prioritize most important
    const tagArray = Array.from(tags);
    const prioritizedTags = this.prioritizeTags(tagArray, strategy);
    
    // Ensure total character count doesn't exceed 500
    let totalLength = 0;
    const finalTags = [];
    
    for (const tag of prioritizedTags) {
      if (totalLength + tag.length + 1 <= 500) {
        finalTags.push(tag);
        totalLength += tag.length + 1; // +1 for comma separator
      }
    }
    
    return finalTags;
  }

  identifyNiche(strategy) {
    const topic = strategy.topic.toLowerCase();
    
    const niches = {
      'technology': ['tech', 'software', 'hardware', 'gadget', 'computer', 'phone', 'app'],
      'gaming': ['game', 'gaming', 'gamer', 'play', 'stream'],
      'education': ['learn', 'study', 'course', 'tutorial', 'education', 'teach'],
      'business': ['business', 'entrepreneur', 'startup', 'money', 'finance', 'invest'],
      'lifestyle': ['life', 'lifestyle', 'daily', 'routine', 'habit'],
      'health': ['health', 'fitness', 'workout', 'diet', 'nutrition', 'wellness'],
      'entertainment': ['fun', 'comedy', 'entertainment', 'funny', 'laugh']
    };
    
    for (const [niche, keywords] of Object.entries(niches)) {
      if (keywords.some(keyword => topic.includes(keyword))) {
        return niche;
      }
    }
    
    return 'general';
  }

  getNicheTags(niche) {
    const nicheTags = {
      'technology': ['tech', 'technology', 'innovation', 'future tech', 'tech news'],
      'gaming': ['gaming', 'gameplay', 'walkthrough', 'lets play', 'game review'],
      'education': ['educational', 'learning', 'study tips', 'online learning', 'edtech'],
      'business': ['business tips', 'entrepreneurship', 'startup', 'business strategy', 'success'],
      'lifestyle': ['lifestyle', 'life hacks', 'daily routine', 'productivity', 'self improvement'],
      'health': ['health tips', 'fitness', 'healthy living', 'wellness', 'nutrition'],
      'entertainment': ['entertainment', 'fun', 'viral', 'trending', 'must watch'],
      'general': ['video', 'youtube', 'content', 'new', 'latest']
    };
    
    return nicheTags[niche] || nicheTags.general;
  }

  generateLongTailKeywords(strategy) {
    const longTailTemplates = [
      `how to ${strategy.topic}`,
      `${strategy.topic} for beginners`,
      `${strategy.topic} tutorial`,
      `best ${strategy.topic}`,
      `${strategy.topic} tips and tricks`,
      `${strategy.topic} step by step`,
      `${strategy.topic} guide ${new Date().getFullYear()}`,
      `${strategy.topic} explained simply`,
      `everything about ${strategy.topic}`,
      `${strategy.topic} mistakes to avoid`
    ];
    
    return longTailTemplates.slice(0, 5);
  }

  prioritizeTags(tags, strategy) {
    // Score and sort tags by importance
    const scoredTags = tags.map(tag => {
      let score = 0;
      
      // Primary keyword gets highest score
      if (tag === strategy.keywords[0]) score += 10;
      
      // Other strategy keywords
      if (strategy.keywords.includes(tag)) score += 5;
      
      // Contains topic
      if (tag.includes(strategy.topic.toLowerCase())) score += 3;
      
      // Long-tail keywords
      if (tag.split(' ').length > 2) score += 2;
      
      // Current year
      if (tag.includes(new Date().getFullYear().toString())) score += 1;
      
      return { tag, score };
    });
    
    // Sort by score descending
    scoredTags.sort((a, b) => b.score - a.score);
    
    return scoredTags.map(item => item.tag);
  }

  async generateHashtags(strategy) {
    const hashtags = [];
    
    // Primary hashtag
    const primaryHashtag = `#${strategy.topic.replace(/\s+/g, '')}`;
    hashtags.push(primaryHashtag);
    
    // Content type hashtag
    hashtags.push(`#${strategy.contentType.toLowerCase()}`);
    
    // Trending hashtags
    const trendingHashtags = [
      '#youtube',
      '#youtuber',
      '#subscribe',
      '#video',
      '#viral',
      '#trending',
      '#new'
    ];
    
    // Niche hashtags
    const niche = this.identifyNiche(strategy);
    const nicheHashtags = {
      'technology': ['#tech', '#technology', '#innovation'],
      'gaming': ['#gaming', '#gamer', '#games'],
      'education': ['#education', '#learning', '#study'],
      'business': ['#business', '#entrepreneur', '#success'],
      'lifestyle': ['#lifestyle', '#life', '#daily'],
      'health': ['#health', '#fitness', '#wellness'],
      'entertainment': ['#entertainment', '#fun', '#funny']
    };
    
    const selectedNicheHashtags = nicheHashtags[niche] || [];
    hashtags.push(...selectedNicheHashtags.slice(0, 2));
    
    // Add 2-3 trending hashtags
    hashtags.push(...trendingHashtags.slice(0, 3));
    
    // Year hashtag
    hashtags.push(`#${new Date().getFullYear()}`);
    
    // Limit to 15 hashtags (YouTube recommendation)
    return hashtags.slice(0, 15);
  }

  async generateChapters(script) {
    const chapters = [];
    let currentTime = 0;
    
    // Introduction
    chapters.push({
      time: '00:00',
      title: 'Introduction',
      seconds: 0
    });
    
    currentTime = 20; // Intro duration
    
    // Main content chapters
    if (script.mainContent && script.mainContent.sections) {
      script.mainContent.sections.forEach(section => {
        const minutes = Math.floor(currentTime / 60);
        const seconds = currentTime % 60;
        const timeString = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        
        chapters.push({
          time: timeString,
          title: section.title || 'Section',
          seconds: currentTime
        });
        
        currentTime += section.duration || 60;
      });
    }
    
    // Conclusion
    const conclusionMinutes = Math.floor(currentTime / 60);
    const conclusionSeconds = currentTime % 60;
    chapters.push({
      time: `${conclusionMinutes.toString().padStart(2, '0')}:${conclusionSeconds.toString().padStart(2, '0')}`,
      title: 'Conclusion & Next Steps',
      seconds: currentTime
    });
    
    return chapters;
  }

  async generateEndScreenStrategy() {
    return {
      elements: [
        {
          type: 'video',
          position: 'left',
          title: 'Recommended Video',
          duration: 20
        },
        {
          type: 'playlist',
          position: 'right',
          title: 'Watch More',
          duration: 20
        },
        {
          type: 'subscribe',
          position: 'center-bottom',
          duration: 20
        }
      ],
      startTime: -20, // 20 seconds before end
      template: 'standard'
    };
  }

  async calculateSEOScore(title, description, tags) {
    let score = 0;
    
    // Title scoring (30 points max)
    if (title.length >= 60 && title.length <= 70) score += 10;
    else if (title.length >= 50 && title.length <= 100) score += 5;
    
    if (/\d/.test(title)) score += 5; // Contains number
    if (/[A-Z]/.test(title)) score += 5; // Proper capitalization
    if (title.includes(new Date().getFullYear().toString())) score += 5; // Current year
    if (['how', 'what', 'why', 'best', 'top'].some(word => title.toLowerCase().includes(word))) score += 5;
    
    // Description scoring (40 points max)
    if (description.length >= 200) score += 10;
    if (description.length >= 500) score += 10;
    if (description.includes('TIMESTAMPS')) score += 5;
    if (description.includes('http')) score += 5; // Contains links
    if (description.split('\n').length > 10) score += 5; // Well formatted
    if (description.substring(0, 125).includes(tags[0])) score += 5; // Primary keyword in first 125 chars
    
    // Tags scoring (30 points max)
    if (tags.length >= 10) score += 10;
    if (tags.length >= 15) score += 5;
    if (tags.some(tag => tag.split(' ').length > 2)) score += 5; // Long-tail keywords
    if (tags.join('').length <= 500) score += 5; // Within character limit
    if (new Set(tags).size === tags.length) score += 5; // No duplicates
    
    return Math.min(100, score);
  }

  calculateOptimalLength(contentType) {
    const optimalLengths = {
      'Tutorial': '10-15 minutes',
      'Explainer': '5-10 minutes',
      'Review': '8-12 minutes',
      'List': '8-15 minutes',
      'Story': '10-20 minutes'
    };
    
    return optimalLengths[contentType] || '8-12 minutes';
  }

  selectCategory(strategy) {
    const categories = {
      'technology': 28, // Science & Technology
      'gaming': 20, // Gaming
      'education': 27, // Education
      'business': 27, // Education (closest match)
      'lifestyle': 22, // People & Blogs
      'health': 26, // Howto & Style
      'entertainment': 24 // Entertainment
    };
    
    const niche = this.identifyNiche(strategy);
    return categories[niche] || 22; // Default to People & Blogs
  }
}


/**
 * Descripción por capas. Las partes fijas viven en el .env para que el canal las
 * cambie sin tocar código:
 *   DESCRIPTION_INTRO   bienvenida del canal (2-3 líneas)
 *   DESCRIPTION_FOOTER  pie legal (atribución de la música)
 * Un "\\n" en el .env se convierte en salto de línea real.
 */
/** "MIÉRCOLES 23 DE SEPTIEMBRE" en la zona horaria del canal. */
function fechaDeHoy(fecha = new Date()) {
  const zona = process.env.CHANNEL_TIMEZONE || 'America/New_York';
  const idioma = (process.env.CONTENT_LANGUAGE || 'es').startsWith('es') ? 'es-ES' : 'en-US';
  const dia = new Intl.DateTimeFormat(idioma, { weekday: 'long', timeZone: zona }).format(fecha);
  const numero = new Intl.DateTimeFormat(idioma, { day: 'numeric', timeZone: zona }).format(fecha);
  const mes = new Intl.DateTimeFormat(idioma, { month: 'long', timeZone: zona }).format(fecha);
  return (idioma === 'es-ES' ? `${dia} ${numero} de ${mes}` : `${dia}, ${mes} ${numero}`).toUpperCase();
}

/** Una frase por párrafo (formato pedido el 30/09). Solo corta tras . ! ? seguido
    de mayúscula, así "Salmo 121:7-8" o "4:00 a. m." quedan enteros. */
function enParrafos(texto) {
  return String(texto || '')
    .split(/\n+/)
    .flatMap((linea) => linea.split(/(?<=[.!?…])\s+(?=[¡¿"“«(]?[A-ZÁÉÍÓÚÑÜ])/))
    .map((frase) => frase.trim())
    .filter(Boolean)
    .join('\n\n');
}

/** Recorta a `max` sin partir palabras ni dejar un separador colgando ("… PARA TODO EL D" → "… PARA TODO EL"). */
function cortaTitulo(titulo, max = 100) {
  let t = String(titulo || '').trim();
  if ([...t].length > max) {
    t = [...t].slice(0, max + 1).join('');
    t = t.slice(0, Math.max(t.lastIndexOf(' '), 1));
  }
  return t.replace(/[\s|—–:,-]+$/u, '').trim();
}

const INVITA = '¡Te invitamos a ver la siguiente oración! 🙏';
const VER = 'Tienes que ver este vídeo:';

/**
 * `destacados` = { invita: {url}, ver: {url} } (utils/destacados.js): arriba el
 * largo más visto y, tras la raya del pie, el Short más visto (05/10/2026).
 */
function componeDescripcion(cuerpo, hashtags = [], destacados = null) {
  const real = (texto) => String(texto || '').replace(/\\n/g, '\n').trim();
  const partes = [];
  if (destacados?.invita?.url) partes.push(`${INVITA}\n${destacados.invita.url}`);
  if (process.env.DESCRIPTION_INTRO) partes.push(enParrafos(real(process.env.DESCRIPTION_INTRO)));
  if (cuerpo) partes.push(enParrafos(cuerpo));
  const etiquetas = (Array.isArray(hashtags) ? hashtags : [])
    .map((h) => String(h).trim()).filter(Boolean)
    .map((h) => (h.startsWith('#') ? h : `#${h}`)).slice(0, 3);
  // 05/10/2026 (formato del autor): los hashtags del vídeo van al final, tras el pie.
  const pieEditado = String(require('../utils/textos-canal').texto('pie_youtube') || '').trim();
  if (pieEditado || process.env.DESCRIPTION_FOOTER) {
    let pie = pieEditado || real(process.env.DESCRIPTION_FOOTER);
    if (destacados?.ver?.url) {
      const bloque = `${VER}\n${destacados.ver.url}`;
      pie = /^━{3,}.*$/m.test(pie) ? pie.replace(/^(━{3,}.*)$/m, `$1\n${bloque}`) : `${bloque}\n\n${pie}`;
    }
    partes.push(pie);
  }
  if (etiquetas.length) partes.push(etiquetas.join(' '));
  return partes.join('\n\n');
}

module.exports = { INVITA, VER, SEOOptimizerAgent, componeDescripcion, fechaDeHoy, cortaTitulo };
