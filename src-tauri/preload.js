/**
 * OmniLab Pro - Tauri Preload Script
 * 
 * Expone una API segura al proceso de render mediante Tauri's invoke API.
 */

const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

window.electronAPI = {
  database: {
    query: (sql, params = []) => {
      return invoke('db_query', { sql, params });
    },
    
    insert: (table, data) => {
      return invoke('db_insert', { table, data });
    },
    
    update: (table, id, data) => {
      return invoke('db_update', { table, id, data });
    },
    
    delete: (table, id) => {
      return invoke('db_delete', { table, id });
    },
    
    getAll: (table, options = {}) => {
      return invoke('db_get_all', { 
        table, 
        whereClause: options.where || null, 
        orderBy: options.orderBy || null, 
        limit: options.limit || null 
      });
    }
  },
  
  sync: {
    getStatus: () => {
      return invoke('get_sync_status');
    },
    
    trigger: () => {
      return invoke('trigger_sync');
    },
    
    getPending: () => {
      return invoke('get_pending_changes');
    },
    
    onStatusUpdate: (callback) => {
      return listen('sync:status-update', (event) => callback(event.payload));
    }
  },
  
  system: {
    getVersion: () => {
      return invoke('get_version');
    },
    
    getPath: (name) => {
      return invoke('get_app_path');
    },
    
    openExternal: (url) => {
      return invoke('open_external', { url });
    },
    
    showSaveDialog: (options) => {
      return invoke('show_save_dialog', {
        title: options.title || 'Guardar',
        defaultPath: options.defaultPath || null,
        filters: options.filters || null
      });
    },
    
    showOpenDialog: (options) => {
      return invoke('show_open_dialog', {
        title: options.title || 'Abrir',
        multiple: options.multiple || false,
        filters: options.filters || null
      });
    }
  },
  
  window: {
    minimize: () => {
      return invoke('minimize_window');
    },
    
    maximize: () => {
      return invoke('maximize_window');
    },
    
    close: () => {
      return invoke('close_window');
    },
    
    onMaximizedChange: (callback) => {
      return listen('window:maximized', (event) => callback(event.payload));
    }
  },
  
  ai: {
    listModels: () => Promise.resolve({ success: true, data: [] }),
    loadModel: (modelId) => Promise.resolve({ success: false, error: 'AI no disponible en Tauri' }),
    unloadModel: () => Promise.resolve({ success: true }),
    getStatus: () => Promise.resolve({ initialized: false }),
    execute: (prompt, context) => Promise.resolve({ success: false, error: 'AI no disponible en Tauri' }),
    mapToSQL: (json, table) => Promise.resolve({ success: false, error: 'AI no disponible en Tauri' })
  },

  aiCore: {
    execute: (task, input, context) => Promise.resolve({ success: false, error: 'AI no disponible en Tauri' }),
    load: (modelId) => Promise.resolve({ success: false, error: 'AI no disponible en Tauri' }),
    unload: () => Promise.resolve({ success: true }),
    getStatus: () => Promise.resolve({ ready: false }),
    listModels: () => Promise.resolve({ success: true, data: [] })
  },

  aiRendererBridge: {
    registerService: (service) => Promise.resolve({ success: true }),
    isReady: () => Promise.resolve(false),
    executeTask: (task, input, context) => Promise.resolve({ success: false, error: 'AI no disponible' })
  },

  parser: {
    parseFile: (filePath, options) => Promise.resolve({ success: false, error: 'Parser no disponible' }),
    parseBuffer: (buffer, type, options) => Promise.resolve({ success: false, error: 'Parser no disponible' }),
    getTypes: () => Promise.resolve({ success: true, data: ['pdf', 'docx', 'xlsx'] })
  },

  installer: {
    run: () => Promise.resolve({ success: false, error: 'Installer no disponible' }),
    check: () => Promise.resolve({ python: false, native: true })
  },

  python: {
    execute: (script, args) => Promise.resolve({ success: false, error: 'Python no disponible' }),
    onProgress: (callback) => { return () => {}; }
  },

  firebase: {
    sync: (action, table, options) => Promise.resolve({ success: false, error: 'Firebase no configurado' }),
    getStatus: () => Promise.resolve({ connected: false })
  },

  menu: {
    onExport: (callback) => { return () => {}; },
    onImport: (callback) => { return () => {}; }
  }
};

window.appInfo = {
  platform: navigator.platform,
  arch: 'tauri',
  versions: {
    node: 'N/A',
    chrome: 'N/A',
    tauri: '2'
  }
};

console.log('[Preload] API expuesta al renderer (Tauri)');