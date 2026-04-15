import { useState, useEffect, useCallback } from 'react';
import { aiSupervisor } from '../aiSupervisor.js';

export function useAIMonitor() {
  const [dashboard, setDashboard] = useState(null);
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = aiSupervisor.getDashboard();
      setDashboard(data);
      const h = aiSupervisor.performHealthCheck();
      setHealth(h);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 30000);
    return () => clearInterval(interval);
  }, [refresh]);

  const trackEvent = useCallback((event) => {
    aiSupervisor.onEvent(event);
    refresh();
  }, [refresh]);

  const resetAI = useCallback(() => {
    aiSupervisor.reset();
    refresh();
  }, [refresh]);

  return { dashboard, health, loading, refresh, trackEvent, resetAI };
}

export function AIDashboard() {
  const { dashboard, health, loading, refresh, resetAI } = useAIMonitor();

  if (loading) {
    return <div className="p-4 text-gray-400">Cargandoashboard...</div>;
  }

  const { stats, anomalies, insights, recentLogs } = dashboard || {};

  return (
    <div className="p-4 space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold text-white">AI Supervisor</h2>
        <button onClick={refresh} className="px-3 py-1 bg-blue-600 rounded text-sm">
          Actualizar
        </button>
      </div>

      {health && (
        <div className="grid grid-cols-3 gap-4">
          <HealthCard
            label="Estado"
            value={health.checks.online ? 'Online' : 'Offline'}
            color={health.checks.online ? 'green' : 'red'}
          />
          <HealthCard
            label="Memoria"
            value={`${Math.round(health.checks.memory * 100)}%`}
            color={health.checks.memory > 0.8 ? 'red' : 'green'}
          />
          <HealthCard
            label="Anomalías"
            value={health.checks.anomalies}
            color={health.checks.anomalies > 5 ? 'red' : 'green'}
          />
        </div>
      )}

      {insights && insights.length > 0 && (
        <div className="bg-gray-800 rounded-lg p-4">
          <h3 className="font-bold text-white mb-2">Insights IA</h3>
          <div className="space-y-2">
            {insights.map((insight, i) => (
              <div
                key={i}
                className={`p-2 rounded ${
                  insight.priority === 'high' ? 'bg-red-900/50 border-l-2 border-red-500' :
                  insight.priority === 'medium' ? 'bg-yellow-900/50 border-l-2 border-yellow-500' :
                  'bg-blue-900/50 border-l-2 border-blue-500'
                }`}
              >
                <div className="text-white font-medium">{insight.title}</div>
                <div className="text-gray-400 text-sm">{insight.description}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {anomalies && anomalies.length > 0 && (
        <div className="bg-gray-800 rounded-lg p-4">
          <h3 className="font-bold text-white mb-2">Anomalías Recientes</h3>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {anomalies.slice(0, 10).map((anomaly, i) => (
              <div key={i} className="text-sm">
                <span className={`text-${
                  anomaly.severity === 'high' ? 'red' : 
                  anomaly.severity === 'medium' ? 'yellow' : 'blue'
                }-400`}>
                  [{anomaly.severity}]
                </span>
                <span className="text-gray-400 ml-2">{anomaly.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-gray-800 rounded-lg p-4">
        <h3 className="font-bold text-white mb-2">Estadísticas</h3>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <StatItem label="Acciones totales" value={stats?.users?.totalActions || 0} />
          <StatItem label="Tipos de acción" value={stats?.users?.uniqueActions?.length || 0} />
          <StatItem label="Sincronizaciones" value={stats?.sync?.attempts || 0} />
          <StatItem label="Fallos sync" value={stats?.sync?.failures || 0} />
          <StatItem label="Tiempo promedio" value={`${Math.round(stats?.performance?.avgLoadTime || 0)}ms`} />
          <StatItem label="Memoria pico" value={`${Math.round(stats?.performance?.peakMemory || 0) / 1024 / 1024}MB`} />
        </div>
      </div>

      <button
        onClick={resetAI}
        className="w-full py-2 bg-red-600 text-white rounded hover:bg-red-700"
      >
        Resetear AI
      </button>
    </div>
  );
}

function HealthCard({ label, value, color }) {
  const colorMap = {
    green: 'bg-green-900/50 border-green-500',
    yellow: 'bg-yellow-900/50 border-yellow-500',
    red: 'bg-red-900/50 border-red-500',
  };

  return (
    <div className={`p-3 rounded border ${colorMap[color]}`}>
      <div className="text-gray-400 text-xs">{label}</div>
      <div className="text-white font-bold">{value}</div>
    </div>
  );
}

function StatItem({ label, value }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-400">{label}</span>
      <span className="text-white">{value}</span>
    </div>
  );
}

export function AIEventTracker({ children }) {
  const trackEvent = useCallback((event) => {
    aiSupervisor.onEvent({
      type: event.type || 'action',
      category: event.category || 'user',
      action: event.action,
      details: event.details || {},
      success: event.success,
    });
  }, []);

  return children(trackEvent);
}

export function useAIHealth() {
  const [health, setHealth] = useState(null);

  useEffect(() => {
    const check = () => {
      setHealth(aiSupervisor.performHealthCheck());
    };
    
    check();
    const interval = setInterval(check, 30000);
    return () => clearInterval(interval);
  }, []);

  return health;
}