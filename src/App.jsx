import { useState, useEffect } from "react";
import { MonitoringPanel } from "./components/MonitoringPanel";
import { NativeAIChat } from "./components/NativeAIChat";
import { AppLoader, SyncIndicator } from "./components/AppLoader";
import aiClient from "./aiClient";
import "./index.css";

function App() {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    async function init() {
      // Detectar perfil de hardware y pre-configurar modelos
      const hardware = await aiClient.getHardwareProfile();
      setProfile(hardware);
      await aiClient.setProfileModels();
      setTimeout(() => setLoading(false), 1500);
    }
    init();
  }, []);

  if (loading) {
    return <AppLoader />;
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white font-sans selection:bg-blue-500/30">
      {/* Dynamic Header */}
      <header className="h-16 border-b border-gray-800 bg-gray-950/80 backdrop-blur-md sticky top-0 z-40 px-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
            <span className="text-xl font-bold">O</span>
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight">OmniLab</h1>
            <p className="text-[10px] text-gray-400 uppercase tracking-widest leading-none">AI Powered Lab Pipeline v1.0.3</p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-900 border border-gray-800 rounded-full">
            <div className={`w-2 h-2 rounded-full ${profile?.profile === 'PRO' ? 'bg-green-500 animate-pulse' : 'bg-blue-500'}`} />
            <span className="text-xs font-medium text-gray-300">{profile?.profile || 'ECO'} Mode</span>
          </div>
          <SyncIndicator />
        </div>
      </header>

      {/* Main Content */}
      <main className="p-6 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Dashboard Section */}
          <div className="lg:col-span-2 space-y-6">
            <section className="p-6 bg-gray-900 border border-gray-800 rounded-2xl shadow-sm">
              <h2 className="text-xl font-semibold mb-4 text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-300">
                Pipeline de Datos v1.0.3
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatusCard title="Temp. Crítica" value="23.4°C" status="OK" color="text-green-400" />
                <StatusCard title="Humedad" value="45%" status="OK" color="text-green-400" />
                <StatusCard title="Equipos" value="12/12" status="Online" color="text-blue-400" />
                <StatusCard title="Alertas" value="0" status="Clear" color="text-gray-400" />
              </div>
            </section>
            
            <section className="h-[400px] bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden flex flex-col">
              <div className="p-4 border-b border-gray-800 bg-gray-950/50 flex justify-between items-center">
                <h3 className="font-medium text-sm">Actividad Reciente</h3>
              </div>
              <div className="flex-1 p-4 flex items-center justify-center text-gray-600 italic text-sm">
                No hay actividad reciente en el pipeline.
              </div>
            </section>
          </div>

          {/* AI Sidebar */}
          <div className="space-y-6">
             <NativeAIChat />
          </div>
        </div>
      </main>

      {/* Floating UI Elements */}
      <MonitoringPanel />
      
      {/* Background Effect */}
      <div className="fixed inset-0 pointer-events-none -z-10 bg-[radial-gradient(circle_at_50%_0%,rgba(59,130,246,0.05)_0%,transparent_50%)]" />
    </div>
  );
}

function StatusCard({ title, value, status, color }) {
  return (
    <div className="p-4 bg-gray-950 border border-gray-800 rounded-xl hover:border-gray-700 transition-colors">
      <div className="text-[10px] text-gray-500 uppercase font-bold mb-1">{title}</div>
      <div className="text-2xl font-bold truncate">{value}</div>
      <div className={`text-[10px] font-medium mt-1 ${color}`}>{status}</div>
    </div>
  );
}

export default App;
