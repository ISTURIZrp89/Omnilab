use std::path::PathBuf;
use std::sync::Mutex;
use tokio::sync::Mutex as TokioMutex;

use crate::database::Database;

pub struct AppState {
    pub db: Mutex<Database>,
    pub db_async: TokioMutex<Database>,
    pub app_dir: PathBuf,
}

impl AppState {
    pub fn new(db: Database, app_dir: PathBuf) -> Self {
        Self {
            db: Mutex::new(db.clone()),
            db_async: TokioMutex::new(db),
            app_dir,
        }
    }
}
