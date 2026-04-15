// ============================================================
// aiSupervisor.js — OmniLab v1.0.3 | Supervisor Autónomo
// BUG FIX: Importación circular eliminada (antes importaba de sí mismo)
// ============================================================
import aiClient from './aiClient.js';
import AI_CONFIG from './aiConfig.js';

// NOTA: La importación de aiSupervisor.js desde sí mismo está eliminada.
// El acceso al dashboard/health se hace a través del módulo de monitoreo
// dinámicamente para evitar dependencias circulares.

class AutonomousSupervisor {
  constructor() {
    this.isActive     = false;
    this.intervalId   = null;
    this.alerts       = [];
    this.lastAnalysis = null;
    this.listeners    = new Set();
    this._monitor     = null; // Lazy-reference al módulo de monitoreo
    // Event store (para getDashboard / performHealthCheck)
    this._events      = [];
    this._anomalies   = [];
    this._insights    = [];
    this._stats       = {
      users:       { totalActions: 0, uniqueActions: [] },
      sync:        { attempts: 0, failures: 0, lastSync: null },
      performance: { avgLoadTime: 0, peakMemory: 0, samples: [] },
      actions:     {},
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // BLOQUE 1: CICLO DE VIDA
  // ──────────────────────────────────────────────────────────────────────────

  async start() {
    if (this.isActive) return;

    const connected = await aiClient.checkConnection();
    if (!connected) {
      console.warn('[OmniLab Supervisor] Sin conexión local a modelo IA — en modo pasivo');
      // En modo pasivo, el watchdog de RAM sigue activo aunque no haya modelo
    }

    this.isActive = true;
    const interval = AI_CONFIG.autoSupervisor.intervalMs;
    this.intervalId = setInterval(() => this._cycle(), interval);

    // Primera ejecución inmediata
    this._cycle();

    this.notifyListeners({ type: 'started', connected });
    console.log(`[OmniLab Supervisor] Iniciado (intervalo: ${interval / 1000}s)`);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isActive = false;
    this.notifyListeners({ type: 'stopped' });
    console.log('[OmniLab Supervisor] Detenido');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // BLOQUE 2: CICLO DE ANÁLISIS
  // ──────────────────────────────────────────────────────────────────────────

  async _cycle() {
    // Paso 1: Watchdog de RAM (siempre activo, independiente del modelo IA)
    const ramStatus = await this.monitorMemory();

    // Paso 2: Análisis con modelo IA (solo si hay conexión disponible)
    const connected = await aiClient.checkConnection();
    if (!connected) return;

    try {
      // Importación dinámica del monitor para evitar dependencia circular
      const monitorModule = await this._getMonitor();
      const dashboard     = monitorModule?.getDashboard?.() ?? {};
      const health        = monitorModule?.performHealthCheck?.() ?? {};

      const analysisPrompt = this.buildAnalysisPrompt(dashboard, health, ramStatus);
      const hw             = await aiClient.getHardwareProfile();

      const response = await aiClient._isolatedChat(analysisPrompt, {
        model:        hw.config.analysis,
        systemPrompt: AI_CONFIG.settings.supervisorSystemPrompt,
        maxTokens:    512,
        temperature:  0.2,
      });

      const analysis = this._parseResponse(response);
      this.lastAnalysis = {
        ...analysis,
        timestamp:  new Date().toISOString(),
        profile:    hw.profile,
        ramStatus,
      };

      if (analysis.status === 'ERROR' || analysis.status === 'CRITICAL') {
        this.triggerAlert(analysis);
      }

      this.notifyListeners({ type: 'analysis', analysis: this.lastAnalysis });
      return this.lastAnalysis;
    } catch (error) {
      console.error('[OmniLab Supervisor] Error en ciclo de análisis:', error.message);
    }
  }

  /** Carga el módulo de monitoreo dinámicamente (sin circular dependency) */
  async _getMonitor() {
    if (this._monitor) return this._monitor;
    try {
      // Importación dinámica lazy para romper la circularidad
      const mod = await import('./components/AI Monitoring.jsx');
      this._monitor = mod?.aiMonitor ?? null;
      return this._monitor;
    } catch {
      return null;
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // BLOQUE 3: WATCHDOG DE RAM
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Monitorea el uso de RAM del sistema.
   * Si supera el threshold, libera la memoria del modelo IA y notifica al usuario.
   * @returns {Promise<{used: number, total: number, pct: number, critical: boolean}>}
   */
  async monitorMemory() {
    const threshold = AI_CONFIG.autoSupervisor.ramWatchdogThreshold; // 90%
    let status      = { used: 0, total: 0, pct: 0, critical: false };

    try {
      const os    = await import('@tauri-apps/plugin-os');
      const free  = await os.freeMemory?.()  ?? 0;
      const total = await os.totalMemory?.() ?? 1;
      const pct   = ((total - free) / total) * 100;

      status = { used: total - free, total, pct, critical: pct > threshold };

      if (pct > threshold) {
        const msg = `RAM crítica: ${Math.round(pct)}% usado`;
        console.warn(`[OmniLab Watchdog] 🔴 ${msg} — ejecutando limpieza...`);

        this.triggerAlert({
          status:  'CRITICAL',
          message: `${msg}. Modelos IA descargados para proteger la estabilidad del sistema.`,
          action:  'clear_model_memory',
        });

        await this.clearModelMemory();
      }
    } catch (e) {
      // Plugin OS no disponible (entorno web o testing)
      console.debug('[OmniLab Watchdog] Plugin OS no disponible:', e.message);
    }

    return status;
  }

  /**
   * Libera la memoria del modelo IA activo en Ollama (keep_alive: 0).
   * Solo actúa si el proveedor activo es Ollama.
   */
  async clearModelMemory() {
    if (aiClient.provider !== 'ollama') return;

    const ollamaUrl = AI_CONFIG.providers.ollama.url;
    const models    = [aiClient.model, aiClient.extractionModel, aiClient.reportingModel]
      .filter(Boolean);

    await Promise.allSettled(
      models.map(async model => {
        try {
          await fetch(`${ollamaUrl}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ model, keep_alive: 0 }),
          });
          console.log(`[OmniLab Watchdog] Memoria liberada: ${model}`);
        } catch (e) {
          console.warn(`[OmniLab Watchdog] No se pudo liberar ${model}:`, e.message);
        }
      })
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // BLOQUE 4: CONSTRUCCIÓN DE PROMPTS Y PARSING
  // ──────────────────────────────────────────────────────────────────────────

  buildAnalysisPrompt(dashboard, health, ramStatus = {}) {
    return `Analiza el estado actual del sistema OmniLab (Laboratorio de Células Madre):

SISTEMA:
- Online: ${health?.checks?.online ? 'Sí' : 'No'}
- RAM: ${Math.round(ramStatus.pct || 0)}% usado ${ramStatus.critical ? '⚠️ CRÍTICO' : ''}
- Anomalías detectadas: ${dashboard?.anomalies?.length || 0}
- Acciones totales: ${dashboard?.stats?.users?.totalActions || 0}
- Sync exitosos/fallidos: ${dashboard?.stats?.sync?.attempts || 0}/${dashboard?.stats?.sync?.failures || 0}
- Tiempo promedio de carga: ${Math.round(dashboard?.stats?.performance?.avgLoadTime || 0)}ms

ANOMALÍAS RECIENTES:
${(dashboard?.anomalies || []).slice(0, 3).map(a => `- [${a.severity}] ${a.message}`).join('\n') || '- Ninguna'}

INSIGHTS:
${(dashboard?.insights || []).slice(0, 3).map(i => `- [${i.priority}] ${i.title}`).join('\n') || '- Sin insights'}

Responde SOLO con JSON: {"status": "OK|WARNING|ERROR|CRITICAL", "message": "descripción breve", "action": "acción recomendada"}`;
  }

  _parseResponse(response) {
    try {
      const match = response.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        // Validar que tiene los campos esperados
        if (parsed.status && parsed.message) return parsed;
      }
    } catch { /* ignorar */ }

    // Inferir estado desde texto si el JSON falla
    const lower = (response || '').toLowerCase();
    let status = 'WARNING';
    if (lower.includes('crítico') || lower.includes('critical')) status = 'CRITICAL';
    else if (lower.includes('error'))                             status = 'ERROR';
    else if (lower.includes('ok') || lower.includes('normal'))   status = 'OK';

    return {
      status,
      message: response.slice(0, 200),
      action:  'Revisar manualmente',
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // BLOQUE 5: ALERTAS Y LISTENERS
  // ──────────────────────────────────────────────────────────────────────────

  triggerAlert(analysis) {
    const alert = {
      ...analysis,
      id:        crypto.randomUUID?.() ?? Date.now().toString(36),
      timestamp: new Date().toISOString(),
    };

    this.alerts.unshift(alert);

    // Mantener máx 50 alertas en memoria
    if (this.alerts.length > 50) {
      this.alerts = this.alerts.slice(0, 50);
    }

    this.notifyListeners({ type: 'alert', alert });

    // Mostrar notificación nativa si está disponible
    if (typeof window !== 'undefined' && 'Notification' in window) {
      const title = `OmniLab — ${alert.status}`;
      if (Notification.permission === 'granted') {
        new Notification(title, { body: alert.message });
      }
    }
  }

  async ask(question) {
    return aiClient.chat(question);
  }

  getStatus() {
    return {
      isActive:     this.isActive,
      lastAnalysis: this.lastAnalysis,
      alertsCount:  this.alerts.length,
      alerts:       this.alerts.slice(0, 5),
    };
  }

  getAlerts() {
    return this.alerts;
  }

  addListener(callback) {
    this.listeners.add(callback);
  }

  removeListener(callback) {
    this.listeners.delete(callback);
  }

  notifyListeners(event) {
    this.listeners.forEach(cb => {
      try { cb(event); } catch (e) {
        console.warn('[OmniLab Supervisor] Error en listener:', e.message);
      }
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // BLOQUE 6: APIs para AI Monitoring.jsx / useAI.js
  // ──────────────────────────────────────────────────────────────────────────

  /** Registra un evento en el store interno. */
  onEvent(event) {
    const entry = { ...event, timestamp: new Date().toISOString() };

    this._events.unshift(entry);
    if (this._events.length > 500) this._events = this._events.slice(0, 500);

    if (event.category === 'user' || event.type === 'action') {
      this._stats.users.totalActions++;
      const act = event.action;
      if (act && !this._stats.users.uniqueActions.includes(act))
        this._stats.users.uniqueActions.push(act);
      this._stats.actions[act] = this._stats.actions[act]
        ? { count: this._stats.actions[act].count + 1 } : { count: 1 };
    }

    if (event.category === 'sync' && event.action === 'sync_complete') {
      this._stats.sync.attempts++;
      if (!event.success) this._stats.sync.failures++;
      this._stats.sync.lastSync = new Date().toISOString();
    }

    if (event.category === 'performance') {
      const t = event.details?.duration || event.details?.frameTime || 0;
      if (t > 0) {
        const s = this._stats.performance;
        s.samples.push(t);
        if (s.samples.length > 100) s.samples.shift();
        s.avgLoadTime = s.samples.reduce((a, b) => a + b, 0) / s.samples.length;
      }
      const mem = performance?.memory?.usedJSHeapSize || 0;
      if (mem > this._stats.performance.peakMemory) this._stats.performance.peakMemory = mem;
    }

    if (event.type === 'error' && !event.success) {
      this._anomalies.unshift({
        severity:  'high',
        message:   event.details?.message || event.action || 'Error desconocido',
        timestamp: entry.timestamp,
      });
      if (this._anomalies.length > 50) this._anomalies = this._anomalies.slice(0, 50);
    }
  }

  /** Devuelve el dashboard completo para AI Monitoring.jsx */
  getDashboard() {
    return {
      stats:      this._stats,
      anomalies:  this._anomalies,
      insights:   this._insights,
      recentLogs: this._events.slice(0, 50).map(e => ({
        timestamp: e.timestamp,
        type:      e.type === 'error' ? 'error' : e.success === false ? 'warning' : 'info',
        action:    e.action || e.category,
      })),
    };
  }

  /** Verifica la salud del sistema para AI Monitoring.jsx */
  performHealthCheck() {
    const mem = performance?.memory
      ? performance.memory.usedJSHeapSize / performance.memory.jsHeapSizeLimit
      : 0.3;
    return {
      healthy: mem < 0.85 && this._anomalies.filter(a => a.severity === 'high').length < 3,
      checks:  { online: navigator?.onLine ?? true, memory: mem, anomalies: this._anomalies.length },
    };
  }

  /** Resetea todo el estado interno. */
  reset() {
    this._events    = [];
    this._anomalies = [];
    this._insights  = [];
    this._stats = {
      users:       { totalActions: 0, uniqueActions: [] },
      sync:        { attempts: 0, failures: 0, lastSync: null },
      performance: { avgLoadTime: 0, peakMemory: 0, samples: [] },
      actions:     {},
    };
    this.alerts       = [];
    this.lastAnalysis = null;
    console.log('[OmniLab Supervisor] Estado reseteado');
  }
}

export const autonomousSupervisor = new AutonomousSupervisor();
/** Alias nombrado para compatibilidad con AI Monitoring.jsx y useAI.js */
export const aiSupervisor = autonomousSupervisor;
export default autonomousSupervisor;