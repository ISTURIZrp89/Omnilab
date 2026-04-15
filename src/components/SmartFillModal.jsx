// ============================================================
// SmartFillModal.jsx — OmniLab v1.0.3 | Validación AI Smart-Fill
// ============================================================
import { useState, useEffect, useCallback } from 'react';
import AI_CONFIG from '../aiConfig.js';
import db from '../databaseService.js';
import aiClient from '../aiClient.js';

/**
 * Modal de validación multi-tabla para datos extraídos por IA.
 *
 * @param {Object}   props
 * @param {boolean}  props.isOpen       - Si el modal está visible
 * @param {Function} props.onClose      - Callback de cierre
 * @param {import('../aiClient').AIExtractionPayload} props.payload - Payload del dispatcher
 * @param {Function} props.onConfirm    - Callback con ({table, data}) al confirmar
 */
export function SmartFillModal({ isOpen, onClose, payload, onConfirm }) {
  const tables      = ['COND_AMB', 'EQUIPOS', 'RECEPCION', 'BITACORA'];
  const activeTarget = payload?._target || tables[0];

  const [activeTab,    setActiveTab]    = useState(activeTarget);
  const [formData,     setFormData]     = useState({});
  const [suggestions,  setSuggestions]  = useState([]);
  const [isSaving,     setIsSaving]     = useState(false);
  const [saveError,    setSaveError]    = useState(null);
  const [saveSuccess,  setSaveSuccess]  = useState(false);

  // ── Inicializar formulario al abrir ────────────────────────────────────────
  useEffect(() => {
    if (!isOpen || !payload) return;

    // Pre-populate form con datos extraídos de la tabla activa
    const extracted = payload.tables?.[activeTarget] || {};
    const schema    = AI_CONFIG.formSchemas[activeTarget]?.fields || [];

    const initial = {};
    schema.forEach(f => {
      initial[f.key] = extracted[f.key] ?? '';
    });

    setFormData(initial);
    setActiveTab(activeTarget);
    setSaveError(null);
    setSaveSuccess(false);

    // Cargar sugerencias para BITACORA
    if (activeTarget === 'BITACORA' && payload.suggestions?.length > 0) {
      setSuggestions(payload.suggestions);
    }
  }, [isOpen, payload, activeTarget]);

  // ── Cambio de pestaña ─────────────────────────────────────────────────────
  const handleTabChange = useCallback((table) => {
    setActiveTab(table);
    setSaveError(null);
    setSaveSuccess(false);

    const extracted = payload?.tables?.[table] || {};
    const schema    = AI_CONFIG.formSchemas[table]?.fields || [];

    const initial = {};
    schema.forEach(f => {
      initial[f.key] = extracted[f.key] ?? '';
    });
    setFormData(initial);

    // Cargar sugerencias para BITACORA desde historial
    if (table === 'BITACORA') {
      db.getBitacoraHistory(100).then(history => {
        if (history.length > 0) {
          aiClient.getProactiveSuggestions(
            formData.descripcion || '',
            history
          ).then(setSuggestions);
        } else if (payload?.suggestions?.length > 0) {
          setSuggestions(payload.suggestions);
        }
      });
    } else {
      setSuggestions([]);
    }
  }, [payload, formData.descripcion]);

  // ── Actualización de campo ────────────────────────────────────────────────
  const handleFieldChange = useCallback((key, value) => {
    setFormData(prev => ({ ...prev, [key]: value }));
  }, []);

  // ── Confirmar e importar ──────────────────────────────────────────────────
  const handleConfirm = useCallback(async () => {
    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    // Inyectar campos requeridos de control antes de guardar
    const record = {
      ...formData,
      _sync_pending:  1,
      fecha_operativa: formData.fecha_operativa || new Date().toISOString().slice(0, 10),
      tipo_registro:   activeTab.toLowerCase(),
    };

    try {
      const result = await db.insert(activeTab, record);

      if (!result?.success) {
        setSaveError(result?.error || 'Error desconocido al guardar');
      } else {
        setSaveSuccess(true);
        setTimeout(() => {
          onConfirm?.({ table: activeTab, data: record, dbId: result.id });
        }, 1200);
      }
    } catch (e) {
      setSaveError(e.message || 'Error inesperado');
    } finally {
      setIsSaving(false);
    }
  }, [activeTab, formData, onConfirm]);

  if (!isOpen) return null;

  const targetCfg = AI_CONFIG.dispatchTargets[activeTab];
  const schema    = AI_CONFIG.formSchemas[activeTab]?.fields || [];
  const hasData   = payload?.tables?.[activeTab] != null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl shadow-blue-900/20 flex flex-col max-h-[90vh]">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="p-4 border-b border-gray-800 flex justify-between items-start bg-gray-950/60 flex-shrink-0">
          <div>
            <h2 className="text-lg font-bold text-white">Validación Smart-Fill</h2>
            <p className="text-[10px] text-gray-500 uppercase tracking-widest mt-0.5">
              Datos extraídos por IA — OmniLab v1.0.3
            </p>
            {payload?.source && (
              <p className="text-xs text-blue-400 mt-1">📄 {payload.source}</p>
            )}
          </div>
          <div className="flex flex-col items-end gap-1">
            {payload?.profile && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-900/40 border border-blue-700/40 text-blue-300 font-mono">
                {AI_CONFIG.hardwareProfiles[payload.profile]?.icon} {payload.profile}
              </span>
            )}
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors text-xl"
              aria-label="Cerrar modal"
            >
              ✕
            </button>
          </div>
        </div>

        {/* ── Tabs de tabla ────────────────────────────────────────────────── */}
        <div className="flex border-b border-gray-800 bg-gray-900 flex-shrink-0 overflow-x-auto">
          {tables.map(table => {
            const cfg     = AI_CONFIG.dispatchTargets[table];
            const hasRows = payload?.tables?.[table] != null;
            return (
              <button
                key={table}
                onClick={() => handleTabChange(table)}
                className={`px-4 py-3 text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
                  activeTab === table
                    ? 'text-blue-400 border-b-2 border-blue-400 bg-blue-500/5'
                    : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                <span>{cfg.icon}</span>
                <span>{table}</span>
                {hasRows && (
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" title="Datos disponibles" />
                )}
              </button>
            );
          })}
        </div>

        {/* ── Reporte AI (si existe) ───────────────────────────────────────── */}
        {payload?.report && (
          <div className="mx-4 mt-3 p-3 bg-blue-900/20 border border-blue-500/20 rounded-lg text-xs text-blue-200 flex-shrink-0">
            <span className="text-blue-400 font-bold mr-1">📝 Síntesis IA:</span>
            {payload.report}
          </div>
        )}

        {/* ── Formulario ───────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto p-4">
          {!hasData ? (
            <div className="py-12 text-center text-gray-600 italic">
              <div className="text-4xl mb-3">{targetCfg?.icon}</div>
              Sin datos extraídos para {targetCfg?.label}.
              <p className="text-xs mt-2 text-gray-700">El archivo no contenía información para esta categoría.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <FormFields
                schema={schema}
                formData={formData}
                onChange={handleFieldChange}
                suggestions={activeTab === 'BITACORA' ? suggestions : []}
              />
              {/* Errores de extracción no fatales */}
              {payload?.errors?.length > 0 && (
                <div className="p-2 bg-yellow-900/20 border border-yellow-700/30 rounded text-[10px] text-yellow-300">
                  ⚠️ {payload.errors.join(' | ')}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Footer / Acciones ────────────────────────────────────────────── */}
        <div className="p-4 bg-gray-950/60 border-t border-gray-800 flex items-center justify-between flex-shrink-0">
          <div className="flex-1 mr-4">
            {saveError && (
              <p className="text-xs text-red-400">❌ {saveError}</p>
            )}
            {saveSuccess && (
              <p className="text-xs text-green-400">✅ Guardado correctamente en {activeTab}</p>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
            >
              Descartar
            </button>
            <button
              onClick={handleConfirm}
              disabled={isSaving || !hasData || saveSuccess}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-bold rounded-lg shadow-lg shadow-blue-900/30 transition-all active:scale-95 flex items-center gap-2"
            >
              {isSaving ? (
                <><span className="animate-spin">⟳</span> Guardando...</>
              ) : (
                <>Confirmar e Importar → {activeTab}</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-componente: Renderizador de Formulario Dinámico ──────────────────
function FormFields({ schema, formData, onChange, suggestions }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {schema.map(field => (
        <div
          key={field.key}
          className={`space-y-1 ${field.type === 'textarea' ? 'col-span-2' : ''}`}
        >
          <label className="text-[10px] text-gray-500 uppercase font-bold tracking-wider flex items-center gap-1">
            {field.label}
            {field.required && <span className="text-red-500">*</span>}
            {field.range && (
              <span className="text-gray-600 normal-case tracking-normal font-normal">
                [{field.range[0]}–{field.range[1]}]
              </span>
            )}
          </label>

          {field.type === 'select' ? (
            <select
              value={formData[field.key] || ''}
              onChange={e => onChange(field.key, e.target.value)}
              className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-blue-100 focus:border-blue-500 outline-none transition-all"
            >
              <option value="">— Seleccionar —</option>
              {field.options?.map(opt => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>

          ) : field.type === 'textarea' ? (
            <div className="space-y-1">
              <textarea
                value={formData[field.key] || ''}
                onChange={e => onChange(field.key, e.target.value)}
                rows={3}
                className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-blue-100 focus:border-blue-500 outline-none transition-all resize-none"
                placeholder={field.key === 'descripcion' && suggestions.length > 0
                  ? 'Haz clic en una sugerencia ↓'
                  : ''
                }
              />
              {/* Sugerencias de autocompletado BITACORA */}
              {field.key === 'descripcion' && suggestions.length > 0 && (
                <div className="flex flex-col gap-1 pt-1">
                  <span className="text-[10px] text-gray-600 uppercase tracking-wider">Sugerencias IA:</span>
                  {suggestions.map((s, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => onChange(field.key, s)}
                      className="text-left px-2 py-1.5 bg-gray-800/60 hover:bg-gray-800 border border-gray-700/50 rounded text-xs text-gray-300 transition-all"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>

          ) : (
            <input
              type={field.type}
              value={formData[field.key] || ''}
              onChange={e => onChange(field.key, e.target.value)}
              className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-blue-100 focus:border-blue-500 outline-none transition-all"
            />
          )}
        </div>
      ))}
    </div>
  );
}

export default SmartFillModal;
