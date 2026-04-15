// ============================================================
// MonitoringPanel.jsx — OmniLab v1.0.3 | Panel de Monitoreo AI
// ============================================================
import { useState, useEffect, useCallback, useRef } from 'react';
import { useAIMonitor } from './AI Monitoring.jsx';
import { SmartFillModal } from './SmartFillModal.jsx';
import aiClient from '../aiClient.js';
import AI_CONFIG from '../aiConfig.js';
import db from '../databaseService.js';

// ─── Constantes ────────────────────────────────────────────────────────────
const RAM_WATCHDOG_THRESHOLD = AI_CONFIG.autoSupervisor.ramWatchdogThreshold; // 90%

export function MonitoringPanel() {
  const [isOpen,        setIsOpen]        = useState(false);
  const [activeTab,     setActiveTab]      = useState('overview');
  const [payload,       setPayload]        = useState(null);
  const [isModalOpen,   setIsModalOpen]    = useState(false);
  const [isDispatching, setIsDispatching]  = useState(false);
  const [dispatchMsg,   setDispatchMsg]    = useState('');
  const [ramWarning,    setRamWarning]     = useState(null);
  const watchdogRef = useRef(null);

  // ── Watchdog de RAM (activo mientras el panel está abierto) ─────────────
  useEffect(() => {
    if (!isOpen) {
      clearInterval(watchdogRef.current);
      return;
    }

    const check = async () => {
      try {
        const os   = await import('@tauri-apps/plugin-os');
        const free  = await os.freeMemory?.() ?? 0;
        const total = await os.totalMemory?.() ?? 1;
        const used  = ((total - free) / total) * 100;
        if (used > RAM_WATCHDOG_THRESHOLD) {
          setRamWarning(`⚠️ RAM al ${Math.round(used)}% — modelo IA en riesgo`);
        } else {
          setRamWarning(null);
        }
      } catch { /* plugin OS no disponible */ }
    };

    check();
    watchdogRef.current = setInterval(check, 15_000);
    return () => clearInterval(watchdogRef.current);
  }, [isOpen]);

  // ── Dispatcher de Archivos ───────────────────────────────────────────────
  const handleFileDispatch = useCallback(async (file) => {
    if (!file || isDispatching) return;

    setIsDispatching(true);
    setDispatchMsg(`Analizando ${file.name}...`);

    try {
      // Inicializar modelos según hardware antes de procesar
      await aiClient.setProfileModels();

      setDispatchMsg('Extrayendo datos con IA...');
      const result = await aiClient.dispatchFile({ name: file.name }, file.type);

      setPayload(result);
      setIsModalOpen(true);
      setDispatchMsg('');
    } catch (e) {
      setDispatchMsg(`❌ Error: ${e.message}`);
      console.error('[OmniLab Dispatcher] Error:', e);
      setTimeout(() => setDispatchMsg(''), 4000);
    } finally {
      setIsDispatching(false);
    }
  }, [isDispatching]);

  // ── Confirmación de importación ──────────────────────────────────────────
  const handleConfirm = useCallback(({ table, data }) => {
    console.log(`[OmniLab DB] Importado a ${table}:`, data);
    setIsModalOpen(false);
    setPayload(null);
  }, []);

  // ── Botón flotante (panel cerrado) ───────────────────────────────────────
  if (!isOpen) {
    return (
      <>
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-4 right-4 w-12 h-12 bg-gray-900 rounded-full shadow-lg flex items-center justify-center hover:bg-gray-800 z-50 border border-gray-700 hover:border-blue-500 transition-all group"
          title="OmniLab AI Monitor"
          id="omnilab-ai-panel-trigger"
        >
          <span className="text-2xl group-hover:scale-110 transition-transform">🤖</span>
        </button>
        <SmartFillModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          payload={payload}
          onConfirm={handleConfirm}
        />
      </>
    );
  }

  return (
    <>
      <div
        className="fixed bottom-4 right-4 w-[400px] h-[520px] bg-gray-900 rounded-2xl shadow-2xl z-50 flex flex-col overflow-hidden border border-gray-800 shadow-blue-900/10"
        id="omnilab-ai-panel"
      >
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-4 py-3 bg-gray-950/80 border-b border-gray-800 flex-shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-xl">🤖</span>
            <div>
              <span className="font-bold text-white text-sm tracking-tight">OmniLab AI</span>
              <span className="text-[10px] text-gray-500 block -mt-0.5">v{AI_CONFIG.meta.version} · Monitor</span>
            </div>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="text-gray-500 hover:text-white transition-colors p-1"
            aria-label="Cerrar panel"
          >
            ✕
          </button>
        </div>

        {/* ── Alerta RAM Watchdog ───────────────────────────────────────────── */}
        {ramWarning && (
          <div className="px-3 py-2 bg-red-900/40 border-b border-red-700/30 text-xs text-red-300 flex-shrink-0">
            {ramWarning}
          </div>
        )}

        {/* ── Tabs ─────────────────────────────────────────────────────────── */}
        <div className="flex border-b border-gray-800 bg-gray-900 flex-shrink-0">
          {[
            { id: 'overview',  label: 'Resumen',   icon: '📊' },
            { id: 'dispatch',  label: 'Archivos',  icon: '📄' },
            { id: 'analytics', label: 'Analytics', icon: '📈' },
            { id: 'settings',  label: 'Ajustes',   icon: '⚙️' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 py-2 text-[11px] font-medium transition-all flex flex-col items-center gap-0.5 ${
                activeTab === tab.id
                  ? 'text-blue-400 border-b-2 border-blue-400 bg-blue-500/5'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* ── Contenido de Tab ─────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">
          {activeTab === 'overview'  && <OverviewTab />}
          {activeTab === 'dispatch'  && (
            <DispatchTab
              onDispatch={handleFileDispatch}
              isDispatching={isDispatching}
              dispatchMsg={dispatchMsg}
            />
          )}
          {activeTab === 'analytics' && <AnalyticsTab />}
          {activeTab === 'settings'  && <SettingsTab />}
        </div>
      </div>

      {/* Modal Smart-Fill (fuera del panel para z-index correcto) */}
      <SmartFillModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        payload={payload}
        onConfirm={handleConfirm}
      />
    </>
  );
}

// ─── Tab: Resumen ──────────────────────────────────────────────────────────
function OverviewTab() {
  const { dashboard, health, refresh } = useAIMonitor();
  const [profile,    setProfile]    = useState(null);
  const [tableStats, setTableStats] = useState({});

  useEffect(() => {
    aiClient.getHardwareProfile().then(setProfile);
    // Cargar conteos de cada tabla
    const loadStats = async () => {
      const stats = {};
      for (const table of ['COND_AMB', 'EQUIPOS', 'RECEPCION', 'BITACORA']) {
        try {
          const result = await db.getAll(table, { limit: 1, orderBy: 'created_at DESC' });
          stats[table] = result?.success ? '✓' : '—';
        } catch {
          stats[table] = '—';
        }
      }
      setTableStats(stats);
    };
    loadStats();
  }, []);

  const memPct = Math.round((health?.checks?.memory || 0) * 100);
  const memColor = memPct > 85 ? 'text-red-400' : memPct > 65 ? 'text-yellow-400' : 'text-green-400';

  return (
    <div className="p-3 space-y-3">
      {/* Métricas principales */}
      <div className="grid grid-cols-2 gap-2">
        <MetricCard
          label="Perfil IA"
          value={profile ? `${AI_CONFIG.hardwareProfiles[profile.profile]?.icon} ${profile.profile}` : 'Detectando...'}
          sub={profile ? `${Math.round(profile.ram)}GB RAM` : ''}
        />
        <MetricCard
          label="Memoria Sistema"
          value={`${memPct}%`}
          valueClass={memColor}
          sub={memPct > 85 ? 'Nivel crítico' : 'Normal'}
        />
      </div>

      {/* Modelos activos */}
      {profile && (
        <div className="p-2 bg-blue-900/15 border border-blue-500/20 rounded-lg text-[10px] text-blue-300 space-y-1">
          <div className="font-bold text-blue-400 mb-1">
            {AI_CONFIG.hardwareProfiles[profile.profile]?.description}
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-gray-400">
            <span>Análisis:</span>    <span className="text-blue-200 font-mono">{profile.config.analysis}</span>
            <span>Extracción:</span>  <span className="text-blue-200 font-mono">{profile.config.extraction}</span>
            <span>Reporte:</span>     <span className="text-blue-200 font-mono">{profile.config.reporting}</span>
          </div>
        </div>
      )}

      {/* Estado Smart-Fill por tabla */}
      <div>
        <h4 className="text-xs font-bold text-white mb-2">Smart-Fill · Tablas</h4>
        <div className="grid grid-cols-2 gap-1.5">
          {Object.entries(AI_CONFIG.dispatchTargets).map(([table, cfg]) => (
            <div
              key={table}
              className="flex items-center gap-1.5 px-2 py-1.5 bg-gray-800 rounded text-[10px]"
            >
              <span>{cfg.icon}</span>
              <span className="text-gray-300 font-mono">{table}</span>
              <span className="ml-auto text-green-400">{tableStats[table] || '…'}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Insights */}
      {dashboard?.insights?.length > 0 && (
        <div>
          <h4 className="text-xs font-bold text-white mb-2">Insights IA</h4>
          <div className="space-y-1">
            {dashboard.insights.slice(0, 3).map((insight, i) => (
              <div key={i} className="text-[11px] text-gray-400 truncate">
                • {insight.title}
              </div>
            ))}
          </div>
        </div>
      )}

      <button
        onClick={refresh}
        className="w-full py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white text-xs font-medium transition-all active:scale-95"
      >
        Actualizar Sistema
      </button>
    </div>
  );
}

// ─── Tab: Dispatcher de Archivos ───────────────────────────────────────────
function DispatchTab({ onDispatch, isDispatching, dispatchMsg }) {
  const { dashboard, refresh } = useAIMonitor();
  const logs = dashboard?.recentLogs || [];

  return (
    <div className="p-3 space-y-3">
      {/* Zona de drop */}
      <div
        className="border-2 border-dashed border-gray-700 rounded-xl p-5 text-center hover:border-blue-500/60 transition-colors cursor-pointer relative"
        onDragOver={e => e.preventDefault()}
        onDrop={e => {
          e.preventDefault();
          const file = e.dataTransfer.files[0];
          if (file) onDispatch(file);
        }}
      >
        <input
          type="file"
          className="hidden"
          id="ai-dispatcher-file"
          accept=".xlsx,.xls,.csv,.docx,.doc,.pdf,.png,.jpg,.jpeg,.webp,.tiff"
          onChange={e => e.target.files[0] && onDispatch(e.target.files[0])}
          disabled={isDispatching}
        />
        <label htmlFor="ai-dispatcher-file" className={`cursor-pointer block ${isDispatching ? 'opacity-50' : ''}`}>
          <div className="text-3xl mb-2">{isDispatching ? '⟳' : '📄'}</div>
          <div className="text-sm text-white font-medium">
            {isDispatching ? 'Procesando...' : 'Subir archivo'}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            Excel · Docx · PDF · Imágenes
          </div>
          <div className="text-[10px] text-gray-600 mt-0.5">
            Auto-extraction · OmniLab {AI_CONFIG.meta.version}
          </div>
        </label>
        {isDispatching && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900/60 rounded-xl">
            <div className="text-center">
              <div className="text-2xl animate-spin">⟳</div>
              <div className="text-xs text-blue-300 mt-1">{dispatchMsg}</div>
            </div>
          </div>
        )}
      </div>

      {/* Guía de routing */}
      <div>
        <h4 className="text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">Routing automático</h4>
        <div className="space-y-1">
          {Object.entries(AI_CONFIG.dispatchTargets).map(([table, cfg]) => (
            <div key={table} className="flex items-center gap-2 text-[10px] text-gray-500">
              <span>{cfg.icon}</span>
              <span className="text-gray-400 font-mono">{table}</span>
              <span>→</span>
              <span>{cfg.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Logs recientes */}
      <div>
        <div className="flex justify-between items-center mb-2">
          <span className="text-xs text-gray-400">Eventos Recientes</span>
          <button onClick={refresh} className="text-[10px] text-blue-400 hover:text-blue-300">
            Actualizar
          </button>
        </div>
        <div className="space-y-1 max-h-28 overflow-y-auto pr-1">
          {logs.length === 0 ? (
            <div className="text-gray-600 text-xs italic text-center py-3">Sin registros</div>
          ) : (
            logs.map((log, i) => (
              <div key={i} className="text-[10px] flex gap-1.5 truncate">
                <span className="text-gray-600 flex-shrink-0">
                  {new Date(log.timestamp).toLocaleTimeString()}
                </span>
                <span className={`flex-shrink-0 font-bold ${
                  log.type === 'error' ? 'text-red-400' :
                  log.type === 'warning' ? 'text-yellow-400' : 'text-green-400'
                }`}>
                  [{log.type?.toUpperCase()}]
                </span>
                <span className="text-gray-300 truncate">{log.action}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Tab: Analytics ────────────────────────────────────────────────────────
function AnalyticsTab() {
  const { dashboard } = useAIMonitor();
  const stats = dashboard?.stats;

  return (
    <div className="p-3 space-y-3">
      <Section title="Rendimiento">
        <StatRow label="Tiempo promedio" value={`${Math.round(stats?.performance?.avgLoadTime || 0)} ms`} />
        <StatRow label="Memoria pico"    value={`${Math.round((stats?.performance?.peakMemory || 0) / 1024 / 1024)} MB`} />
      </Section>

      <Section title="Sincronización">
        <StatRow label="Intentos"   value={stats?.sync?.attempts || 0} />
        <StatRow label="Fallos"     value={stats?.sync?.failures || 0} valueClass="text-red-400" />
        <StatRow
          label="Última vez"
          value={stats?.sync?.lastSync ? new Date(stats.sync.lastSync).toLocaleTimeString() : 'Nunca'}
        />
      </Section>

      <Section title="Top Acciones">
        {Object.entries(stats?.actions || {})
          .sort((a, b) => b[1].count - a[1].count)
          .slice(0, 5)
          .map(([action, data], i) => (
            <StatRow key={i} label={action} value={data.count} />
          ))}
        {Object.keys(stats?.actions || {}).length === 0 && (
          <div className="text-gray-600 text-xs italic">Sin datos</div>
        )}
      </Section>
    </div>
  );
}

// ─── Tab: Ajustes ──────────────────────────────────────────────────────────
function SettingsTab() {
  const { resetAI } = useAIMonitor();
  const [connection, setConnection] = useState(null);
  const [profile,    setProfile]    = useState(null);
  const [checking,   setChecking]   = useState(false);

  const checkConnection = async () => {
    setChecking(true);
    const ok = await aiClient.checkConnection();
    setConnection(ok);
    setChecking(false);
  };

  useEffect(() => {
    aiClient.getHardwareProfile().then(setProfile);
    checkConnection();
  }, []);

  return (
    <div className="p-3 space-y-3">
      {/* Estado de conexión */}
      <div className="p-3 bg-gray-800 rounded-lg space-y-2">
        <h4 className="text-xs font-bold text-white">Estado AI</h4>
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-400">Proveedor</span>
          <span className="text-blue-300 font-mono">{aiClient.provider}</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-400">Conexión</span>
          {checking ? (
            <span className="text-gray-500 animate-pulse">Verificando...</span>
          ) : (
            <span className={connection ? 'text-green-400' : 'text-red-400'}>
              {connection ? '● Activo' : '● Sin conexión'}
            </span>
          )}
        </div>
        <button
          onClick={checkConnection}
          className="w-full py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-xs text-gray-300 transition-all"
        >
          Verificar conexión
        </button>
      </div>

      {/* Perfil de hardware */}
      {profile && (
        <div className="p-3 bg-gray-800 rounded-lg space-y-2">
          <h4 className="text-xs font-bold text-white">Hardware</h4>
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-400">Perfil</span>
            <span className="text-blue-200">
              {AI_CONFIG.hardwareProfiles[profile.profile]?.icon} {profile.profile}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-400">RAM total</span>
            <span className="text-gray-300">{Math.round(profile.ram)}GB</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-400">GPU detectada</span>
            <span className={profile.hasGpu ? 'text-green-400' : 'text-gray-500'}>
              {profile.hasGpu ? 'Sí' : 'No'}
            </span>
          </div>
        </div>
      )}

      {/* Opciones */}
      <div className="p-3 bg-gray-800 rounded-lg space-y-2">
        <h4 className="text-xs font-bold text-white">Configuración</h4>
        {[
          'Auto-monitorización',
          'Detección de anomalías',
          'Generación de insights',
          'Watchdog de RAM',
        ].map(opt => (
          <label key={opt} className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
            <input type="checkbox" defaultChecked className="rounded accent-blue-500" />
            {opt}
          </label>
        ))}
      </div>

      <button
        onClick={resetAI}
        className="w-full py-2 bg-red-900/40 hover:bg-red-900/60 border border-red-700/30 rounded-lg text-red-400 text-xs font-medium transition-all"
      >
        Resetear Datos AI
      </button>
    </div>
  );
}

// ─── Componentes utilitarios ───────────────────────────────────────────────
function MetricCard({ label, value, sub, valueClass = 'text-white' }) {
  return (
    <div className="bg-gray-800 rounded-lg p-2.5">
      <div className="text-gray-500 text-[10px] uppercase tracking-wide">{label}</div>
      <div className={`font-bold text-sm mt-0.5 ${valueClass}`}>{value}</div>
      {sub && <div className="text-gray-600 text-[10px] mt-0.5">{sub}</div>}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div>
      <h4 className="text-xs font-bold text-white mb-2">{title}</h4>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function StatRow({ label, value, valueClass = 'text-gray-300' }) {
  return (
    <div className="flex justify-between text-xs text-gray-400">
      <span>{label}</span>
      <span className={valueClass}>{value}</span>
    </div>
  );
}

export default MonitoringPanel;