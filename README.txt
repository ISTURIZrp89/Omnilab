================================================================================
                    OMNILAB - RESUMEN COMPLETO
                    Sistema de Gestión de Laboratorio con IA
================================================================================

================================================================================
1. INFORMACIÓN GENERAL DEL PROYECTO
================================================================================

NOMBRE: Omnilab
VERSIÓN: 1.0.2
TIPO: Aplicación de escritorio nativa (Tauri 2.x)
FRAMEWORK: Rust + React 18 + Vite 5

DESCRIPCIÓN:
Sistema nativo local-first para gestión de laboratorio. Funciona 100% offline
y puede sincronizar datos entre múltiples PCs mediante Supabase.

CARACTERÍSTICAS PRINCIPALES:
- Base de datos SQLite local (offline-first)
- Sincronización con Supabase Cloud (multi-PC)
- Chat IA integrado (conecta con Ollama/LM Studio)
- AI Supervisor autónomo que supervisa la app
- Sistema de logging y análisis de errores
- Interfaz moderna con React + Tailwind

================================================================================
2. ARQUITECTURA DEL SISTEMA
================================================================================

┌─────────────────────────────────────────────────────────────────────────────┐
│                        FRONTEND (React)                              │
│  ├── Componentes UI (React 18)                                    │
│  ├── Estado (useState, useEffect)                                 │
│  ├── Hooks personalizados (useDatabase, useAI, useSync)           │
│  └── Integraciones: dexie, recharts, jspdf, xlsx, framer-motion  │
├─────────────────────────────────────────────────────────────────────────────┤
│                     SERVICIOS (JavaScript)                          │
│  ├── supabaseClient.js    - Cliente Supabase                      │
│  ├── syncService.js       - Sincronización multi-PC              │
│  ├── databaseService.js   - Acceso a DB local                     │
│  ├── aiClient.js         - Cliente IA (Ollama/LM Studio)         │
│  ├── aiSupervisor.js     - Supervisor autónomo IA                │
│  ├── aiConfig.js        - Configuración de modelos              │
│  ├── cacheService.js     - Cache inteligente                     │
│  └── errorHandler.js    - Manejo de errores                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                     BACKEND (Rust - Tauri)                         │
│  ├── main.rs            - Punto de entrada                        │
│  ├── commands.rs       - Comandos Tauri (18 comandos)           │
│  ├── database.rs        - Base de datos SQLite                   │
│  ├── state.rs          - Estado de la aplicación                │
│  ├── ai_commands.rs   - Comandos de IA                         │
│  └── lib.rs           - Librería                                │
└─────────────────────────────────────────────────────────────────────────────┘

================================================================================
3. ESTRUCTURA DE ARCHIVOS
================================================================================

OMNILAB/
├── src/                              # Frontend React
│   ├── supabaseClient.js            # Cliente Supabase
│   ├── syncService.js               # Servicio de sincronización
│   ├── databaseService.js           # Acceso a DB
│   ├── aiClient.js                 # Cliente IA
│   ├── aiSupervisor.js             # Supervisor IA
│   ├── aiConfig.js                 # Config IA
│   ├── cacheService.js             # Cache
│   ├── errorHandler.js             # Errores
│   ├── useDatabase.js              # Hooks DB
│   ├── useAI.js                   # Hooks IA
│   ├── components/
│   │   ├── AppLoader.jsx          # Pantalla de carga
│   │   ├── AIChat.jsx             # Chat IA
│   │   ├── MonitoringPanel.jsx    # Panel de monitoreo
│   │   └── ErrorBoundary.jsx       # Manejo de errores
│   └── index.html
│
├── src-tauri/                       # Backend Rust
│   ├── src/
│   │   ├── main.rs               # Entry point
│   │   ├── commands.rs           # Comandos
│   │   ├── database.rs           # SQLite
│   │   ├── state.rs              # Estado
│   │   ├── ai_commands.rs        # Comandos IA
│   │   └── lib.rs                # Librería
│   ├── Cargo.toml                # Dependencias Rust
│   ├── tauri.conf.json           # Config Tauri
│   └── capabilities/
│       └── default.json           # Permisos
│
├── package.json                     # Dependencias Node
├── vite.config.js                  # Config Vite
├── supabase-schema.sql             # Schema Supabase
└── .env                           # Variables entorno

================================================================================
4. BASE DE DATOS - TABLAS
================================================================================

SQLITE LOCAL (6 tablas):
┌─────────────────┬──────────────────────────────────────────┐
│ Tabla           │ Descripción                              │
├─────────────────┼──────────────────────────────────────────┤
│ EQUIPOS         │ Gestión de equipos de laboratorio        │
│ RECEPCION       │ Recepción de materiales                │
│ BITACORA        │ Registro de actividades                │
│ COND_AMB        │ Condiciones ambientales                │
│ CAJAS           │ Gestión de cajas                     │
│ _sync_queue     │ Cola de sincronización                │
└─────────────────┴──────────────────────────────────────────┘

CAMPOS COMUNES EN TODAS LAS TABLAS:
- id: UUID (identificador único)
- created_at: Timestamp de creación
- updated_at: Timestamp de actualización
- deleted: Boolean (soft delete)
- _sync_pending: Pending de sync
- _cloud_id: ID en la nube
- _pc_id: ID de la PC que creó el registro
- _last_sync: Última sincronización

================================================================================
5. COMANDOS TAURI REGISTRADOS (18 total)
================================================================================

COMANDOS DE VENTANA:
- minimize_window     → Minimizar ventana
- maximize_window    → Maximizar/Restaurar
- close_window       → Cerrar ventana

COMANDOS DE ARCHIVOS:
- open_external      → Abrir URL externa
- show_save_dialog  → Diálogo guardar archivo
- show_open_dialog  → Diálogo abrir archivo

COMANDOS DE BASE DE DATOS:
- db_query           → Query SQL
- db_insert         → Insertar registro
- db_update         → Actualizar registro
- db_delete         → Eliminar registro
- db_get_all        → Obtener todos

COMANDOS DE IA:
- get_ai_config     → Obtener config IA
- set_ai_config    → Guardar config IA
- get_ai_models    → Listar modelos
- check_ai_connection → Verificar conexión
- set_ai_active    → Activar/desactivar IA
- get_ai_history   → Historial de chat
- clear_ai_history → Limpiar historial
- add_ai_message  → Añadir mensaje
- get_ai_status   → Estado de IA

================================================================================
6. MODELOS DE IA SOPORTADOS
================================================================================

PROVEEDOR: Ollama (localhost:11434)
┌────────────────────┬────────────┬──────────┬──────────────────┐
│ Modelo             │ Parámetros│ Contexto│ Uso de RAM       │
├────────────────────┼────────────┼──────────┼──────────────────┤
│ Phi-3.5 Mini      │ 3.8B      │ 4096    │ ~4GB (bajo)      │
│ Llama 3           │ 8B        │ 8192    │ ~8GB (medio)     │
│ Mistral           │ 7B        │ 8192    │ ~7GB (medio)     │
│ Bonsai            │ 800M      │ 4096    │ ~2GB (muy bajo)  │
│ DeepSeek Coder   │ 6.7B      │ 8192    │ ~7GB (medio)     │
│ Qwen              │ 7B        │ 8192    │ ~7GB (medio)     │
└────────────────────┴────────────┴──────────┴──────────────────┘

PROVEEDOR: LM Studio (localhost:1234/v1)
- Modelos GGUF cargados desde LM Studio

PROVEEDOR: llama.cpp (localhost:8080)
- Modelos GGUF personalizados

================================================================================
7. SISTEMA DE IA - FUNCIONALIDADES
================================================================================

A) CHAT IA (tipo ChatGPT/Gemini)
- Interfaz flotante en la app
- Selector de modelo
- Historial de conversación
- Streaming de respuestas

B) AI SUPERVISOR AUTÓNOMO
- Analiza la app cada 30 segundos
- Detecta anomalías y errores
- Genera insights automáticos
- Clasifica eventos: OK, WARNING, ERROR, CRITICAL
- Puede ejecutar acciones correctivas

C) LOGGING INTELIGENTE
- Registra todas las acciones
- Almacena hasta 1000 eventos
- Persiste en localStorage
- Análisis automático de patrones

D) DETECTOR DE ANOMALÍAS
- Errores frecuentes
- Fallos de sincronización
- Alto uso de memoria
- Lentitud de respuesta

================================================================================
8. SINCRONIZACIÓN MULTI-PC
================================================================================

ARQUITECTURA:
- Base de datos local SQLite
- Cola de sync (_sync_queue)
- PC_ID único para cada PC
- Sync bidireccional con Supabase

FLUJO DE SYNC:
1. Usuario hace cambio en PC-A
2. Cambio se guarda en SQLite local
3. Cambio se encola en _sync_queue
4. Sync automático cada 30 segundos
5. Cambio se envía a Supabase Cloud
6. Otras PCs reciben el cambio
7. Conflictos se resuelven automáticamente

CAMPOS DE SYNC POR REGISTRO:
- _sync_pending: 1 = pendiente, 0 = sync
- _cloud_id: ID del registro en Supabase
- _pc_id: ID de la PC que creó el registro
- _last_sync: Timestamp de última sync

================================================================================
9. CONFIGURACIÓN DE ENTORNO
================================================================================

VARIABLES REQUERIDAS (.env):

# Supabase (Sincronización Cloud)
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=tu-clave-anon

# IA Local - Ollama
VITE_OLLAMA_URL=http://localhost:11434

# IA Local - LM Studio
VITE_LMSTUDIO_URL=http://localhost:1234/v1

# IA Local - llama.cpp
VITE_LLAMA_CPP_URL=http://localhost:8080

================================================================================
10. INSTALACIÓN Y USO
================================================================================

REQUISITOS PREVIOS:
- Node.js 18+
- Rust (latest stable)
- npm o yarn

INSTALACIÓN:
1. npm install
2. npm run tauri:build

INSTALADORES GENERADOS:
- Windows: src-tauri/target/release/bundle/nsis/Omnilab_1.0.2_x64-setup.exe
- Windows MSI: src-tauri/target/release/bundle/msi/Omnilab_1.0.2_x64.msi
- macOS: src-tauri/target/release/bundle/dmg/Omnilab_1.0.2_x64.dmg

INSTALACIÓN DE MODELOS IA (Ollama):
# Instalar Ollama
iwr -useb get.ollama.ai | iex

# Descargar modelos
ollama pull phi3
ollama pull llama3
ollama pull mistral

================================================================================
11. MEJORAS IMPLEMENTADAS vs ORIGINAL
================================================================================

OPTIMIZACIONES DE RENDIMIENTO:
✓ Profile release optimizado en Cargo.toml
✓ Comandos asíncronos para DB (no bloquean UI)
✓ Code splitting en Vite
✓ Cache inteligente con TTL
✓ Debounce en queries

FUNCIONALIDADES NUEVAS:
✓ Chat IA integrado
✓ AI Supervisor autónomo
✓ Sistema de logging
✓ Detector de anomalías
✓ Panel de monitoreo en tiempo real
✓ Sync multi-PC con Supabase
✓ Resolución de conflictos de sync

CORRECCIONES:
✓ Iconos para build de Windows
✓ Configuración de permisos Tauri
✓ Manejo de errores robusto

================================================================================
12. MÉTRICAS ESPERADAS DESPUÉS DE OPTIMIZACIÓN
================================================================================

MÉTRICA              │ ANTES  │ DESPUÉS │ MEJORA
─────────────────────┼────────┼─────────┼────────
Tamaño bundle        │ ~15MB  │ ~10MB  │ -33%
Tiempo inicio        │ ~5s    │ ~2s    │ -60%
UI freeze            │ Sí     │ No     │ 100%
Sync multi-PC        │ No     │ Sí     │ Nuevo
Chat IA             │ No     │ Sí     │ Nuevo
AI Supervisor       │ No     │ Sí     │ Nuevo
Offline-first       │ Sí     │ Sí     │ -
Error handling       │ Básico  │ Robusto │ Alto

================================================================================
13. ARCHIVOS CREADOS/MODIFICADOS DURANTE ESTA IMPLEMENTACIÓN
================================================================================

ARCHIVOS NUEVOS:
- src/supabaseClient.js
- src/syncService.js
- src/databaseService.js
- src/aiClient.js
- src/aiSupervisor.js
- src/AISupervisor.js
- src/aiConfig.js
- src/useAI.js
- src/cacheService.js
- src/errorHandler.js
- src/components/AppLoader.jsx
- src/components/NativeAIChat.jsx
- src/components/AIChat.jsx
- src/components/MonitoringPanel.jsx
- src/components/ErrorBoundary.jsx
- src/useDatabase.js
- src/aiConfig.js
- src-tauri/src/ai_commands.rs
- vite.config.js
- supabase-schema.sql

ARCHIVOS MODIFICADOS:
- package.json (añadido @supabase/supabase-js, uuid)
- src-tauri/Cargo.toml (perfil release optimizado)
- src-tauri/tauri.conf.json (configuración)
- src-tauri/src/main.rs (comandos IA)
- src-tauri/src/state.rs (estado async)
- src-tauri/src/commands.rs (comandos async)
- src-tauri/src/database.rs (soporte PC_ID)

================================================================================
14. NOTAS IMPORTANTES
================================================================================

1. ICONO: Para Windows se requiere un archivo icon.ico válido. Si el build
   falla, agregar un icono manualmente en src-tauri/icons/icon.ico

2. IA LOCAL: Los modelos IA NO están incluidos en el instalador. Deben
   instalarse por separado usando Ollama o LM Studio.

3. SUPABASE: Requiere crear proyecto en supabase.com y ejecutar el schema
   SQL proporcionado (supabase-schema.sql)

4. COMPILACIÓN: El primer build puede tomar 10-30 minutos dependiendo del
   hardware. Las compilaciones posteriores son más rápidas.

================================================================================
15. PRÓXIMOS PASOS SUGERIDOS
================================================================================

1. ✓ Completar build (agregar icono)
2. Probar instalación en Windows
3. Configurar Supabase
4. Instalar Ollama y modelos
5. Probar chat IA
6. Probar sync multi-PC
7. Probar AI Supervisor

================================================================================
                              FIN DEL RESUMEN
================================================================================

Documento generado automáticamente para Omnilab v1.0.2
Fecha: 2026-04-14
