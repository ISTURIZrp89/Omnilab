import { useEffect, useCallback } from 'react';
import { aiSupervisor } from './aiSupervisor.js';
import { syncService } from './syncService.js';

export function useAITracking() {
  useEffect(() => {
    const originalFetch = window.fetch;
    window.fetch = async function(...args) {
      const startTime = Date.now();
      try {
        const response = await originalFetch.apply(this, args);
        const duration = Date.now() - startTime;
        
        aiSupervisor.onEvent({
          type: 'performance',
          category: 'network',
          action: 'fetch',
          details: { url: args[0], duration, status: response.status },
          success: response.ok,
        });
        
        return response;
      } catch (error) {
        aiSupervisor.onEvent({
          type: 'error',
          category: 'network',
          action: 'fetch',
          details: { url: args[0], error: error.message },
          success: false,
          error,
        });
        throw error;
      }
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, []);

  useEffect(() => {
    const originalXHR = window.XMLHttpRequest;
    const send = originalXHR.prototype.send;
    originalXHR.prototype.send = function(...args) {
      const startTime = Date.now();
      
      this.addEventListener('load', () => {
        const duration = Date.now() - startTime;
        aiSupervisor.onEvent({
          type: 'performance',
          category: 'network',
          action: 'xhr',
          details: { url: this._url, duration, status: this.status },
          success: this.status >= 200 && this.status < 300,
        });
      });
      
      this.addEventListener('error', () => {
        aiSupervisor.onEvent({
          type: 'error',
          category: 'network',
          action: 'xhr',
          details: { url: this._url },
          success: false,
        });
      });

      return send.apply(this, args);
    };

    return () => {
      window.XMLHttpRequest.prototype.send = send;
    };
  }, []);

  useEffect(() => {
    syncService.addListener(handleSyncEvent);

    return () => {
      syncService.removeListener(handleSyncEvent);
    };
  }, []);

  const handleSyncEvent = useCallback((event) => {
    if (event.type === 'sync_start') {
      aiSupervisor.onEvent({
        type: 'sync',
        category: 'sync',
        action: 'sync_start',
        details: {},
      });
    } else if (event.type === 'sync_complete') {
      const results = event.results || {};
      const failures = Object.values(results).filter(r => !r.success).length;
      
      aiSupervisor.onEvent({
        type: 'sync',
        category: 'sync',
        action: 'sync_complete',
        details: { tables: Object.keys(results).length, failures },
        success: failures === 0,
      });
    }
  }, []);

  const trackAction = useCallback((action, details = {}, success = true) => {
    aiSupervisor.onEvent({
      type: success ? 'action' : 'error',
      category: 'user',
      action,
      details,
      success,
    });
  }, []);

  const trackError = useCallback((error, context = {}) => {
    aiSupervisor.onEvent({
      type: 'error',
      category: 'system',
      action: context.action || 'error',
      details: { message: error.message, ...context },
      success: false,
      error,
    });
  }, []);

  const trackPerformance = useCallback((metric, value) => {
    aiSupervisor.onEvent({
      type: 'performance',
      category: 'performance',
      action: metric,
      details: { [metric]: value },
    });
  }, []);

  return {
    trackAction,
    trackError,
    trackPerformance,
    getDashboard: () => aiSupervisor.getDashboard(),
  };
}

export function useAutoAITracking() {
  const { trackAction, trackError, trackPerformance, getDashboard } = useAITracking();

  useEffect(() => {
    const handleClick = (e) => {
      const target = e.target;
      if (target.tagName === 'BUTTON' || target.tagName === 'A') {
        const action = target.dataset.track || target.textContent?.slice(0, 30);
        if (action) {
          trackAction(action, { tag: target.tagName });
        }
      }
    };

    document.addEventListener('click', handleClick, { passive: true });
    return () => document.removeEventListener('click', handleClick);
  }, [trackAction]);

  useEffect(() => {
    window.onerror = (message, source, lineno, colno, error) => {
      trackError(error || new Error(message), {
        source,
        line: lineno,
        column: colno,
      });
    };

    window.onunhandledrejection = (event) => {
      trackError(event.reason || new Error('Unhandled promise rejection'), {
        type: 'unhandled_rejection',
      });
    };

    return () => {
      window.onerror = null;
      window.onunhandledrejection = null;
    };
  }, [trackError]);

  useEffect(() => {
    let lastMeasure = performance.now();
    
    const measureLoop = () => {
      const now = performance.now();
      const delta = now - lastMeasure;
      
      if (delta > 100) {
        trackPerformance('frameTime', delta);
      }
      
      lastMeasure = now;
      requestAnimationFrame(measureLoop);
    };
    
    const frameId = requestAnimationFrame(measureLoop);
    return () => cancelAnimationFrame(frameId);
  }, [trackPerformance]);

  return { getDashboard };
}

export function withAITracking(Component, trackName) {
  return function TrackedComponent(props) {
    const { trackAction } = useAITracking();

    useEffect(() => {
      trackAction(trackName || Component.name, {}, true);
    }, []);

    return <Component {...props} />;
  };
}

export default useAITracking;