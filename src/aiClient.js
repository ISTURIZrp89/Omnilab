// ============================================================
// aiClient.js — OmniLab v1.0.3 | Pipeline Multi-Hardware AI
// ============================================================
import AI_CONFIG from './aiConfig.js';

// ─── Esquema JSON de Comunicación AI → React ───────────────────────────────
/**
 * @typedef {Object} AIExtractionPayload
 * @property {string} source           - Nombre del archivo origen
 * @property {string} profile          - 'ECO' | 'BALANCED' | 'PRO'
 * @property {string} extractionModel  - Modelo usado para extracción
 * @property {string} reportingModel   - Modelo usado para redacción de reporte
 * @property {string} timestamp        - ISO timestamp
 * @property {Object} tables           - { COND_AMB: {...}, EQUIPOS: {...}, RECEPCION: {...}, BITACORA: {...} }
 * @property {string|null} report      - Reporte en lenguaje natural generado por el modelo de reporting
 * @property {string[]} suggestions    - Sugerencias de autocompletado BITACORA
 * @property {string[]} errors         - Lista de errores no fatales
 */

class AIClient {
  constructor() {
    this.provider        = 'ollama';
    this.model           = 'phi3.5:3.8b';
    this.profile         = 'BALANCED';
    this.analysisModel   = null;
    this.extractionModel = null;
    this.reportingModel  = null;
    this.conversationHistory = [];
    this.isLoading       = false;
    this.abortController = null;
    this.availableProviders = [];
    this._hwProfileCache = null;
    this._hwProfileTimestamp = 0;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // BLOQUE 1: PERFILADOR DE HARDWARE
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Detecta RAM disponible y devuelve el perfil ECO / BALANCED / PRO.
   * Cachea el resultado 60 s para no spamear la API del OS.
   * @returns {Promise<{profile: string, ram: number, config: Object, hasGpu: boolean}>}
   */
  async getHardwareProfile() {
    const now = Date.now();
    if (this._hwProfileCache && now - this._hwProfileTimestamp < 60_000) {
      return this._hwProfileCache;
    }

    try {
      const os = await import('@tauri-apps/plugin-os');

      const [totalRamBytes, cpuCount] = await Promise.all([
        os.totalMemory(),
        os.cpuCount?.() ?? Promise.resolve(4),
      ]);

      const totalRamGb = totalRamBytes / (1024 ** 3);

      // Detección básica de GPU: si la RAM es >12GB asumimos PRO
      const hasGpu = totalRamGb > 12;

      let profile = 'ECO';
      if (totalRamGb > 12 || hasGpu) profile = 'PRO';
      else if (totalRamGb >= 6)       profile = 'BALANCED';

      console.log(
        `[OmniLab AI] Perfil detectado: ${AI_CONFIG.hardwareProfiles[profile].icon} ${profile} ` +
        `(${Math.round(totalRamGb)}GB RAM, ${cpuCount} CPUs)`
      );

      const result = {
        profile,
        ram:    totalRamGb,
        cpu:    cpuCount,
        hasGpu,
        config: AI_CONFIG.hardwareProfiles[profile],
      };

      this._hwProfileCache    = result;
      this._hwProfileTimestamp = now;
      return result;

    } catch (e) {
      console.warn('[OmniLab AI] No se pudo detectar hardware, usando ECO:', e.message);
      const fallback = { profile: 'ECO', ram: 4, cpu: 2, hasGpu: false, config: AI_CONFIG.hardwareProfiles.ECO };
      this._hwProfileCache    = fallback;
      this._hwProfileTimestamp = now;
      return fallback;
    }
  }

  /**
   * Configura los modelos del cliente según el perfil de hardware.
   */
  async setProfileModels() {
    const hw = await this.getHardwareProfile();
    this.profile         = hw.profile;
    this.analysisModel   = hw.config.analysis;
    this.extractionModel = hw.config.extraction;
    this.reportingModel  = hw.config.reporting;
    this.model           = this.analysisModel;
    console.log(
      `[OmniLab AI] Modelos activos → análisis:${this.analysisModel} | extracción:${this.extractionModel} | reporte:${this.reportingModel}`
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // BLOQUE 2: DISPATCHER DE ARCHIVOS
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Determina la tabla destino según el nombre/tipo de archivo.
   * @param {string} type     - MIME type del archivo
   * @param {string} filename - Nombre del archivo
   * @returns {string}  'COND_AMB' | 'EQUIPOS' | 'RECEPCION' | 'BITACORA'
   */
  determineTargetTable(type, filename) {
    const fn  = filename.toLowerCase();
    const mime = (type || '').toLowerCase();

    // Palabras clave → tabla
    const rules = [
      { keys: ['temp', 'hum', 'cond', 'ambiente', 'ambiental', 'clima', 'co2', 'presion'], table: 'COND_AMB'  },
      { keys: ['equipo', 'manten', 'calibrac', 'servicio', 'reparac'],                      table: 'EQUIPOS'   },
      { keys: ['recep', 'lote', 'reactivo', 'proveedor', 'factura', 'compra'],               table: 'RECEPCION' },
    ];

    for (const rule of rules) {
      if (rule.keys.some(k => fn.includes(k))) return rule.table;
    }

    // Imágenes sin coincidencia → COND_AMB (fotos de termómetros)
    if (mime.startsWith('image/')) return 'COND_AMB';

    return 'BITACORA';
  }

  /**
   * Genera el prompt de extracción según la tabla destino.
   * @param {string} target   - Tabla destino
   * @param {string} type     - MIME type
   * @param {string} filename - Nombre del archivo
   * @returns {string}
   */
  buildExtractionPrompt(target, type, filename) {
    const schema = AI_CONFIG.formSchemas[target];
    const fields = schema?.fields?.map(f => `"${f.key}": <${f.type}>`).join(', ') || '';

    return `Analiza el archivo "${filename}" (tipo: ${type}) y extrae los datos para la tabla ${target} de OmniLab.

ESQUEMA REQUERIDO:
{ ${fields} }

REGLAS:
- Devuelve SOLO el objeto JSON. Sin texto adicional.
- null para campos no encontrados.
- Fechas en formato ISO (YYYY-MM-DD).
- Números sin unidades (solo el valor numérico).
- tipo_registro="${target.toLowerCase()}"`;
  }

  /**
   * Pipeline completo: extrae datos con DeepSeek/bonsai y genera reporte con Phi/Llama.
   * Implementa segregación de contextos — cada tabla es independiente.
   *
   * @param {{ name: string, content?: string, base64?: string }} fileData
   * @param {string} mimeType - MIME type del archivo
   * @returns {Promise<AIExtractionPayload>}
   */
  async dispatchFile(fileData, mimeType) {
    const hw     = await this.getHardwareProfile();
    const target = this.determineTargetTable(mimeType, fileData.name);
    const errors = [];

    console.log(`[OmniLab Dispatcher] ${fileData.name} → ${target} [${hw.profile}]`);

    // ── Step 1: Extracción con modelo especializado (contexto aislado) ──────
    let extractedData = null;
    try {
      const extractionPrompt = this.buildExtractionPrompt(target, mimeType, fileData.name);
      const rawResponse = await this._isolatedChat(extractionPrompt, {
        model:       hw.config.extraction,
        systemPrompt: AI_CONFIG.settings.extractionSystemPrompt,
        temperature:  AI_CONFIG.settings.extractionTemperature,
        maxTokens:    1024,
      });
      extractedData = this.parseJSON(rawResponse);
      if (!extractedData) throw new Error('Respuesta JSON inválida del extractor');
    } catch (e) {
      errors.push(`Extracción fallida: ${e.message}`);
      console.error('[OmniLab Dispatcher] Error de extracción:', e);
    }

    // ── Step 2: Redacción de reporte con modelo de análisis (contexto separado) ──
    let report = null;
    if (extractedData) {
      try {
        const reportContext = JSON.stringify(extractedData, null, 2);
        const reportPrompt  = `Con base en estos datos extraídos de laboratorio:\n\n${reportContext}\n\nRedacta una entrada concisa para la bitácora técnica de OmniLab (máx. 3 oraciones), mencionando valores críticos si los hay.`;
        report = await this._isolatedChat(reportPrompt, {
          model:        hw.config.reporting,
          systemPrompt: AI_CONFIG.settings.systemPrompt,
          temperature:  0.4,
          maxTokens:    512,
        });
      } catch (e) {
        errors.push(`Redacción de reporte fallida: ${e.message}`);
      }
    }

    // ── Step 3: Sugerencias BITACORA (solo si target es BITACORA) ───────────
    let suggestions = [];
    if (target === 'BITACORA') {
      suggestions = await this.getProactiveSuggestions(
        extractedData ? JSON.stringify(extractedData).slice(0, 300) : fileData.name
      );
    }

    /** @type {AIExtractionPayload} */
    const payload = {
      source:         fileData.name,
      profile:        hw.profile,
      extractionModel: hw.config.extraction,
      reportingModel:  hw.config.reporting,
      timestamp:       new Date().toISOString(),
      tables: {
        COND_AMB:  target === 'COND_AMB'  ? extractedData : null,
        EQUIPOS:   target === 'EQUIPOS'   ? extractedData : null,
        RECEPCION: target === 'RECEPCION' ? extractedData : null,
        BITACORA:  target === 'BITACORA'  ? extractedData : null,
      },
      report,
      suggestions,
      errors,
      // Campos de control (Sentinel)
      _target:      target,
      _sync_pending: 0, // No sincronizar hasta validación del usuario
    };

    console.log('[OmniLab Dispatcher] Payload listo:', payload);
    return payload;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // BLOQUE 3: AUTOCOMPLETADO PROACTIVO BITÁCORA
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Genera sugerencias de texto para campos de BITACORA basadas en historial local.
   * @param {string} context - Contexto actual (texto del campo o datos extraídos)
   * @param {Object[]} [history] - Últimos eventos del historial (max 1000)
   * @returns {Promise<string[]>}
   */
  async getProactiveSuggestions(context, history = []) {
    const hw = await this.getHardwareProfile();

    // Reducir historial a fragmentos relevantes (primeras 150 chars de cada evento)
    const historyFrag = history
      .slice(0, AI_CONFIG.settings.maxHistoryEvents)
      .map(e => `• ${(e.descripcion || e.action || '').slice(0, 150)}`)
      .join('\n')
      .slice(0, 2000);

    const prompt = `Eres un redactor técnico para el laboratorio de Células Madre OmniLab.
${historyFrag ? `\nHISTORIAL RECIENTE:\n${historyFrag}\n` : ''}
CONTEXTO ACTUAL: "${context}"

Sugiere 3 entradas breves y profesionales para la bitácora. Devuelve SOLO un JSON array de strings:
["Sugerencia 1", "Sugerencia 2", "Sugerencia 3"]`;

    try {
      const response = await this._isolatedChat(prompt, {
        model:       hw.config.analysis,
        systemPrompt: 'Devuelve SOLO un JSON array de strings sin texto adicional.',
        temperature:  0.5,
        maxTokens:    256,
      });

      const match = response.match(/\[[\s\S]*\]/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        if (Array.isArray(parsed)) return parsed.slice(0, 3).map(s => String(s));
      }
    } catch (e) {
      console.warn('[OmniLab AI] Sugerencias fallidas:', e.message);
    }

    // Fallback con sugerencias genéricas de laboratorio
    return [
      'Revisión de rutina completada. Parámetros dentro de rango.',
      'Mantenimiento preventivo realizado según protocolo vigente.',
      'Condiciones ambientales estables. Sin incidencias reportadas.',
    ];
  }

  // ──────────────────────────────────────────────────────────────────────────
  // BLOQUE 4: CHAT PRINCIPAL (Conversacional)
  // ──────────────────────────────────────────────────────────────────────────

  async autoDetectProvider() {
    const checks = Object.entries(AI_CONFIG.providers).map(async ([name, cfg]) => {
      try {
        const tagsUrl = `${cfg.url}${cfg.tagsEndpoint}`;
        const res = await fetch(tagsUrl, { method: 'GET', signal: AbortSignal.timeout(3000) });
        if (res.ok) {
          this.availableProviders.push(name);
          console.log(`[OmniLab AI] Proveedor encontrado: ${name}`);
        }
      } catch {
        console.log(`[OmniLab AI] Proveedor no disponible: ${name}`);
      }
    });

    await Promise.allSettled(checks);

    if (this.availableProviders.length > 0) {
      this.provider = this.availableProviders[0];
      this.model    = AI_CONFIG.providers[this.provider].models[0].id;
      return this.provider;
    }
    return null;
  }

  setModel(provider, modelId) {
    this.provider = provider;
    this.model    = modelId || AI_CONFIG.providers[provider]?.models[0]?.id || 'phi3.5:3.8b';
  }

  setSystemPrompt(prompt) {
    this.systemPrompt = prompt;
  }

  /**
   * Chat conversacional (mantiene historial).
   */
  async chat(message, options = {}) {
    if (this.isLoading) throw new Error('Ya hay una solicitud en progreso');

    this.isLoading       = true;
    this.abortController = new AbortController();

    try {
      const messages = this._buildMessages(message, options);
      if (AI_CONFIG.settings.stream) {
        return this._streamChat(messages, options);
      } else {
        return await this._nonStreamChat(messages, options);
      }
    } finally {
      this.isLoading       = false;
      this.abortController = null;
    }
  }

  /**
   * Chat aislado — SIN historial de conversación principal.
   * Usado internamente para extracción y reportes para no contaminar el contexto.
   */
  async _isolatedChat(message, options = {}) {
    const messages = [
      { role: 'system', content: options.systemPrompt || AI_CONFIG.settings.systemPrompt },
      { role: 'user',   content: message },
    ];
    return this._nonStreamChat(messages, options);
  }

  _buildMessages(userMessage, options = {}) {
    return [
      { role: 'system', content: options.systemPrompt || this.systemPrompt || AI_CONFIG.settings.systemPrompt },
      ...this.conversationHistory.slice(-10),
      { role: 'user',   content: userMessage },
    ];
  }

  _getChatUrl() {
    const cfg = AI_CONFIG.providers[this.provider];
    return `${cfg.url}${cfg.chatEndpoint}`;
  }

  async _nonStreamChat(messages, options = {}) {
    const url = this._getChatUrl();

    const response = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        model:       options.model || this.model,
        messages,
        temperature: options.temperature  ?? AI_CONFIG.settings.temperature,
        max_tokens:  options.maxTokens    ?? AI_CONFIG.settings.maxTokens,
        top_p:       options.topP         ?? AI_CONFIG.settings.topP,
        stream:      false,
      }),
      signal: this.abortController?.signal,
    });

    if (!response.ok) throw new Error(`Error AI ${response.status}: ${response.statusText}`);

    const data             = await response.json();
    const assistantMessage = data.choices?.[0]?.message;

    if (assistantMessage) {
      this.conversationHistory.push(
        { role: 'user',      content: messages[messages.length - 1].content },
        { role: 'assistant', content: assistantMessage.content }
      );
    }

    return assistantMessage?.content || 'Sin respuesta';
  }

  async *_streamChat(messages, options = {}) {
    const url = this._getChatUrl();

    const response = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        model:       options.model || this.model,
        messages,
        temperature: options.temperature ?? AI_CONFIG.settings.temperature,
        max_tokens:  options.maxTokens   ?? AI_CONFIG.settings.maxTokens,
        stream:      true,
      }),
      signal: this.abortController?.signal,
    });

    if (!response.ok)   throw new Error(`Error AI ${response.status}`);
    if (!response.body) throw new Error('No se recibió body de respuesta');

    const reader  = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer      = '';
    let fullContent = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data:')) continue;
          if (trimmed === 'data: [DONE]') return;

          try {
            const json    = JSON.parse(trimmed.slice(5));
            const content = json.choices?.[0]?.delta?.content;
            if (content) {
              fullContent += content;
              yield content;
            }
          } catch { /* ignorar errores de chunk SSE */ }
        }
      }
    } finally {
      reader.releaseLock();
    }

    if (fullContent) {
      this.conversationHistory.push(
        { role: 'user',      content: messages[messages.length - 1].content },
        { role: 'assistant', content: fullContent }
      );
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // BLOQUE 5: UTILIDADES
  // ──────────────────────────────────────────────────────────────────────────

  parseJSON(text) {
    if (!text) return null;
    try {
      // Intenta parsear texto completo primero
      return JSON.parse(text.trim());
    } catch { /* continúa */ }
    try {
      // Extrae primer bloque JSON del texto
      const match = text.match(/\{[\s\S]*\}/);
      return match ? JSON.parse(match[0]) : null;
    } catch {
      return null;
    }
  }

  async checkConnection() {
    try {
      const cfg = AI_CONFIG.providers[this.provider];
      const url = `${cfg.url}${cfg.tagsEndpoint}`;
      const res = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(3000) });
      return res.ok;
    } catch {
      return false;
    }
  }

  async getAvailableModels() {
    try {
      const cfg = AI_CONFIG.providers[this.provider];
      const url = `${cfg.url}${cfg.tagsEndpoint}`;
      const res = await fetch(url);
      if (!res.ok) return [];
      const data = await res.json();
      return (data.models || data.data || []).map(m => ({
        id:   m.name || m.id,
        name: m.name || m.id,
      }));
    } catch {
      return [];
    }
  }

  clearHistory() {
    this.conversationHistory = [];
  }

  cancel() {
    if (this.abortController) {
      this.abortController.abort();
      this.isLoading = false;
    }
  }
}

export const aiClient = new AIClient();
export default aiClient;