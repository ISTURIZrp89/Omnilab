import { useState, useEffect } from 'react';
import { syncService } from '../syncService.js';
import { invoke } from '@tauri-apps/api/core';

export function AppLoader({ children }) {
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('Iniciando...');
  const [error, setError] = useState(null);

  useEffect(() => {
    initializeApp();
  }, []);

  const initializeApp = async () => {
    try {
      setProgress(10);
      setStatus('Conectando a base de datos local...');
      
      const version = await invoke('get_version');
      setProgress(30);
      setStatus('Verificando configuración...');
      
      setProgress(50);
      setStatus('Sincronizando con la nube...');
      
      const syncResult = await syncService.syncAll();
      
      setProgress(80);
      setStatus('Cargando interfaz...');
      
      setProgress(100);
      setTimeout(() => setStatus('Completado'), 200);
      
    } catch (err) {
      setError(err.message);
      setProgress(100);
    }
  };

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-900">
        <div className="text-center p-8">
          <div className="text-red-500 text-4xl mb-4">⚠️</div>
          <h2 className="text-xl text-white mb-2">Error al iniciar</h2>
          <p className="text-gray-400">{error}</p>
          <button 
            onClick={initializeApp}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded"
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center h-screen bg-gray-900">
      <div className="w-80">
        <h1 className="text-2xl text-center text-white mb-6 font-bold">
          Omnilab
        </h1>
        
        <div className="h-2 bg-gray-700 rounded-full overflow-hidden mb-4">
          <div 
            className="h-full bg-blue-500 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
        
        <p className="text-center text-gray-400 text-sm">{status}</p>
      </div>
    </div>
  );
}

export function LoadingOverlay({ isLoading, message = 'Cargando...' }) {
  if (!isLoading) return null;
  
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-800 p-6 rounded-lg shadow-xl">
        <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4" />
        <p className="text-white text-center">{message}</p>
      </div>
    </div>
  );
}

export function ProgressBar({ value, max = 100, showLabel = true }) {
  const percent = Math.min(100, Math.max(0, (value / max) * 100));
  
  return (
    <div className="w-full">
      <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
        <div 
          className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 transition-all duration-500"
          style={{ width: `${percent}%` }}
        />
      </div>
      {showLabel && (
        <p className="text-xs text-gray-400 mt-1 text-right">
          {Math.round(percent)}%
        </p>
      )}
    </div>
  );
}

export function SyncIndicator() {
  const [status, setStatus] = useState(syncService.getStatus());

  useEffect(() => {
    const updateStatus = (event) => {
      setStatus(syncService.getStatus());
    };
    syncService.addListener(updateStatus);
    return () => syncService.removeListener(updateStatus);
  }, []);

  const getStatusColor = () => {
    if (!status.isOnline) return 'bg-yellow-500';
    if (status.isSyncing) return 'bg-blue-500 animate-pulse';
    return 'bg-green-500';
  };

  const getStatusText = () => {
    if (!status.isOnline) return 'Sin conexión';
    if (status.isSyncing) return 'Sincronizando...';
    if (status.lastSync) return `Sincronizado ${new Date(status.lastSync).toLocaleTimeString()}`;
    return 'Listo';
  };

  return (
    <div className="flex items-center gap-2 px-3 py-1 bg-gray-800 rounded-full">
      <div className={`w-2 h-2 rounded-full ${getStatusColor()}`} />
      <span className="text-xs text-gray-400">{getStatusText()}</span>
    </div>
  );
}