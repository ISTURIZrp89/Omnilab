// ============================================================
// databaseService.js — OmniLab v1.0.3 | Backend Consistente
// ============================================================
import { invoke } from '@tauri-apps/api/core';
import supabase from './supabaseClient.js';
import { syncService } from './syncService.js';

// ─── Tablas válidas del pipeline ───────────────────────────────────────────
const VALID_TABLES = new Set(['COND_AMB', 'EQUIPOS', 'RECEPCION', 'BITACORA', 'CHANGELOG']);

// ─── Campos obligatorios de control de sincronización ─────────────────────
const REQUIRED_SYNC_FIELDS = ['_sync_pending'];

class DatabaseService {
  constructor() {
    this.cache   = new Map();
    this._pcId   = null; // Cacheado tras primer acceso
  }

  // ──────────────────────────────────────────────────────────────────────────
  // BLOQUE 1: IDENTIDAD DE DISPOSITIVO
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Obtiene el PC ID único de la máquina actual desde el estado de Tauri.
   * Cachea en sesión para evitar invocaciones repetidas.
   * @returns {Promise<string>}
   */
  async getDeviceId() {
    if (this._pcId) return this._pcId;

    try {
      // Intenta obtener el hostname desde el plugin OS de Tauri
      const { hostname } = await import('@tauri-apps/plugin-os');
      const name = await hostname();
      this._pcId = (name || 'unknown-pc').toLowerCase().replace(/[^a-z0-9\-]/g, '-');
    } catch {
      // Fallback: genera un ID persistente basado en localStorage
      let stored = localStorage.getItem('omnilab_pc_id');
      if (!stored) {
        stored = `pc-${Math.random().toString(36).slice(2, 10)}`;
        localStorage.setItem('omnilab_pc_id', stored);
      }
      this._pcId = stored;
    }

    console.log(`[OmniLab DB] PC ID: ${this._pcId}`);
    return this._pcId;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // BLOQUE 2: VALIDACIONES
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Verifica que el registro contenga los campos de control de sincronización.
   * Retorna null si OK, o un mensaje de error.
   * @param {Object} data
   * @returns {string|null}
   */
  validateSyncFields(data) {
    for (const field of REQUIRED_SYNC_FIELDS) {
      if (!(field in data)) {
        return `Campo de sincronización faltante: "${field}". El guardado ha sido invalidado.`;
      }
    }
    return null;
  }

  /**
   * Verifica si existe un registro con la misma Clave Compuesta.
   * Clave: fecha_operativa + tipo_registro + pc_id
   * @param {string} table
   * @param {Object} data
   * @param {string} pcId
   * @returns {Promise<boolean>}
   */
  async checkDuplicate(table, data, pcId) {
    try {
      const sql    = `SELECT id FROM "${table}" WHERE fecha_operativa = ? AND tipo_registro = ? AND pc_id = ? LIMIT 1`;
      const params = [
        data.fecha_operativa,
        data.tipo_registro || 'generic',
        pcId,
      ];
      const result = await invoke('db_query_async', { sql, params: params.map(String) });
      return result?.success && Array.isArray(result.data) && result.data.length > 0;
    } catch (e) {
      console.warn('[OmniLab DB] checkDuplicate falló (no bloqueante):', e.message);
      return false; // No bloquear inserción si la consulta falla
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // BLOQUE 3: OPERACIONES CRUD (Aisladas e Independientes)
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Consulta SQL genérica.
   */
  async query(sql, params = []) {
    return invoke('db_query_async', { sql, params: params.map(String) });
  }

  /**
   * Inserta un registro con:
   * - Inyección de pc_id y metadatos de control
   * - Validación de clave compuesta para datos históricos
   * - Invalidación si faltan campos _sync_pending
   * - Async Rust independiente (errores de sync no propagan al insert)
   *
   * @param {string} table
   * @param {Object} data  - Los datos del formulario validado
   * @returns {Promise<{success: boolean, id?: string, error?: string}>}
   */
  async insert(table, data) {
    // ── Guardia: tabla válida ────────────────────────────────────────────────
    if (!VALID_TABLES.has(table)) {
      return { success: false, error: `Tabla desconocida: "${table}"` };
    }

    // ── Guardia: campos de control obligatorios ─────────────────────────────
    const syncError = this.validateSyncFields(data);
    if (syncError) {
      console.error('[OmniLab DB] Guardado invalidado:', syncError);
      return { success: false, error: syncError };
    }

    // ── Identidad de dispositivo ─────────────────────────────────────────────
    const pcId = await this.getDeviceId();

    // ── Validación de colisión (solo para registros con fecha_operativa) ─────
    if (data.fecha_operativa && table !== 'CHANGELOG') {
      const isDuplicate = await this.checkDuplicate(table, data, pcId);
      if (isDuplicate) {
        console.warn(`[OmniLab DB] Duplicado detectado en ${table} — fecha:${data.fecha_operativa} pc:${pcId}`);
        return {
          success: false,
          error: `Registro duplicado: ya existe un registro de tipo "${data.tipo_registro || 'generic'}" para la fecha ${data.fecha_operativa} en este equipo.`,
        };
      }
    }

    // ── Inyección de metadatos de control ────────────────────────────────────
    // IMPORTANTE: NO se sobreescribe created_at si viene en data
    const record = {
      ...data,
      pc_id:      pcId,
      created_at: data.created_at || new Date().toISOString(),
      // fecha_operativa debe venir explícita del formulario
    };

    // ── Inserción asíncrona con Rust (cada tabla es independiente) ───────────
    let result;
    try {
      result = await invoke('db_insert_async', { table, data: record });
    } catch (e) {
      console.error(`[OmniLab DB] Error insertando en ${table}:`, e);
      return { success: false, error: `Error Rust: ${e.message || e}` };
    }

    // ── Sincronización con Supabase (no bloquea ni propaga error al insert) ──
    if (result?.success && syncService.isOnline()) {
      this._syncAsync(table, record, 'insert').catch(e =>
        console.warn(`[OmniLab Sync] Sync fallida para ${table}:`, e.message)
      );
    }

    return result;
  }

  /**
   * Actualiza un registro existente.
   */
  async update(table, id, data) {
    if (!VALID_TABLES.has(table)) return { success: false, error: `Tabla desconocida: "${table}"` };

    let result;
    try {
      result = await invoke('db_update_async', { table, id, data });
    } catch (e) {
      return { success: false, error: `Error Rust: ${e.message || e}` };
    }

    if (result?.success && syncService.isOnline()) {
      this._syncAsync(table, { ...data, id }, 'update').catch(e =>
        console.warn(`[OmniLab Sync] Update sync fallida:`, e.message)
      );
    }

    return result;
  }

  /**
   * Elimina un registro.
   */
  async delete(table, id) {
    if (!VALID_TABLES.has(table)) return { success: false, error: `Tabla desconocida: "${table}"` };

    let result;
    try {
      result = await invoke('db_delete_async', { table, id });
    } catch (e) {
      return { success: false, error: `Error Rust: ${e.message || e}` };
    }

    if (result?.success && syncService.isOnline()) {
      this._syncAsync(table, { id }, 'delete').catch(e =>
        console.warn(`[OmniLab Sync] Delete sync fallida:`, e.message)
      );
    }

    return result;
  }

  /**
   * Obtiene todos los registros de una tabla con filtros opcionales.
   */
  async getAll(table, options = {}) {
    if (!VALID_TABLES.has(table)) return { success: false, data: [], error: `Tabla desconocida: "${table}"` };

    const { where, orderBy, limit } = options;
    return invoke('db_get_all_async', {
      table,
      where_clause: where   || null,
      order_by:     orderBy || 'created_at DESC',
      limit:        limit   || 500,
    });
  }

  /**
   * Obtiene los últimos N eventos del historial local para autocompletado BITACORA.
   * @param {number} limit
   * @returns {Promise<Object[]>}
   */
  async getBitacoraHistory(limit = 1000) {
    try {
      const result = await this.getAll('BITACORA', {
        orderBy: 'fecha_operativa DESC',
        limit,
      });
      return result?.data || [];
    } catch {
      return [];
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // BLOQUE 4: SINCRONIZACIÓN CLOUD
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Sincronización fire-and-forget con Supabase.
   * Errores aquí NO afectan las operaciones locales.
   */
  async _syncAsync(table, data, action) {
    try {
      if (action === 'insert') {
        const { error } = await supabase.from(table).insert(data);
        if (error) throw error;
      } else if (action === 'update') {
        const { error } = await supabase.from(table).update(data).eq('id', data.id);
        if (error) throw error;
      } else if (action === 'delete') {
        const { error } = await supabase.from(table).delete().eq('id', data.id);
        if (error) throw error;
      }
      console.log(`[OmniLab Sync] ${action} OK → Supabase:${table}`);
    } catch (e) {
      console.warn(`[OmniLab Sync] ${action} fallida → Supabase:${table}:`, e.message);
      throw e; // Re-lanzar para que el caller pueda loguear
    }
  }

  async fetchFromCloud(table, lastSync = null) {
    if (!syncService.isOnline()) return { data: [], error: 'Offline' };

    let query = supabase.from(table).select('*');
    if (lastSync) query = query.gte('updated_at', lastSync);

    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) return { data: [], error: error.message };
    return { data: data || [], error: null };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // BLOQUE 5: GESTIÓN DE ESTADO
  // ──────────────────────────────────────────────────────────────────────────

  async getSyncStatus() {
    return invoke('get_sync_status');
  }

  async triggerSync() {
    return syncService.syncAll();
  }

  async getPendingChanges() {
    return invoke('get_pending_changes');
  }

  clearCache() {
    this.cache.clear();
  }

  getCached(table) {
    return this.cache.get(table);
  }

  setCached(table, data) {
    this.cache.set(table, data);
  }
}

export const db = new DatabaseService();
export default db;