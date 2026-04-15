export class AppError extends Error {
  constructor(message, code, details = {}) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.details = details;
    this.timestamp = new Date().toISOString();
  }
}

export const ErrorCodes = {
  DATABASE_ERROR: 'DATABASE_ERROR',
  NETWORK_ERROR: 'NETWORK_ERROR',
  SYNC_ERROR: 'SYNC_ERROR',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  OFFLINE: 'OFFLINE',
  TIMEOUT: 'TIMEOUT',
};

export function handleError(error, context = {}) {
  console.error(`[Error] ${context.context}:`, error);

  if (error.code === 'NETWORK_ERROR' || error.message?.includes('network')) {
    return new AppError(
      'Sin conexión a internet',
      ErrorCodes.OFFLINE,
      { original: error.message }
    );
  }

  if (error.message?.includes('not found')) {
    return new AppError(
      'Recurso no encontrado',
      ErrorCodes.NOT_FOUND,
      { original: error.message }
    );
  }

  if (error.code === 'PERMISSION_DENIED') {
    return new AppError(
      'No tienes permiso para esta acción',
      ErrorCodes.PERMISSION_DENIED,
      { original: error.message }
    );
  }

  return new AppError(
    error.message || 'Error desconocido',
    ErrorCodes.DATABASE_ERROR,
    { original: error.message, ...context }
  );
}

export function withRetry(fn, options = {}) {
  const { maxRetries = 3, delay = 1000 } = options;

  return async function retryWrapper(...args) {
    let lastError;

    for (let i = 0; i < maxRetries; i++) {
      try {
        return await fn(...args);
      } catch (error) {
        lastError = error;
        if (i < maxRetries - 1) {
          await new Promise(r => setTimeout(r, delay * (i + 1)));
        }
      }
    }

    throw lastError;
  };
}

export class OfflineQueue {
  constructor() {
    this.queue = [];
    this.processing = false;
  }

  add(action) {
    this.queue.push({
      ...action,
      id: Date.now(),
      retry: 0,
    });
  }

  async process(getNetworkFn) {
    if (this.processing || !navigator.onLine) return;
    this.processing = true;

    const toProcess = [...this.queue];
    this.queue = [];

    for (const action of toProcess) {
      try {
        await getNetworkFn(action);
      } catch (error) {
        if (action.retry < 3) {
          this.queue.push({ ...action, retry: action.retry + 1 });
        }
      }
    }

    this.processing = false;
  }

  getPending() {
    return this.queue.length;
  }
}

export const offlineQueue = new OfflineQueue();

window.addEventListener('online', () => {
  offlineQueue.process();
});

export default { AppError, ErrorCodes, handleError, withRetry, offlineQueue };