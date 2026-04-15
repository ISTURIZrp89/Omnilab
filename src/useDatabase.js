import { useState, useEffect, useCallback } from 'react';
import { db } from './databaseService.js';
import { syncService } from './syncService.js';
import { useLiveQuery } from 'dexie-react-hooks';

export function useSync() {
  const [status, setStatus] = useState({
    isOnline: navigator.onLine,
    isSyncing: false,
    lastSync: null,
    offlineMode: false,
  });

  useEffect(() => {
    const handleSyncEvent = (event) => {
      setStatus(prev => ({
        ...prev,
        ...event,
      }));
    };

    syncService.addListener(handleSyncEvent);
    return () => syncService.removeListener(handleSyncEvent);
  }, []);

  const sync = useCallback(async () => {
    return syncService.syncAll();
  }, []);

  return { ...status, sync };
}

export function useEquipment() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchEquipment = useCallback(async () => {
    setLoading(true);
    try {
      const result = await db.getAll('EQUIPOS');
      if (result.success) {
        setData(result.data || []);
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEquipment();
  }, [fetchEquipment]);

  const add = useCallback(async (equipment) => {
    const result = await db.insert('EQUIPOS', equipment);
    if (result.success) {
      await fetchEquipment();
    }
    return result;
  }, [fetchEquipment]);

  const update = useCallback(async (id, equipment) => {
    const result = await db.update('EQUIPOS', id, equipment);
    if (result.success) {
      await fetchEquipment();
    }
    return result;
  }, [fetchEquipment]);

  const remove = useCallback(async (id) => {
    const result = await db.delete('EQUIPOS', id);
    if (result.success) {
      await fetchEquipment();
    }
    return result;
  }, [fetchEquipment]);

  return { data, loading, error, add, update, remove, refetch: fetchEquipment };
}

export function useRecepcion() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchRecepcion = useCallback(async () => {
    setLoading(true);
    try {
      const result = await db.getAll('RECEPCION', { orderBy: 'fecha_entrada DESC' });
      if (result.success) {
        setData(result.data || []);
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRecepcion();
  }, [fetchRecepcion]);

  const add = useCallback(async (recepcion) => {
    const result = await db.insert('RECEPCION', recepcion);
    if (result.success) {
      await fetchRecepcion();
    }
    return result;
  }, [fetchRecepcion]);

  const update = useCallback(async (id, recepcion) => {
    const result = await db.update('RECEPCION', id, recepcion);
    if (result.success) {
      await fetchRecepcion();
    }
    return result;
  }, [fetchRecepcion]);

  const remove = useCallback(async (id) => {
    const result = await db.delete('RECEPCION', id);
    if (result.success) {
      await fetchRecepcion();
    }
    return result;
  }, [fetchRecepcion]);

  return { data, loading, error, add, update, remove, refetch: fetchRecepcion };
}

export function useBitacora() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchBitacora = useCallback(async () => {
    setLoading(true);
    try {
      const result = await db.getAll('BITACORA', { orderBy: 'created_at DESC', limit: 50 });
      if (result.success) {
        setData(result.data || []);
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBitacora();
  }, [fetchBitacora]);

  const add = useCallback(async (bitacora) => {
    const result = await db.insert('BITACORA', bitacora);
    if (result.success) {
      await fetchBitacora();
    }
    return result;
  }, [fetchBitacora]);

  return { data, loading, error, add, refetch: fetchBitacora };
}

export function useCondicionesAmbientales() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const result = await db.getAll('COND_AMB', { orderBy: 'fecha DESC', limit: 24 });
      if (result.success) {
        setData(result.data || []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch();
  }, [fetch]);

  const add = useCallback(async (cond) => {
    const result = await db.insert('COND_AMB', cond);
    if (result.success) {
      await fetch();
    }
    return result;
  }, [fetch]);

  return { data, loading, add, refetch: fetch };
}

export function useCajas() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const result = await db.getAll('CAJAS', { orderBy: 'nombre ASC' });
      if (result.success) {
        setData(result.data || []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { data, loading, refetch: fetch };
}