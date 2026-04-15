// ============================================================
// aiPipeline.js — OmniLab v1.0.3 | Intercomunicación AI
//
// Script de pipeline que orquesta el flujo:
//   Archivo → Extractor (DeepSeek/bonsai) → Redactor (Phi/Llama) → UI
//
// Este módulo actúa como capa de orquestación entre los modelos
// especializados, pasando el contexto de extracción al redactor.
// ============================================================
import aiClient from './aiClient.js';
import AI_CONFIG from './aiConfig.js';

// ─── Esquema de comunicación AI ↔ React ────────────────────────────────────
/**
 * @typedef {Object} PipelineInput
 * @property {string}  filename    - Nombre del archivo a procesar
 * @property {string}  mimeType    - MIME type del archivo
 * @property {string}  [content]   - Contenido textual del archivo (si ya fue leído)
 * @property {string}  [base64]    - Contenido base64 para imágenes
 * @property {string}  [targetTable] - Forzar tabla destino (opcional)
 */

/**
 * @typedef {Object} PipelineResult
 * @property {boolean}   success
 * @property {string}    target          - Tabla destino
 * @property {string}    profile         - Perfil de hardware usado
 * @property {string}    extractionModel - Modelo de extracción usado
 * @property {string}    reportingModel  - Modelo de reporte usado
 * @property {Object}    extracted       - JSON extraído del documento
 * @property {string}    report          - Texto del reporte/bitácora
 * @property {string[]}  suggestions     - Sugerencias BITACORA
 * @property {Object}    formPayload     - Payload listo para el formulario React
 * @property {string[]}  errors          - Errores no fatales
 * @property {string}    timestamp
 */

// ─── Clase principal del Pipeline ─────────────────────────────────────────
class AIPipeline {

  /**
   * Ejecuta el pipeline completo para un archivo dado.
   * Paso 1: Detección de hardware y selección de modelos
   * Paso 2: Determinación de tabla destino (routing)
   * Paso 3: Extracción de datos con modelo especializado (contexto AISLADO)
   * Paso 4: Redacción de reporte con modelo de análisis (usa contexto de extracción)
   * Paso 5: Generación de sugerencias BITACORA (si aplica)
   * Paso 6: Construcción del payload React-ready
   *
   * @param {PipelineInput} input
   * @param {Function} [onProgress]  - Callback de progreso: (step, message) => void
   * @returns {Promise<PipelineResult>}
   */
  async run(input, onProgress = () => {}) {
    const errors = [];
    const startTime = Date.now();

    // ── Paso 1: Perfil de hardware ─────────────────────────────────────────
    onProgress(1, 'Detectando perfil de hardware...');
    const hw = await aiClient.getHardwareProfile();
    console.log(`[OmniLab Pipeline] Perfil: ${hw.profile} | RAM: ${Math.round(hw.ram)}GB`);

    // ── Paso 2: Routing de tabla ────────────────────────────────────────────
    onProgress(2, 'Determinando tabla destino...');
    const target = input.targetTable
      || aiClient.determineTargetTable(input.mimeType, input.filename);

    const targetCfg = AI_CONFIG.dispatchTargets[target];
    console.log(`[OmniLab Pipeline] Routing → ${target} (${targetCfg?.label})`);

    // ── Paso 3: Extracción con modelo especializado ─────────────────────────
    onProgress(3, `Extrayendo datos con ${hw.config.extraction}...`);
    let extracted = null;
    let extractionRaw = '';

    try {
      extractionRaw = await this._runExtraction(input, target, hw);
      extracted     = aiClient.parseJSON(extractionRaw);

      if (!extracted) {
        throw new Error(`Respuesta no válida del extractor: ${extractionRaw.slice(0, 100)}`);
      }

      console.log('[OmniLab Pipeline] Extracción exitosa:', extracted);
    } catch (e) {
      errors.push(`Extracción: ${e.message}`);
      console.error('[OmniLab Pipeline] Error de extracción:', e);
    }

    // ── Paso 4: Redacción de reporte (DeepSeek context → Phi/Llama) ─────────
    onProgress(4, `Redactando reporte con ${hw.config.reporting}...`);
    let report = null;

    if (extracted) {
      try {
        report = await this._runReporting(extracted, target, hw);
        console.log('[OmniLab Pipeline] Reporte generado.');
      } catch (e) {
        errors.push(`Reporte: ${e.message}`);
      }
    }

    // ── Paso 5: Sugerencias BITACORA ────────────────────────────────────────
    onProgress(5, 'Generando sugerencias...');
    let suggestions = [];

    if (target === 'BITACORA' || !extracted) {
      // Si el destino es BITACORA o la extracción falló, siempre ofrecer sugerencias
      const context = extracted
        ? JSON.stringify(extracted).slice(0, 300)
        : `Archivo: ${input.filename}`;
      suggestions = await aiClient.getProactiveSuggestions(context);
    }

    // ── Paso 6: Construcción del Payload React-ready ─────────────────────────
    onProgress(6, 'Preparando formulario...');
    const formPayload = this._buildFormPayload(target, extracted);

    /** @type {PipelineResult} */
    const result = {
      success:        extracted !== null,
      target,
      profile:        hw.profile,
      extractionModel: hw.config.extraction,
      reportingModel:  hw.config.reporting,
      extracted,
      report,
      suggestions,
      formPayload,
      errors,
      timestamp:       new Date().toISOString(),
      processingMs:    Date.now() - startTime,
      // Campos de intercomunicación React ↔ AI
      _meta: {
        filename:    input.filename,
        mimeType:    input.mimeType,
        targetLabel: targetCfg?.label,
        targetIcon:  targetCfg?.icon,
        profileIcon: AI_CONFIG.hardwareProfiles[hw.profile]?.icon,
      },
      // Campos de control Sentinel
      _sync_pending:   0,   // Usuario debe confirmar antes de sincronizar
      _target:         target,
      // Tabla de tablas (compatibilidad con SmartFillModal)
      tables: {
        COND_AMB:  target === 'COND_AMB'  ? extracted : null,
        EQUIPOS:   target === 'EQUIPOS'   ? extracted : null,
        RECEPCION: target === 'RECEPCION' ? extracted : null,
        BITACORA:  target === 'BITACORA'  ? extracted : null,
      },
      source: input.filename,
    };

    onProgress(6, `✅ Pipeline completado en ${result.processingMs}ms`);
    return result;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // BLOQUE INTERNO: Extracción
  // ──────────────────────────────────────────────────────────────────────────

  async _runExtraction(input, target, hw) {
    const schema  = AI_CONFIG.formSchemas[target];
    const fields  = schema?.fields?.map(f => `"${f.key}": <${f.type}>`).join(', ') ?? '';

    // El prompt incluye el esquema exacto de la tabla destino
    const prompt = `TAREA: Extrae datos del archivo "${input.filename}" (${input.mimeType}).
TABLA DESTINO: ${target}

ESQUEMA REQUERIDO:
{ ${fields} }

${input.content ? `CONTENIDO DEL ARCHIVO:\n${input.content.slice(0, 4000)}` : ''}
${input.base64  ? `(Imagen adjunta como base64)` : ''}

REGLAS:
1. Devuelve SOLO el objeto JSON. Sin explicaciones ni texto adicional.
2. Usa null para campos que no encuentres en el documento.
3. Fechas en formato YYYY-MM-DD.
4. Números sin unidades (solo el valor numérico).
5. tipo_registro="${target.toLowerCase()}"`;

    return aiClient._isolatedChat(prompt, {
      model:        hw.config.extraction,
      systemPrompt: AI_CONFIG.settings.extractionSystemPrompt,
      temperature:  AI_CONFIG.settings.extractionTemperature,
      maxTokens:    1024,
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // BLOQUE INTERNO: Redacción de reporte
  // El resultado de DeepSeek (extractionContext) se pasa como contexto a Phi/Llama
  // ──────────────────────────────────────────────────────────────────────────

  async _runReporting(extractionContext, target, hw) {
    const targetCfg = AI_CONFIG.dispatchTargets[target];
    const contextStr = JSON.stringify(extractionContext, null, 2);

    // Este prompt usa el JSON extraído por DeepSeek como contexto de entrada
    const prompt = `Eres el redactor técnico de OmniLab para el laboratorio de Células Madre.

Se han extraído los siguientes datos de un documento de ${targetCfg?.label || target}:

${contextStr}

Redacta una entrada técnica concisa para la bitácora del laboratorio que:
1. Mencione los valores más importantes (temperaturas, lotes, estados críticos)
2. Use terminología científica apropiada para laboratorio de Células Madre
3. Sea objetiva y factual (máximo 3 oraciones)
4. Mencione cualquier valor fuera de rango normal (temperatura >30°C, humedad <30% o >70%)

Responde SOLO con el texto de la bitácora, sin JSON ni formato adicional.`;

    return aiClient._isolatedChat(prompt, {
      model:        hw.config.reporting,
      systemPrompt: AI_CONFIG.settings.systemPrompt,
      temperature:  0.4,
      maxTokens:    300,
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // BLOQUE INTERNO: Construcción de Payload para React
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Mapea los datos extraídos al esquema del formulario React.
   * Campos faltantes quedan como string vacío (para que el usuario los complete).
   *
   * @param {string} target
   * @param {Object|null} extracted
   * @returns {Object} formPayload - Objeto con todos los campos del schema
   */
  _buildFormPayload(target, extracted) {
    const schema = AI_CONFIG.formSchemas[target]?.fields ?? [];
    const payload = {};

    schema.forEach(field => {
      const value = extracted?.[field.key];
      // Normalizar según tipo
      if (field.type === 'number' && value !== null && value !== undefined) {
        payload[field.key] = Number(value) || '';
      } else if (field.type === 'date' && value) {
        // Asegurar formato YYYY-MM-DD
        payload[field.key] = value.toString().slice(0, 10);
      } else {
        payload[field.key] = value ?? '';
      }
    });

    // Inyectar fields de control que siempre deben estar presentes
    payload._sync_pending   = 0;
    payload.tipo_registro   = target.toLowerCase();

    return payload;
  }
}

// ─── Instancia singleton ───────────────────────────────────────────────────
export const aiPipeline = new AIPipeline();
export default aiPipeline;


// ─── Hook React para usar el pipeline ─────────────────────────────────────
/**
 * Hook que encapsula el estado del pipeline para uso en componentes React.
 * Uso:
 *   const { run, isRunning, result, progress, error } = useAIPipeline();
 */
import { useState, useCallback } from 'react';

export function useAIPipeline() {
  const [isRunning, setIsRunning] = useState(false);
  const [result,    setResult]    = useState(null);
  const [progress,  setProgress]  = useState({ step: 0, message: '' });
  const [error,     setError]     = useState(null);

  const run = useCallback(async (input) => {
    setIsRunning(true);
    setError(null);
    setResult(null);
    setProgress({ step: 0, message: 'Iniciando pipeline...' });

    try {
      const pipelineResult = await aiPipeline.run(input, (step, message) => {
        setProgress({ step, message });
      });

      setResult(pipelineResult);
      return pipelineResult;
    } catch (e) {
      const msg = e.message || 'Error inesperado en el pipeline AI';
      setError(msg);
      console.error('[OmniLab Pipeline Hook] Error:', e);
      return null;
    } finally {
      setIsRunning(false);
    }
  }, []);

  const reset = useCallback(() => {
    setResult(null);
    setError(null);
    setProgress({ step: 0, message: '' });
  }, []);

  return { run, isRunning, result, progress, error, reset };
}
