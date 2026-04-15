// ============================================================
// aiConfig.js — OmniLab v1.0.3 | Configuración Centralizada AI
// ============================================================

export const AI_CONFIG = {
  defaultProvider: 'ollama',

  providers: {
    ollama: {
      name: 'Ollama',
      url: import.meta.env.VITE_OLLAMA_URL || 'http://localhost:11434',
      // Ruta de la API compatible con OpenAI
      chatEndpoint: '/v1/chat/completions',
      tagsEndpoint: '/api/tags',
      generateEndpoint: '/api/generate',
      models: [
        { id: 'llama3:8b',           name: 'Llama 3 (8B)',         context: 8192,  parameters: '8B',    profile: ['PRO'] },
        { id: 'qwen:7b',             name: 'Qwen (7B)',            context: 8192,  parameters: '7B',    profile: ['PRO'] },
        { id: 'phi3.5:3.8b',         name: 'Phi-3.5 Mini (3.8B)', context: 4096,  parameters: '3.8B',  profile: ['BALANCED'] },
        { id: 'deepseek-coder:6.7b', name: 'DeepSeek Coder (6.7B)',context: 8192,  parameters: '6.7B',  profile: ['BALANCED'] },
        { id: 'bonsai:800m',         name: 'Bonsai (800M)',        context: 2048,  parameters: '800M',  profile: ['ECO'] },
        { id: 'mistral:7b',          name: 'Mistral (7B)',         context: 8192,  parameters: '7B',    profile: ['PRO', 'BALANCED'] },
        { id: 'codellama:7b',        name: 'Code Llama (7B)',      context: 16384, parameters: '7B',    profile: ['PRO'] },
      ],
    },
    lmstudio: {
      name: 'LM Studio',
      url: import.meta.env.VITE_LMSTUDIO_URL || 'http://localhost:1234/v1',
      chatEndpoint: '/chat/completions',
      tagsEndpoint: '/models',
      models: [
        { id: 'lmstudio-llama3',         name: 'Llama 3 (LM)',       context: 8192  },
        { id: 'lmstudio-mistral-large',  name: 'Mistral Large',      context: 32768 },
        { id: 'lmstudio-gemma',          name: 'Gemma',              context: 8192  },
      ],
    },
    llamacpp: {
      name: 'llama.cpp',
      url: import.meta.env.VITE_LLAMA_CPP_URL || 'http://localhost:8080',
      chatEndpoint: '/v1/chat/completions',
      tagsEndpoint: '/v1/models',
      models: [
        { id: 'gguf-llama',   name: 'Llama GGUF',   context: 4096 },
        { id: 'gguf-mistral', name: 'Mistral GGUF',  context: 4096 },
      ],
    },
  },

  settings: {
    temperature: 0.3,         // Más determinístico para extracción de datos
    maxTokens: 2048,
    topP: 0.9,
    repeatPenalty: 1.1,
    stream: true,
    extractionTemperature: 0.1,  // Precisión máxima para JSON extraction
    maxHistoryEvents: 1000,       // Eventos máximos para autocompletado BITACORA

    systemPrompt: `Eres OmniLab AI, un asistente especializado en gestión de laboratorios de Células Madre.
Tu rol es:
1. Ayudar con análisis de datos del laboratorio (temperatura, humedad, equipos, reactivos)
2. Responder preguntas sobre condiciones ambientales y protocolos
3. Detectar desviaciones en parámetros críticos y sugerir acciones
4. Generar reportes técnicos concisos en formato de bitácora
5. Proporcionar insights sobre el estado del laboratorio

Responde siempre en español de forma clara, concisa y técnicamente precisa.`,

    supervisorSystemPrompt: `Eres el supervisor autónomo de OmniLab. Tu trabajo es:
1. Analizar logs de la aplicación continuamente
2. Detectar anomalías y errores en parámetros de laboratorio
3. Identificar patrones inusuales en temperatura, humedad o estado de equipos
4. Generar alertas cuando detectes condiciones fuera de rango
5. Sugerir acciones correctivas

Analiza cada evento y clasifícalo. Responde SOLO con JSON válido:
{"status": "OK|WARNING|ERROR|CRITICAL", "message": "descripcion breve", "action": "accion recomendada"}`,

    extractionSystemPrompt: `Eres un extractor de datos de laboratorio de alta precisión para OmniLab.
Tu ÚNICA función es analizar documentos/imágenes y devolver un objeto JSON válido con los datos encontrados.
NO incluyas texto adicional, solo el JSON. Si un campo no existe en el documento, usa null.
Los campos deben seguir los esquemas de las tablas: COND_AMB, EQUIPOS, RECEPCION, BITACORA.`,
  },

  autoSupervisor: {
    enabled: true,
    intervalMs: 30000,
    maxRetries: 3,
    alertOnError: true,
    alertOnAnomaly: true,
    ramWatchdogThreshold: 90,   // % RAM para activar watchdog
  },

  // ─── Perfiles de Hardware ───────────────────────────────────────────────────
  hardwareProfiles: {
    ECO: {
      minRam: 0,
      maxRam: 6,
      analysis:   'bonsai:800m',
      extraction: 'bonsai:800m',
      reporting:  'bonsai:800m',
      description: 'Bajo consumo — optimizado para equipos con <6GB RAM',
      icon: '🌿',
    },
    BALANCED: {
      minRam: 6,
      maxRam: 12,
      analysis:   'phi3.5:3.8b',
      extraction: 'deepseek-coder:6.7b',
      reporting:  'phi3.5:3.8b',
      description: 'Equilibrio potencia/velocidad — 6 a 12GB RAM',
      icon: '⚖️',
    },
    PRO: {
      minRam: 12,
      maxRam: 9999,
      analysis:   'llama3:8b',
      extraction: 'qwen:7b',
      reporting:  'llama3:8b',
      description: 'Máximo rendimiento — >12GB RAM o GPU disponible',
      icon: '🚀',
    },
  },

  // ─── Tablas Destino para Dispatcher ────────────────────────────────────────
  dispatchTargets: {
    COND_AMB:  { label: 'Condiciones Ambientales', icon: '🌡️', color: '#22c55e' },
    EQUIPOS:   { label: 'Equipos y Mantenimiento', icon: '⚙️',  color: '#3b82f6' },
    RECEPCION: { label: 'Recepción de Reactivos',  icon: '📦', color: '#f59e0b' },
    BITACORA:  { label: 'Bitácora General',         icon: '📋', color: '#8b5cf6' },
  },

  // ─── Esquema de Formularios AI ─────────────────────────────────────────────
  formSchemas: {
    COND_AMB: {
      fields: [
        { key: 'fecha_operativa', label: 'Fecha Operativa', type: 'date',   required: true },
        { key: 'hora_registro',   label: 'Hora',            type: 'time',   required: true },
        { key: 'temperatura_c',   label: 'Temperatura (°C)',type: 'number', required: true,  range: [15, 30] },
        { key: 'humedad_pct',     label: 'Humedad (%)',     type: 'number', required: true,  range: [30, 70] },
        { key: 'presion_pa',      label: 'Presión (Pa)',    type: 'number', required: false },
        { key: 'co2_ppm',         label: 'CO₂ (ppm)',       type: 'number', required: false },
        { key: 'zona',            label: 'Zona/Sala',       type: 'text',   required: true },
        { key: 'operador',        label: 'Operador',        type: 'text',   required: true },
        { key: 'observaciones',   label: 'Observaciones',   type: 'textarea', required: false },
      ],
    },
    EQUIPOS: {
      fields: [
        { key: 'fecha_operativa',  label: 'Fecha',            type: 'date',   required: true },
        { key: 'equipo_id',        label: 'ID Equipo',        type: 'text',   required: true },
        { key: 'nombre_equipo',    label: 'Nombre',           type: 'text',   required: true },
        { key: 'tipo_evento',      label: 'Tipo Evento',      type: 'select', required: true,
          options: ['Mantenimiento Preventivo', 'Mantenimiento Correctivo', 'Calibración', 'Verificación', 'Incidencia'] },
        { key: 'tecnico',          label: 'Técnico',          type: 'text',   required: true },
        { key: 'descripcion',      label: 'Descripción',      type: 'textarea', required: true },
        { key: 'proximo_manten',   label: 'Próx. Mantenimiento', type: 'date', required: false },
        { key: 'resultado',        label: 'Resultado',        type: 'select', required: true,
          options: ['Satisfactorio', 'Requiere Seguimiento', 'Fuera de Servicio'] },
      ],
    },
    RECEPCION: {
      fields: [
        { key: 'fecha_operativa',  label: 'Fecha Recepción',  type: 'date',   required: true },
        { key: 'numero_lote',      label: 'N° Lote',          type: 'text',   required: true },
        { key: 'proveedor',        label: 'Proveedor',        type: 'text',   required: true },
        { key: 'descripcion_item', label: 'Descripción',      type: 'text',   required: true },
        { key: 'cantidad',         label: 'Cantidad',         type: 'number', required: true },
        { key: 'unidad',           label: 'Unidad',           type: 'text',   required: true },
        { key: 'fecha_vencimiento',label: 'Fecha Venc.',      type: 'date',   required: false },
        { key: 'temp_almacen_c',   label: 'Temp. Almacén(°C)',type: 'number', required: false },
        { key: 'estado_recepcion', label: 'Estado',           type: 'select', required: true,
          options: ['Aceptado', 'Rechazado', 'Cuarentena', 'Pendiente Análisis'] },
        { key: 'responsable',      label: 'Responsable',      type: 'text',   required: true },
        { key: 'observaciones',    label: 'Observaciones',    type: 'textarea', required: false },
      ],
    },
    BITACORA: {
      fields: [
        { key: 'fecha_operativa',  label: 'Fecha',            type: 'date',      required: true },
        { key: 'hora_registro',    label: 'Hora',             type: 'time',      required: true },
        { key: 'tipo_registro',    label: 'Tipo',             type: 'select',    required: true,
          options: ['Procedimiento', 'Incidencia', 'Observación', 'Calibración', 'Visita', 'Capacitación', 'Otro'] },
        { key: 'descripcion',      label: 'Descripción',      type: 'textarea',  required: true },
        { key: 'operador',         label: 'Operador',         type: 'text',      required: true },
        { key: 'area',             label: 'Área',             type: 'text',      required: false },
        { key: 'acciones_tomadas', label: 'Acciones Tomadas', type: 'textarea',  required: false },
        { key: 'firma_validacion', label: 'Firma/Validación', type: 'text',      required: false },
      ],
    },
  },

  meta: {
    version: '1.0.3',
    appName: 'OmniLab',
    releaseDate: '2026-04-14',
  },
};

export const AVAILABLE_MODELS = AI_CONFIG.providers.ollama.models;

export function getModelConfig(provider, modelId) {
  const providerConfig = AI_CONFIG.providers[provider];
  if (!providerConfig) return null;
  return providerConfig.models.find(m => m.id === modelId) || providerConfig.models[0];
}

export function getDefaultAIUrl() {
  return AI_CONFIG.providers[AI_CONFIG.defaultProvider].url;
}

export function getProfileConfig(profile) {
  return AI_CONFIG.hardwareProfiles[profile] || AI_CONFIG.hardwareProfiles.ECO;
}

export default AI_CONFIG;