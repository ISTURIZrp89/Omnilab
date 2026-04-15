use std::sync::Mutex;
use tokio::sync::Mutex as TokioMutex;
use tauri::{Manager, AppHandle, State};
use serde::{Deserialize, Serialize};
use rusqlite::{Connection, params};
use chrono::Local;
use uuid::Uuid;
use std::path::PathBuf;
use directories::ProjectDirs;

mod database;
mod commands;
mod state;
mod ai_commands;

use database::Database;
use state::AppState;

#[derive(Debug, Serialize, Deserialize)]
pub struct AppConfig {
    pub app_name: String,
    pub app_version: String,
    pub db_path: PathBuf,
    pub log_path: PathBuf,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            app_name: "Omnilab".to_string(),
            app_version: "1.0.2".to_string(),
            db_path: PathBuf::new(),
            log_path: PathBuf::new(),
        }
    }
}

fn get_app_dir() -> PathBuf {
    if let Some(proj_dirs) = ProjectDirs::from("com", "omnilab", "Omnilab") {
        proj_dirs.data_dir().to_path_buf()
    } else {
        std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
    }
}

fn setup_logging(log_path: &PathBuf) -> Result<(), Box<dyn std::error::Error>> {
    std::fs::create_dir_all(log_path)?;
    let log_file = log_path.join(format!("omnilab_{}.log", Local::now().format("%Y-%m-%d")));
    let log_file_clone = log_file.clone();
    
    std::panic::set_hook(Box::new(move |panic_info| {
        let msg = format!("[{}] [PANIC] {}\n", Local::now().format("%Y-%m-%d %H:%M:%S"), panic_info);
        if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(&log_file_clone) {
            use std::io::Write;
            let _ = f.write_all(msg.as_bytes());
        }
    }));
    
    Ok(())
}

fn log_message(log_path: &PathBuf, level: &str, message: &str, data: Option<&serde_json::Value>) {
    let timestamp = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let entry = if let Some(d) = data {
        format!("[{}] [{}] {} {}\n", timestamp, level, message, serde_json::to_string(d).unwrap_or_default())
    } else {
        format!("[{}] [{}] {}\n", timestamp, level, message)
    };
    
    let log_file = log_path.join(format!("omnilab_{}.log", Local::now().format("%Y-%m-%d")));
    if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(&log_file) {
        use std::io::Write;
        let _ = f.write_all(entry.as_bytes());
    }
    
    if cfg!(debug_assertions) {
        println!("{}", entry.trim());
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app_dir = get_app_dir();
    let log_path = app_dir.join("logs");
    let db_path = app_dir.join("omnilab.db");
    
    let _ = setup_logging(&log_path);
    log_message(&log_path, "INFO", "Iniciando OmniLab...", None);
    
    std::fs::create_dir_all(&app_dir).ok();
    
    let db = Database::new(&db_path).expect("Failed to initialize database");
    log_message(&log_path, "INFO", "Base de datos inicializada", Some(&serde_json::json!({"path": db_path.to_string_lossy()})));
    
    let app_state = AppState {
        db: Mutex::new(db.clone()),
        db_async: tokio::sync::Mutex::new(db),
        app_dir: app_dir.clone(),
    };
    
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_opener::init())
        .manage(app_state)
        .setup(|app| {
            log_message(&log_path, "INFO", "Aplicación configurada", None);
            
            #[cfg(debug_assertions)]
            {
                let window = app.get_webview_window("main").unwrap();
                window.open_devtools();
            }
            
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_version,
            commands::get_app_path,
            commands::open_external,
            commands::show_save_dialog,
            commands::show_open_dialog,
            commands::minimize_window,
            commands::maximize_window,
            commands::close_window,
            commands::db_query,
            commands::db_insert,
            commands::db_update,
            commands::db_delete,
            commands::db_get_all,
            commands::get_sync_status,
            commands::trigger_sync,
            commands::get_pending_changes,
            commands::db_query_async,
            commands::db_insert_async,
            commands::db_get_all_async,
            commands::get_app_state,
            ai_commands::get_ai_config,
            ai_commands::set_ai_config,
            ai_commands::get_ai_models,
            ai_commands::check_ai_connection,
            ai_commands::set_ai_active,
            ai_commands::get_ai_history,
            ai_commands::clear_ai_history,
            ai_commands::add_ai_message,
            ai_commands::get_ai_status,
        ])
        .manage(ai_commands::AIState::new())
        .on_window_event(|window, event| {
            match event {
                tauri::WindowEvent::CloseRequested { .. } => {
                    log_message(&log_path, "INFO", "Ventana cerrada", None);
                }
                tauri::WindowEvent::Resized(_) => {
                    let _ = window.emit("window:maximized", window.is_maximized());
                }
                _ => {}
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}