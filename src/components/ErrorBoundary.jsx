import { Component } from 'react';

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Error caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center h-screen bg-gray-900">
          <div className="max-w-md p-8 bg-gray-800 rounded-lg">
            <div className="text-red-500 text-5xl mb-4 text-center">⚠️</div>
            <h2 className="text-xl text-white font-bold mb-2">
              Algo salió mal
            </h2>
            <p className="text-gray-400 text-sm mb-4">
              {this.state.error?.message || 'Error desconocido'}
            </p>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="w-full py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Intentar de nuevo
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export function withErrorBoundary(Component) {
  return function WrappedComponent(props) {
    return (
      <ErrorBoundary>
        <Component {...props} />
      </ErrorBoundary>
    );
  };
}

export class SyncConflictResolver extends Component {
  constructor(props) {
    super(props);
    this.state = {
      conflicts: [],
      showResolver: false,
      currentIndex: 0,
    };
  }

  setConflicts(conflicts) {
    this.setState({ conflicts, showResolver: conflicts.length > 0 });
  }

  resolveCurrent = (resolution) => {
    const { conflicts, currentIndex } = this.state;
    const current = conflicts[currentIndex];
    
    if (resolution === 'keep_local') {
      this.props.onKeepLocal(current);
    } else if (resolution === 'keep_cloud') {
      this.props.onKeepCloud(current);
    } else if (resolution === 'merge') {
      this.props.onMerge(current);
    }

    if (currentIndex < conflicts.length - 1) {
      this.setState({ currentIndex: currentIndex + 1 });
    } else {
      this.setState({ showResolver: false, conflicts: [], currentIndex: 0 });
    }
  };

  render() {
    if (!this.state.showResolver) return this.props.children;

    const current = this.state.conflicts[this.state.currentIndex];
    const progress = ((this.state.currentIndex + 1) / this.state.conflicts.length) * 100;

    return (
      <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
        <div className="max-w-lg w-full bg-gray-800 rounded-lg p-6">
          <h3 className="text-xl text-white font-bold mb-2">
            Resolver Conflictos de Sincronización
          </h3>
          <p className="text-gray-400 text-sm mb-4">
            Registro {this.state.currentIndex + 1} de {this.state.conflicts.length}
          </p>
          
          <div className="h-2 bg-gray-700 rounded-full mb-4">
            <div 
              className="h-full bg-blue-500"
              style={{ width: `${progress}%` }}
            />
          </div>

          <div className="bg-gray-900 p-4 rounded mb-4">
            <p className="text-gray-400 text-sm">Conflicto en: {current?.table}</p>
            <p className="text-white font-mono text-sm">ID: {current?.id}</p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => this.resolveCurrent('keep_local')}
              className="flex-1 py-2 bg-green-600 text-white rounded hover:bg-green-700"
            >
              Mantener Local
            </button>
            <button
              onClick={() => this.resolveCurrent('keep_cloud')}
              className="flex-1 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Mantener Cloud
            </button>
            <button
              onClick={() => this.resolveCurrent('merge')}
              className="flex-1 py-2 bg-purple-600 text-white rounded hover:bg-purple-700"
            >
              Fusionar
            </button>
          </div>
        </div>
      </div>
    );
  }
}