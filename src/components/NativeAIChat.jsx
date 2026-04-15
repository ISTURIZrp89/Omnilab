import { useState, useEffect, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { autonomousSupervisor } from '../AISupervisor.js';
import { aiClient } from '../aiClient.js';
import AI_CONFIG from '../aiConfig.js';

export function NativeAIChat({ isOpen: initialIsOpen, onClose }) {
  const [isOpen, setIsOpen] = useState(initialIsOpen || false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [model, setModel] = useState('phi3');
  const [isSupervisorActive, setIsSupervisorActive] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    checkConnection();
    loadHistory();
  }, []);

  const checkConnection = async () => {
    try {
      const connected = await aiClient.checkConnection();
      setIsConnected(connected);
    } catch {
      setIsConnected(false);
    }
  };

  const loadHistory = async () => {
    try {
      const history = await invoke('get_ai_history');
      if (history && history.length > 0) {
        setMessages(history.map(m => ({ role: m.role, content: m.content })));
      }
    } catch {
      // Ignore
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;
    
    const userMessage = input.trim();
    setInput('');
    setIsLoading(true);
    
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    
    try {
      await invoke('add_ai_message', { role: 'user', content: userMessage });
      
      const response = await aiClient.chat(userMessage);
      
      setMessages(prev => [...prev, { role: 'assistant', content: response }]);
      await invoke('add_ai_message', { role: 'assistant', content: response });
    } catch (error) {
      setMessages(prev => [...prev, { 
        role: 'error', 
        content: `Error: ${error.message || 'No se pudo conectar a la IA'}` 
      }]);
    } finally {
      setIsLoading(false);
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const clearChat = async () => {
    setMessages([]);
    await invoke('clear_ai_history');
  };

  const toggleSupervisor = async () => {
    if (isSupervisorActive) {
      autonomousSupervisor.stop();
    } else {
      await autonomousSupervisor.start();
    }
    setIsSupervisorActive(!isSupervisorActive);
  };

  const selectModel = (modelId) => {
    setModel(modelId);
    aiClient.setModel('ollama', modelId);
  };

  const [suggestions, setSuggestions] = useState([]);

  useEffect(() => {
    if (isOpen) {
      fetchSuggestions();
    }
  }, [isOpen]);

  const fetchSuggestions = async () => {
    try {
      const context = messages.length > 0 ? messages[messages.length-1].content : "Inicio de sesión";
      const items = await aiClient.getProactiveSuggestions(context);
      setSuggestions(items);
    } catch (e) {
      console.error("Error fetching suggestions", e);
    }
  };

  const useSuggestion = (text) => {
    setInput(text);
    setSuggestions([]);
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-20 right-4 w-14 h-14 bg-gradient-to-tr from-blue-600 to-indigo-600 rounded-full shadow-lg shadow-blue-900/40 flex items-center justify-center hover:scale-110 active:scale-95 transition-all z-50 border border-blue-400/30 group"
        title="Omnilab AI Chat"
      >
        <span className="text-2xl group-hover:rotate-12 transition-transform">💬</span>
      </button>
    );
  }

  return (
    <div className="fixed bottom-20 right-4 w-96 h-[560px] bg-gray-950/95 backdrop-blur-md rounded-2xl shadow-2xl z-50 flex flex-col overflow-hidden border border-gray-800 animate-slide-up ring-1 ring-white/10">
      {/* Header */}
      <div className="flex items-center justify-between p-4 bg-gray-900/50 border-b border-gray-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600/20 rounded-full flex items-center justify-center border border-blue-500/30">
             <span className="text-xl">🤖</span>
          </div>
          <div>
            <div className="font-bold text-white text-sm tracking-tight">Omnilab AI</div>
            <div className={`text-[10px] uppercase font-bold tracking-widest ${isConnected ? 'text-green-500' : 'text-red-500'}`}>
              {isConnected ? 'Sistema Activo' : 'Offline'}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={toggleSupervisor}
            className={`p-2 rounded-lg transition-all ${isSupervisorActive ? 'bg-green-600/20 text-green-400 border border-green-500/30' : 'bg-gray-800 text-gray-400 border border-gray-700'}`}
            title="Auto-Supervisor"
          >
            <span className="text-sm">🛡️</span>
          </button>
          <button
            onClick={() => setIsOpen(false)}
            className="p-2 text-gray-500 hover:text-white transition-colors"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Model Selector */}
      <div className="flex gap-2 p-2 bg-gray-900 border-b border-gray-800 overflow-x-auto no-scrollbar">
        {AI_CONFIG.providers.ollama.models.slice(0, 4).map(m => (
          <button
            key={m.id}
            onClick={() => selectModel(m.id)}
            className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all whitespace-nowrap ${
              model === m.id 
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/30' 
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            {m.name}
          </button>
        ))}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar">
        {messages.length === 0 && (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-blue-600/10 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-blue-500/20 animate-pulse">
              <span className="text-3xl">🦾</span>
            </div>
            <div className="text-sm font-bold text-white">Centro de Inteligencia Omnilab</div>
            <div className="text-xs text-gray-500 mt-2 px-8">Optimiza tu flujo de trabajo con extracción por hardware y supervisión autónoma.</div>
          </div>
        )}
        
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in`}
          >
            <div
              className={`max-w-[85%] p-3 rounded-2xl text-sm shadow-sm ${
                msg.role === 'user'
                  ? 'bg-blue-600 text-white rounded-tr-none'
                  : msg.role === 'error'
                  ? 'bg-red-950/50 text-red-200 border border-red-900/50 rounded-tl-none'
                  : 'bg-gray-800/50 text-gray-200 border border-gray-700/50 rounded-tl-none'
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}
        
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-gray-800/50 p-3 rounded-2xl rounded-tl-none border border-gray-700/50">
              <div className="flex gap-1">
                <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce" />
                <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce [animation-delay:0.2s]" />
                <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce [animation-delay:0.4s]" />
              </div>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Sugerencias Proactivas */}
      {suggestions.length > 0 && !isLoading && (
        <div className="px-4 py-2 flex gap-2 overflow-x-auto no-scrollbar bg-gray-900/30 border-t border-gray-800/50">
          {suggestions.map((text, i) => (
            <button
              key={i}
              onClick={() => useSuggestion(text)}
              className="px-3 py-1.5 bg-gray-800/80 border border-gray-700 rounded-full text-[10px] text-blue-300 hover:border-blue-500 transition-all whitespace-nowrap active:scale-95"
            >
              {text}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="p-4 bg-gray-950 border-t border-gray-800">
        <div className="flex gap-2 relative">
          <textarea
            ref={inputRef}
            rows="1"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Comando o consulta..."
            className="flex-1 bg-gray-900 text-white pl-4 pr-12 py-3 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 border border-gray-800 placeholder:text-gray-600 resize-none overflow-hidden"
            disabled={isLoading}
          />
          <button
            onClick={sendMessage}
            disabled={isLoading || !input.trim()}
            className="absolute right-2 top-2 p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-30 disabled:grayscale transition-all"
          >
            <span className="text-lg">➤</span>
          </button>
        </div>
        
        <div className="flex justify-between mt-3 px-1">
          <div className="flex gap-4">
            <button onClick={clearChat} className="text-[10px] uppercase font-bold text-gray-600 hover:text-gray-400 transition-colors">Limpiar</button>
            <button onClick={fetchSuggestions} className="text-[10px] uppercase font-bold text-gray-600 hover:text-gray-400 transition-colors">Sugerir</button>
          </div>
          <button onClick={checkConnection} className="text-[10px] uppercase font-bold text-gray-600 hover:text-gray-400 transition-colors">Sincronizar IA</button>
        </div>
      </div>
    </div>
  );
}

export default NativeAIChat;