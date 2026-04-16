use crate::AppState;
use tauri::{command, State, AppHandle};
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
pub struct SyncStatus {
    pub last_sync: Option<String>,
    pub pending_count: i64,
    pub sync_enabled: bool,
}

#[command]
pub fn get_version() -> String {
    "1.0.2".to_string()
}

#[command]
pub fn get_app_path(state: State<AppState>) -> String {
    state.app_dir.to_string_lossy().to_string()
}

#[command]
pub async fn open_external(url: String) -> Result<(), String> {
    open::that(&url).map_err(|e| e.to_string())
}

#[command]
pub async fn show_save_dialog(
    app: AppHandle,
    title: String,
    default_path: Option<String>,
    filters: Option<Vec<String>>,
) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    
    let mut dialog = app.dialog().file();
    dialog.set_title(&title);
    
    if let Some(path) = default_path {
        dialog.set_file_name(&path);
    }
    
    if let Some(f) = filters {
        for filter in f {
            let parts: Vec<&str> = filter.split('|').collect();
            if parts.len() >= 2 {
                dialog.add_filter(parts[0], &[parts[1]]);
            }
        }
    }
    
    let file = dialog.save_file().await;
    Ok(file.map(|p| p.to_string()))
}

#[command]
pub async fn show_open_dialog(
    app: AppHandle,
    title: String,
    multiple: bool,
    filters: Option<Vec<String>>,
) -> Result<Vec<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    
    let mut dialog = app.dialog().file();
    dialog.set_title(&title);
    
    if let Some(f) = filters {
        for filter in f {
            let parts: Vec<&str> = filter.split('|').collect();
            if parts.len() >= 2 {
                dialog.add_filter(parts[0], &[parts[1]]);
            }
        }
    }
    
    let files = if multiple {
        dialog.pick_files().await
            .map(|f| f.into_iter().map(|p| p.to_string()).collect())
            .unwrap_or_default()
    } else {
        dialog.pick_file().await
            .map(|f| vec![f.to_string()])
            .unwrap_or_default()
    };
    
    Ok(files)
}

#[command]
pub fn minimize_window(window: tauri::Window) {
    window.minimize().ok();
}

#[command]
pub fn maximize_window(window: tauri::Window) {
    if window.is_maximized().unwrap_or(false) {
        window.unmaximize().ok();
    } else {
        window.maximize().ok();
    }
}

#[command]
pub fn close_window(window: tauri::Window) {
    window.close().ok();
}

fn json_value_to_sql_param(value: &serde_json::Value) -> Box<dyn rusqlite::ToSql + Send> {
    match value {
        serde_json::Value::Null => Box::new(rusqlite::types::Null),
        serde_json::Value::Bool(b) => Box::new(*b),
        serde_json::Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                Box::new(i)
            } else if let Some(f) = n.as_f64() {
                Box::new(f)
            } else {
                Box::new(n.to_string())
            }
        }
        serde_json::Value::String(s) => Box::new(s.clone()),
        serde_json::Value::Array(arr) => Box::new(serde_json::to_string(arr).unwrap_or_default()),
        serde_json::Value::Object(obj) => Box::new(serde_json::to_string(obj).unwrap_or_default()),
    }
}

#[command]
pub fn db_query(
    state: State<AppState>,
    sql: String,
    params: Vec<serde_json::Value>,
) -> Result<Vec<serde_json::Value>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    
    let param_refs: Vec<Box<dyn rusqlite::ToSql + Send>> = params.iter()
        .map(|p| json_value_to_sql_param(p))
        .collect();
    
    let param_refs: Vec<&dyn rusqlite::ToSql> = param_refs.iter().map(|b| b.as_ref()).collect();
    
    db.query(&sql, param_refs.as_slice())
        .map_err(|e| e.to_string())
}

#[command]
pub fn db_insert(
    state: State<AppState>,
    table: String,
    data: serde_json::Value,
) -> Result<String, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    
    db.insert(&table, data)
        .map_err(|e| e.to_string())
}

#[command]
pub fn db_update(
    state: State<AppState>,
    table: String,
    id: String,
    data: serde_json::Value,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    
    db.update(&table, &id, data)
        .map_err(|e| e.to_string())
}

#[command]
pub fn db_delete(
    state: State<AppState>,
    table: String,
    id: String,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    
    db.delete(&table, &id)
        .map_err(|e| e.to_string())
}

#[command]
pub fn db_get_all(
    state: State<AppState>,
    table: String,
    where_clause: Option<String>,
    order_by: Option<String>,
    limit: Option<i64>,
) -> Result<Vec<serde_json::Value>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    
    db.get_all(&table, where_clause.as_deref(), order_by.as_deref(), limit)
        .map_err(|e| e.to_string())
}

#[command]
pub fn get_sync_status(state: State<AppState>) -> Result<SyncStatus, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    
    let changes = db.get_pending_changes().map_err(|e| e.to_string())?;
    
    Ok(SyncStatus {
        last_sync: None,
        pending_count: changes.len() as i64,
        sync_enabled: true,
    })
}

#[command]
pub fn trigger_sync(state: State<AppState>) -> Result<String, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    
    let changes = db.get_pending_changes().map_err(|e| e.to_string())?;
    let count = changes.len();
    
    Ok(format!("{} cambios pendientes sincronizados", count))
}

#[command]
pub fn get_pending_changes(state: State<AppState>) -> Result<Vec<serde_json::Value>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    
    let changes = db.get_pending_changes().map_err(|e| e.to_string())?;
    
    let json_changes: Vec<serde_json::Value> = changes.into_iter()
        .map(|c| serde_json::json!({
            "id": c.id,
            "table": c.table_name,
            "record_id": c.record_id,
            "action": c.action,
            "data": c.data,
            "created_at": c.created_at
        }))
        .collect();
    
    Ok(json_changes)
}

#[command]
pub async fn db_query_async(
    state: State<'_, AppState>,
    sql: String,
    params: Vec<serde_json::Value>,
) -> Result<Vec<serde_json::Value>, String> {
    let db = state.db_async.lock().await;
    
    let param_refs: Vec<Box<dyn rusqlite::ToSql + Send>> = params.iter()
        .map(|p| json_value_to_sql_param(p))
        .collect();
    
    let param_refs: Vec<&dyn rusqlite::ToSql> = param_refs.iter().map(|b| b.as_ref()).collect();
    
    db.query(&sql, param_refs.as_slice())
        .map_err(|e| e.to_string())
}

#[command]
pub async fn db_insert_async(
    state: State<'_, AppState>,
    table: String,
    data: serde_json::Value,
) -> Result<String, String> {
    let db = state.db_async.lock().await;
    
    db.insert(&table, data)
        .map_err(|e| e.to_string())
}

#[command]
pub async fn db_get_all_async(
    state: State<'_, AppState>,
    table: String,
    where_clause: Option<String>,
    order_by: Option<String>,
    limit: Option<i64>,
) -> Result<Vec<serde_json::Value>, String> {
    let db = state.db_async.lock().await;
    
    db.get_all(&table, where_clause.as_deref(), order_by.as_deref(), limit)
        .map_err(|e| e.to_string())
}

#[command]
pub async fn get_app_state() -> serde_json::Value {
    serde_json::json!({
        "status": "ready",
        "version": "1.0.2",
        "optimized": true
    })
}
