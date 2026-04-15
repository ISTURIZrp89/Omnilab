use chrono::Utc;
use rusqlite::{params, Connection, Result};
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::atomic::{AtomicU64, Ordering};
use uuid::Uuid;

static PC_ID: AtomicU64 = AtomicU64::new(0);

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DbRow {
    pub id: String,
    pub data: serde_json::Value,
    pub created_at: String,
    pub updated_at: String,
    pub deleted: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PendingChange {
    pub id: i64,
    pub table_name: String,
    pub record_id: String,
    pub action: String,
    pub data: String,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SyncRecord {
    pub id: String,
    pub cloud_id: Option<String>,
    pub pc_id: u64,
    pub action: String,
    pub synced: bool,
}

use std::sync::{Arc, Mutex as StdMutex};

#[derive(Clone)]
pub struct Database {
    conn: Arc<StdMutex<Connection>>,
}

pub fn init_pc_id() -> u64 {
    let stored = std::env::var("OMNILAB_PC_ID")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or_else(|| {
            let id = rand_pc_id();
            std::env::set_var("OMNILAB_PC_ID", id.to_string());
            id
        });
    PC_ID.store(stored, Ordering::SeqCst);
    stored
}

fn rand_pc_id() -> u64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos() as u64
}

pub fn get_pc_id() -> u64 {
    PC_ID.load(Ordering::SeqCst)
}

impl Database {
    pub fn new(path: &Path) -> Result<Self> {
        let conn = Connection::open(path)?;
        let db = Database {
            conn: Arc::new(StdMutex::new(conn)),
        };
        db.init_tables()?;
        Ok(db)
    }

    fn init_tables(&self) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS EQUIPOS (
                id TEXT PRIMARY KEY,
                nombre TEXT NOT NULL,
                tipo TEXT,
                modelo TEXT,
                serie TEXT,
                ubicacion TEXT,
                estado TEXT DEFAULT 'operativo',
                mantenimiento TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                deleted INTEGER DEFAULT 0,
                _sync_pending INTEGER DEFAULT 0,
                _cloud_id TEXT,
                _last_sync TEXT
            );
            
            CREATE TABLE IF NOT EXISTS RECEPCION (
                id TEXT PRIMARY KEY,
                folio TEXT,
                fecha_entrada TEXT,
                proveedor TEXT,
                material TEXT,
                cantidad TEXT,
                observaciones TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                deleted INTEGER DEFAULT 0,
                _sync_pending INTEGER DEFAULT 0,
                _cloud_id TEXT,
                _last_sync TEXT
            );
            
            CREATE TABLE IF NOT EXISTS BITACORA (
                id TEXT PRIMARY KEY,
                meta TEXT,
                actividades TEXT,
                cajas TEXT,
                recursos TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                deleted INTEGER DEFAULT 0,
                _sync_pending INTEGER DEFAULT 0,
                _cloud_id TEXT,
                _last_sync TEXT
            );
            
            CREATE TABLE IF NOT EXISTS COND_AMB (
                id TEXT PRIMARY KEY,
                fecha TEXT,
                temperatura REAL,
                humedad REAL,
                presion REAL,
                observaciones TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                deleted INTEGER DEFAULT 0,
                _sync_pending INTEGER DEFAULT 0,
                _cloud_id TEXT,
                _last_sync TEXT
            );
            
            CREATE TABLE IF NOT EXISTS CAJAS (
                id TEXT PRIMARY KEY,
                nombre TEXT,
                tipo TEXT,
                capacidad INTEGER,
                ubicacion TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                deleted INTEGER DEFAULT 0,
                _sync_pending INTEGER DEFAULT 0,
                _cloud_id TEXT,
                _last_sync TEXT
            );
            
            CREATE TABLE IF NOT EXISTS _sync_queue (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                table_name TEXT NOT NULL,
                record_id TEXT NOT NULL,
                action TEXT NOT NULL,
                data TEXT,
                pc_id INTEGER NOT NULL,
                created_at TEXT NOT NULL
            );
            
            CREATE INDEX IF NOT EXISTS idx_equipos_nombre ON EQUIPOS(nombre);
            CREATE INDEX IF NOT EXISTS idx_recepcion_fecha ON RECEPCION(fecha_entrada);
            CREATE INDEX IF NOT EXISTS idx_bitacora_fecha ON BITACORA(created_at);
            CREATE INDEX IF NOT EXISTS idx_sync_pending ON _sync_queue(created_at);
            ",
        )?;
        Ok(())
    }

    pub fn query(
        &self,
        sql: &str,
        params: &[&dyn rusqlite::ToSql],
    ) -> Result<Vec<serde_json::Value>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(sql)?;

        let col_count = stmt.column_count();
        let col_names: Vec<String> = (0..col_count)
            .map(|i| stmt.column_name(i).unwrap_or("").to_string())
            .collect();

        let rows = stmt.query_map(params, move |row| {
            let mut result = serde_json::Map::new();
            for i in 0..col_count {
                let name = col_names[i].clone();
                let value: rusqlite::types::Value = row.get(i)?;
                match value {
                    rusqlite::types::Value::Null => {
                        result.insert(name, serde_json::Value::Null);
                    }
                    rusqlite::types::Value::Integer(n) => {
                        result.insert(name, serde_json::json!(n));
                    }
                    rusqlite::types::Value::Real(n) => {
                        result.insert(name, serde_json::json!(n));
                    }
                    rusqlite::types::Value::Text(s) => {
                        result.insert(name, serde_json::json!(s));
                    }
                    rusqlite::types::Value::Blob(b) => {
                        result.insert(name, serde_json::json!(STANDARD.encode(&b)));
                    }
                }
            }
            Ok(serde_json::Value::Object(result))
        })?;

        rows.collect()
    }

    pub fn insert(&self, table: &str, data: serde_json::Value) -> Result<String> {
        let id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();

        let data_obj = match data.clone() {
            serde_json::Value::Object(obj) => obj,
            _ => {
                return Err(rusqlite::Error::InvalidParameterType(
                    "data must be an object".to_string(),
                ))
            }
        };

        let columns: Vec<String> = data_obj.keys().map(|k| k.clone()).collect();
        let placeholders: Vec<String> = (0..columns.len()).map(|_| "?".to_string()).collect();

        let sql = format!(
            "INSERT INTO {} (id, {}, created_at, updated_at) VALUES (?1, {}, ?2, ?2)",
            table,
            columns.join(", "),
            placeholders.join(", ")
        );

        let mut param_values: Vec<Box<dyn rusqlite::ToSql>> = vec![Box::new(id.clone())];
        for col in &columns {
            if let Some(val) = data_obj.get(col) {
                let json_str = val.to_string();
                param_values.push(Box::new(json_str));
            } else {
                param_values.push(Box::new("".to_string()));
            }
        }
        param_values.push(Box::new(now.clone()));
        param_values.push(Box::new(now));

        let params_refs: Vec<&dyn rusqlite::ToSql> =
            param_values.iter().map(|b| b.as_ref()).collect();

        let conn = self.conn.lock().unwrap();
        conn.execute(&sql, params_refs.as_slice())?;
        drop(conn);

        self.queue_sync_change(table, &id, "insert", &data)?;

        Ok(id)
    }

    pub fn update(&self, table: &str, id: &str, data: serde_json::Value) -> Result<()> {
        let now = Utc::now().to_rfc3339();

        let data_obj = match data.clone() {
            serde_json::Value::Object(obj) => obj,
            _ => {
                return Err(rusqlite::Error::InvalidParameterType(
                    "data must be an object".to_string(),
                ))
            }
        };

        let set_clause: Vec<String> = data_obj.keys().map(|k| format!("{} = ?", k)).collect();

        let sql = format!(
            "UPDATE {} SET {}, updated_at = ? WHERE id = ?",
            table,
            set_clause.join(", ")
        );

        let mut param_values: Vec<Box<dyn rusqlite::ToSql>> = vec![];
        for val in data_obj.values() {
            let json_str = val.to_string();
            param_values.push(Box::new(json_str));
        }
        param_values.push(Box::new(now.clone()));
        param_values.push(Box::new(id.to_string()));

        let params_refs: Vec<&dyn rusqlite::ToSql> =
            param_values.iter().map(|b| b.as_ref()).collect();

        let conn = self.conn.lock().unwrap();
        conn.execute(&sql, params_refs.as_slice())?;
        drop(conn);

        self.queue_sync_change(table, id, "update", &data)?;

        Ok(())
    }

    pub fn delete(&self, table: &str, id: &str) -> Result<()> {
        let now = Utc::now().to_rfc3339();

        let conn = self.conn.lock().unwrap();
        conn.execute(
            &format!(
                "UPDATE {} SET deleted = 1, updated_at = ? WHERE id = ?",
                table
            ),
            params![now, id],
        )?;
        drop(conn);

        self.queue_sync_change(table, id, "delete", &serde_json::Value::Null)?;

        Ok(())
    }

    pub fn get_all(
        &self,
        table: &str,
        where_clause: Option<&str>,
        order_by: Option<&str>,
        limit: Option<i64>,
    ) -> Result<Vec<serde_json::Value>> {
        let mut sql = format!("SELECT * FROM {} WHERE deleted = 0", table);

        if let Some(where_str) = where_clause {
            sql.push_str(&format!(" AND {}", where_str));
        }

        if let Some(order) = order_by {
            sql.push_str(&format!(" ORDER BY {}", order));
        } else {
            sql.push_str(" ORDER BY created_at DESC");
        }

        if let Some(lim) = limit {
            sql.push_str(&format!(" LIMIT {}", lim));
        }

        self.query(&sql, &[])
    }

    fn queue_sync_change(
        &self,
        table: &str,
        record_id: &str,
        action: &str,
        data: &serde_json::Value,
    ) -> Result<()> {
        let now = Utc::now().to_rfc3339();
        let data_str = data.to_string();

        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO _sync_queue (table_name, record_id, action, data, created_at) VALUES (?, ?, ?, ?, ?)",
            params![table, record_id, action, data_str, now],
        )?;

        Ok(())
    }

    pub fn get_pending_changes(&self) -> Result<Vec<PendingChange>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, table_name, record_id, action, data, created_at FROM _sync_queue ORDER BY created_at ASC"
        )?;

        let rows = stmt.query_map([], |row| {
            Ok(PendingChange {
                id: row.get(0)?,
                table_name: row.get(1)?,
                record_id: row.get(2)?,
                action: row.get(3)?,
                data: row.get(4)?,
                created_at: row.get(5)?,
            })
        })?;

        rows.collect()
    }

    pub fn clear_synced_changes(&self, ids: &[i64]) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        for id in ids {
            conn.execute("DELETE FROM _sync_queue WHERE id = ?", params![id])?;
        }
        Ok(())
    }
}

use base64::{engine::general_purpose::STANDARD, Engine};
