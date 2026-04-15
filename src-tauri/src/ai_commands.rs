use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::State;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AIModel {
    pub id: String,
    pub name: String,
    pub context: u32,
    pub parameters: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AIConfig {
    pub provider: String,
    pub url: String,
    pub model: String,
    pub temperature: f32,
    pub max_tokens: u32,
}

impl Default for AIConfig {
    fn default() -> Self {
        Self {
            provider: "ollama".to_string(),
            url: "http://localhost:11434".to_string(),
            model: "phi3".to_string(),
            temperature: 0.7,
            max_tokens: 2048,
        }
    }
}

pub struct AIState {
    pub config: Mutex<AIConfig>,
    pub history: Mutex<Vec<Message>>,
    pub is_active: Mutex<bool>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Message {
    pub role: String,
    pub content: String,
}

impl AIState {
    pub fn new() -> Self {
        Self {
            config: Mutex::new(AIConfig::default()),
            history: Mutex::new(Vec::new()),
            is_active: Mutex::new(false),
        }
    }
}

#[tauri::command]
pub fn get_ai_config(state: State<AIState>) -> Result<AIConfig, String> {
    let config = state.config.lock().map_err(|e| e.to_string())?;
    Ok(config.clone())
}

#[tauri::command]
pub fn set_ai_config(state: State<AIState>, config: AIConfig) -> Result<(), String> {
    let mut current = state.config.lock().map_err(|e| e.to_string())?;
    *current = config;
    Ok(())
}

#[tauri::command]
pub fn get_ai_models() -> Vec<AIModel> {
    vec![
        AIModel {
            id: "phi3".to_string(),
            name: "Phi-3.5 Mini".to_string(),
            context: 4096,
            parameters: "3.8B".to_string(),
        },
        AIModel {
            id: "bonsai".to_string(),
            name: "Bonsai".to_string(),
            context: 4096,
            parameters: "800M".to_string(),
        },
        AIModel {
            id: "llama3".to_string(),
            name: "Llama 3".to_string(),
            context: 8192,
            parameters: "8B".to_string(),
        },
        AIModel {
            id: "mistral".to_string(),
            name: "Mistral".to_string(),
            context: 8192,
            parameters: "7B".to_string(),
        },
        AIModel {
            id: "deepseek-coder".to_string(),
            name: "DeepSeek Coder".to_string(),
            context: 8192,
            parameters: "6.7B".to_string(),
        },
        AIModel {
            id: "qwen".to_string(),
            name: "Qwen".to_string(),
            context: 8192,
            parameters: "7B".to_string(),
        },
    ]
}

#[tauri::command]
pub fn check_ai_connection(url: String) -> Result<bool, String> {
    Ok(true)
}

#[tauri::command]
pub fn set_ai_active(state: State<AIState>, active: bool) -> Result<(), String> {
    let mut is_active = state.is_active.lock().map_err(|e| e.to_string())?;
    *is_active = active;
    Ok(())
}

#[tauri::command]
pub fn get_ai_history(state: State<AIState>) -> Result<Vec<Message>, String> {
    let history = state.history.lock().map_err(|e| e.to_string())?;
    Ok(history.clone())
}

#[tauri::command]
pub fn clear_ai_history(state: State<AIState>) -> Result<(), String> {
    let mut history = state.history.lock().map_err(|e| e.to_string())?;
    history.clear();
    Ok(())
}

#[tauri::command]
pub fn add_ai_message(state: State<AIState>, role: String, content: String) -> Result<(), String> {
    let mut history = state.history.lock().map_err(|e| e.to_string())?;
    if history.len() > 20 {
        history.remove(0);
    }
    history.push(Message { role, content });
    Ok(())
}

#[tauri::command]
pub fn get_ai_status(state: State<AIState>) -> Result<serde_json::Value, String> {
    let config = state.config.lock().map_err(|e| e.to_string())?;
    let is_active = state.is_active.lock().map_err(|e| e.to_string())?;
    let history = state.history.lock().map_err(|e| e.to_string())?;

    Ok(serde_json::json!({
        "provider": config.provider,
        "model": config.model,
        "active": *is_active,
        "history_count": history.len(),
    }))
}
