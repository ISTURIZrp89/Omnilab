# OmniLab - Migración a Tauri

## Estado de la Migración

La aplicación ha sido preparada para usar **Tauri 2** en lugar de Electron.

### Estructura Creada

```
src-tauri/
├── Cargo.toml          # Dependencias Rust
├── build.rs            # Build script
├── tauri.conf.json     # Configuración de Tauri
├── preload.js          # API expuesta al frontend
├── capabilities/
│   └── default.json    # Permisos
└── src/
    ├── main.rs         # Punto de entrada
    ├── lib.rs          # Biblioteca
    ├── database.rs     # Base de datos SQLite
    ├── commands.rs     # Comandos IPC
    └── state.rs        # Estado de la app
```

## Pasos para Completar la Migración

### 1. Instalar Rust

```powershell
# En Windows (PowerShell como administrador):
winget install Rustlang.Rust.MSVC

# O manualmente desde: https://rustup.rs/
```

### 2. Instalar Dependencias npm

```bash
npm install
```

### 3. Desarrollo

```bash
# Iniciar el servidor de desarrollo Vite
npm run dev

# En otra terminal, iniciar Tauri
npm run tauri:dev
```

### 4. Construir la Aplicación

```bash
npm run tauri:build
```

## API Disponible en el Frontend

```javascript
// Base de datos
window.electronAPI.database.query(sql, params)
window.electronAPI.database.insert(table, data)
window.electronAPI.database.update(table, id, data)
window.electronAPI.database.delete(table, id)
window.electronAPI.database.getAll(table, options)

// Sistema
window.electronAPI.system.getVersion()
window.electronAPI.system.getPath(name)
window.electronAPI.system.openExternal(url)
window.electronAPI.system.showSaveDialog(options)
window.electronAPI.system.showOpenDialog(options)

// Ventana
window.electronAPI.window.minimize()
window.electronAPI.window.maximize()
window.electronAPI.window.close()
window.electronAPI.window.onMaximizedChange(callback)

// Sincronización
window.electronAPI.sync.getStatus()
window.electronAPI.sync.trigger()
window.electronAPI.sync.getPending()
```

## Notas

- La base de datos SQLite ahora está implementada en Rust
- La AI (WebLLM) funciona en el renderer y se puede integrar posteriormente
- Los diálogos y sistema de archivos usan los plugins oficiales de Tauri
- El archivo `omnilab.db` se迁移ará automáticamente al directorio de datos de la aplicación