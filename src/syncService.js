import supabase, { TABLES } from './supabaseClient.js';

const OFFLINE_MODE_KEY = 'omnilab_offline_mode';

class SyncService {
  constructor() {
    this._isOnline = navigator.onLine;
    this.isSyncing = false;
    this.lastSync = null;
    this.syncInterval = null;
    this.listeners = [];

    window.addEventListener('online',  () => this.handleOnline());
    window.addEventListener('offline', () => this.handleOffline());
  }

  /** Devuelve si hay conexión activa (método, no propiedad) */
  isOnline() {
    return this._isOnline && !this.isOfflineMode();
  }

  init(getLocalDb, pushLocalChanges) {
    this.getLocalDb = getLocalDb;
    this.pushLocalChanges = pushLocalChanges;
    this.startAutoSync(30000);
  }

  startAutoSync(intervalMs = 30000) {
    if (this.syncInterval) clearInterval(this.syncInterval);
    this.syncInterval = setInterval(() => {
      if (this.isOnline && !this.isSyncing) {
        this.syncAll();
      }
    }, intervalMs);
  }

  handleOnline() {
    this._isOnline = true;
    this.notifyListeners({ type: 'online', isOnline: true });
    this.syncAll();
  }

  handleOffline() {
    this._isOnline = false;
    this.notifyListeners({ type: 'offline', isOnline: false });
  }

  isOfflineMode() {
    return localStorage.getItem(OFFLINE_MODE_KEY) === 'true';
  }

  setOfflineMode(value) {
    localStorage.setItem(OFFLINE_MODE_KEY, value ? 'true' : 'false');
  }

  addListener(callback) {
    this.listeners.push(callback);
  }

  removeListener(callback) {
    this.listeners = this.listeners.filter(l => l !== callback);
  }

  notifyListeners(event) {
    this.listeners.forEach(l => l(event));
  }

  async syncTable(tableName) {
    if (!this.isOnline()) {
      return { success: false, error: 'Offline' };
    }

    try {
      const { data: localChanges, error: localError } = await this.getLocalDb(tableName);
      
      if (localError) throw localError;

      const pendingChanges = (localChanges || []).filter(row => row._sync_pending);

      for (const change of pendingChanges) {
        const { id, _action, ...record } = change;

        let result;
        if (_action === 'insert') {
          result = await supabase.from(tableName).insert(record);
        } else if (_action === 'update') {
          result = await supabase.from(tableName).update(record).eq('id', id);
        } else if (_action === 'delete') {
          result = await supabase.from(tableName).delete().eq('id', id);
        }

        if (result?.error) throw result.error;
      }

      const { data: cloudData, error: cloudError } = await supabase
        .from(tableName)
        .select('*')
        .gte('updated_at', this.lastSync || '1970-01-01');

      if (cloudError) throw cloudError;

      return { success: true, synced: pendingChanges.length, received: cloudData?.length || 0 };
    } catch (error) {
      console.error(`Sync error for ${tableName}:`, error);
      return { success: false, error: error.message };
    }
  }

  async syncAll() {
    if (this.isSyncing || !this.isOnline()) {
      return { success: false, error: 'Syncing or offline mode' };
    }

    this.isSyncing = true;
    this.notifyListeners({ type: 'sync_start' });

    const results = {};
    const tables = Object.values(TABLES);

    for (const table of tables) {
      results[table] = await this.syncTable(table);
    }

    this.lastSync = new Date().toISOString();
    this.isSyncing = false;
    this.notifyListeners({ 
      type: 'sync_complete', 
      results,
      timestamp: this.lastSync 
    });

    return results;
  }

  async getCloudData(tableName, options = {}) {
    if (!this.isOnline()) {
      return { data: null, error: 'Offline' };
    }

    const { limit = 100, orderBy = 'created_at', asc = false } = options;

    const { data, error } = await supabase
      .from(tableName)
      .select('*')
      .order(orderBy, { ascending: asc })
      .limit(limit);

    if (error) return { data: null, error: error.message };
    return { data: data || [], error: null };
  }

  async pushToCloud(tableName, records) {
    if (!this.isOnline()) {
      return { success: false, error: 'Offline' };
    }

    const { data, error } = await supabase
      .from(tableName)
      .upsert(records, { onConflict: 'id' });

    if (error) return { success: false, error: error.message };
    return { success: true, data };
  }

  async pullFromCloud(tableName) {
    if (!this.isOnline()) {
      return { data: [], error: 'Offline' };
    }

    const { data, error } = await supabase
      .from(tableName)
      .select('*')
      .order('created_at', { ascending: false });

    if (error) return { data: [], error: error.message };
    return { data: data || [], error: null };
  }

  getStatus() {
    return {
      isOnline:    this.isOnline(),
      isSyncing:   this.isSyncing,
      lastSync:    this.lastSync,
      offlineMode: this.isOfflineMode(),
    };
  }

  stopAutoSync() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }
}

export const syncService = new SyncService();
export default syncService;