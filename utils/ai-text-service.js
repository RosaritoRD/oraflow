const OpenAI = require('openai');
const { Logger } = require('./logger');

const GEMINI_MODELS = [
  'gemini-3.7-flash',
  'gemini-3.1-pro-preview',
  'gemini-3.5-flash-lite',
];
const GEMINI_DEFAULT_MODEL = GEMINI_MODELS[0];

const PROVIDERS = {
  openai: {
    name: 'OpenAI',
    baseURL: 'https://api.openai.com/v1',
    defaultModel: 'gpt-5.6',
    models: ['gpt-5.6', 'gpt-5.6-terra', 'gpt-5.6-luna'],
    envKey: 'OPENAI_API_KEY',
  },
  openrouter: {
    name: 'OpenRouter',
    baseURL: 'https://openrouter.ai/api/v1',
    defaultModel: 'openai/gpt-5.6-sol',
    models: ['openai/gpt-5.6-sol', 'anthropic/claude-fable-5', 'google/gemini-3.7-flash', 'moonshotai/kimi-k3', 'z-ai/glm-5.3'],
    envKey: 'OPENROUTER_API_KEY',
  },
  kimi: {
    name: 'Kimi (Moonshot AI)',
    baseURL: 'https://api.moonshot.ai/v1',
    defaultModel: 'kimi-k3',
    models: ['kimi-k3', 'kimi-k2.7-code', 'kimi-k2.6'],
    envKey: 'MOONSHOT_API_KEY',
  },
  mimo: {
    name: 'MiMo (Xiaomi)',
    baseURL: 'https://api.xiaomimimo.com/v1',
    defaultModel: 'mimo-v2.5-pro',
    models: ['mimo-v2.5-pro', 'mimo-v2.5'],
    envKey: 'MIMO_API_KEY',
  },
  glm: {
    name: 'GLM (Zhipu AI)',
    baseURL: 'https://api.z.ai/api/paas/v4/',
    defaultModel: 'glm-5.3',
    models: ['glm-5.3', 'glm-5.2', 'glm-5.1'],
    envKey: 'GLM_API_KEY',
  },
};

// Local AI: Ollama on the owner's PC, over Tailscale (07/10/2026). Only simple
// tasks that ask for it with `local: true` use it; if the PC is off or slow, the
// usual provider is used and the PC is left alone for a while.
const LOCAL_PAUSA_MS = 10 * 60 * 1000;

function configLocal(local = {}) {
  return {
    url: String(local.url ?? process.env.LOCAL_LLM_URL ?? '').replace(/\/+$/, ''),
    model: local.model || process.env.LOCAL_LLM_MODEL || 'qwen3:8b',
    timeoutMs: Number(local.timeoutMs || process.env.LOCAL_LLM_TIMEOUT_MS || 180000),
  };
}

class AITextService {
  constructor(credentials = {}, opciones = {}) {
    this.logger = new Logger('AITextService');
    this.client = null;
    this.gemini = null;
    this.model = null;
    this.providerName = null;
    this.local = configLocal(opciones.local);
    this.localCaidoHasta = 0;
    this.ultimoProveedor = null;

    this._init(credentials);
  }

  tieneLocal() {
    return !!this.local.url;
  }

  async _generaLocal(prompt, options) {
    const controller = new AbortController();
    const reloj = setTimeout(() => controller.abort(), this.local.timeoutMs);
    try {
      const respuesta = await fetch(`${this.local.url}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          model: this.local.model,
          stream: false,
          think: false, // qwen3 thinks by default: extra minutes and text that breaks the JSON
          ...(options.json ? { format: 'json' } : {}),
          options: {
            temperature: options.temperature ?? 0.7,
            num_predict: options.maxTokens || 2048,
            num_ctx: 8192,
          },
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      if (!respuesta.ok) throw new Error(`Ollama answered ${respuesta.status}`);
      const cuerpo = await respuesta.json();
      const texto = cuerpo?.message?.content;
      if (typeof texto !== 'string' || !texto.trim()) throw new Error('Ollama returned an empty response');
      return texto;
    } finally {
      clearTimeout(reloj);
    }
  }

  _init(credentials) {
    const provider = credentials.aiProvider?.provider;
    const apiKey = credentials.aiProvider?.apiKey;
    const model = credentials.aiProvider?.model;

    if (provider && PROVIDERS[provider] && apiKey) {
      return this._initOpenAICompatible(PROVIDERS[provider], apiKey, model);
    }

    // AI_TEXT_PROVIDER=openrouter forces a provider even if there are other
    // keys (29/09/2026: OpenAI out of credit, text goes through OpenRouter).
    const forced = String(process.env.AI_TEXT_PROVIDER || '').toLowerCase();
    if (PROVIDERS[forced] && process.env[PROVIDERS[forced].envKey]) {
      return this._initOpenAICompatible(PROVIDERS[forced], process.env[PROVIDERS[forced].envKey], process.env.AI_TEXT_MODEL || undefined);
    }

    for (const [, preset] of Object.entries(PROVIDERS)) {
      const key = process.env[preset.envKey];
      if (key) {
        return this._initOpenAICompatible(preset, key);
      }
    }

    const geminiKey = credentials.gemini?.apiKey || process.env.GEMINI_API_KEY;
    if (geminiKey) {
      return this._initGemini(geminiKey, credentials.gemini?.model);
    }

    this.logger.warn('No AI text provider configured — text generation unavailable');
  }

  _initOpenAICompatible(preset, apiKey, model) {
    this.client = new OpenAI({ apiKey, baseURL: preset.baseURL });
    this.model = model || preset.defaultModel;
    this.providerName = preset.name;
    this.logger.info(`${preset.name} initialized (model: ${this.model})`);
  }

  _initGemini(apiKey, model) {
    try {
      const { GoogleGenAI } = require('@google/genai');
      this.gemini = new GoogleGenAI({ apiKey });
      this.model = model || GEMINI_DEFAULT_MODEL;
      this.providerName = 'Google Gemini';
      this.logger.info(`Gemini initialized (model: ${this.model})`);
    } catch (error) {
      this.logger.error('Failed to initialize Gemini:', error.message);
    }
  }

  async generateText(prompt, options = {}) {
    if (options.local && this.tieneLocal() && Date.now() >= this.localCaidoHasta) {
      try {
        const texto = await this._generaLocal(prompt, options);
        this.ultimoProveedor = 'local';
        return texto;
      } catch (error) {
        this.localCaidoHasta = Date.now() + LOCAL_PAUSA_MS;
        const motivo = error.name === 'AbortError' ? `sin respuesta en ${this.local.timeoutMs} ms` : error.message;
        this.logger.warn(`Local AI (${this.local.model}) unavailable: ${motivo}. Using ${this.providerName || 'the usual provider'}.`);
      }
    }
    this.ultimoProveedor = this.providerName;
    const model = options.model || this.model;
    const maxTokens = options.maxTokens || 2048;
    const temperature = options.temperature ?? 0.7;

    if (this.gemini) {
      const config = { maxOutputTokens: maxTokens };
      if (!/^gemini-3\.(?:[5-9]|\d{2,})-/.test(model)) config.temperature = temperature;
      const response = await this.gemini.models.generateContent({
        model,
        contents: prompt,
        config,
      });
      const text = response && response.text;
      if (typeof text !== 'string' || !text.trim()) {
        throw new Error(
          `${this.providerName} returned an empty response. Check the API key and model quota — free-tier Gemini keys are rate-limited and can return empty output.`
        );
      }
      return text;
    }

    if (!this.client) {
      throw new Error('No AI text provider configured');
    }

    // ⚠️ gpt-5.x rejects `temperature` with a 400 ("only the default (1) value is
    // supported"). That used to make EVERYTHING fall back to the English templates
    // silently: scripts, SEO and storyboard. If the model doesn't accept it, it isn't
    // sent.
    const admiteTemperatura = !/^(?:gpt-5|o[1-9])/i.test(String(model));
    const params = {
      model,
      messages: [{ role: 'user', content: prompt }],
      ...(admiteTemperatura ? { temperature } : {}),
    };

    try {
      // Newer OpenAI models (gpt-5.x and later) reject the legacy max_tokens
      // parameter with a 400 error and require max_completion_tokens instead.
      const response = await this.client.chat.completions.create({
        ...params,
        max_completion_tokens: maxTokens,
      });
      return this._extractContent(response);
    } catch (error) {
      // A safety net for future models that don't accept it either.
      if (params.temperature !== undefined && /temperature/i.test(error?.message || '')) {
        const { temperature: _fuera, ...sinTemperatura } = params;
        const response = await this.client.chat.completions.create({
          ...sinTemperatura,
          max_completion_tokens: maxTokens,
        });
        return this._extractContent(response);
      }
      // Older models and some providers reject max_completion_tokens with a 400;
      // retry the same request using the legacy max_tokens spelling.
      if (
        error &&
        error.status === 400 &&
        /max(_completion)?_tokens/i.test(error.message || '')
      ) {
        const response = await this.client.chat.completions.create({
          ...params,
          max_tokens: maxTokens,
        });
        return this._extractContent(response);
      }
      throw error;
    }
  }

  _extractContent(response) {
    const content =
      response &&
      response.choices &&
      response.choices[0] &&
      response.choices[0].message
        ? response.choices[0].message.content
        : null;

    if (typeof content !== 'string' || !content.trim()) {
      // A null/empty body used to surface as cryptic "Unexpected end of JSON input"
      // in the agents' JSON parsers. Report the real cause instead.
      throw new Error(
        `${this.providerName} returned an empty response. Check the API key and model quota.`
      );
    }
    return content;
  }

  isAvailable() {
    return !!(this.client || this.gemini);
  }
}

module.exports = { AITextService, PROVIDERS, GEMINI_MODELS, GEMINI_DEFAULT_MODEL };
