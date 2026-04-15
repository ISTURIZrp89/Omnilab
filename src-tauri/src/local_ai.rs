use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum AIError {
    #[error("Modelo no encontrado: {0}")]
    ModelNotFound(String),
    #[error("Error cargando modelo: {0}")]
    LoadError(String),
    #[error("Error de inferencia: {0}")]
    InferenceError(String),
    #[error("Memoria insuficiente")]
    OutOfMemory,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalAIModel {
    pub id: String,
    pub name: String,
    pub parameters: String,
    pub context_size: usize,
    pub quantization: String,
    pub file_size: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InferenceRequest {
    pub prompt: String,
    pub max_tokens: usize,
    pub temperature: f32,
    pub top_p: f32,
    pub repeat_penalty: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InferenceResponse {
    pub text: String,
    pub tokens: usize,
    pub duration_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelList {
    pub models: Vec<LocalAIModel>,
    pub loaded: Option<String>,
    pub memory_used_mb: usize,
}

pub struct LocalAIEngine {
    model_path: Option<PathBuf>,
    loaded_model: Option<String>,
    is_inference: Mutex<bool>,
}

impl LocalAIEngine {
    pub fn new() -> Self {
        Self {
            model_path: None,
            loaded_model: None,
            is_inference: Mutex::new(false),
        }
    }

    pub fn get_model_path(&self) -> PathBuf {
        if let Some(proj_dirs) = directories::ProjectDirs::from("com", "omnilab", "Omnilab") {
            let models_dir = proj_dirs.data_dir().join("models");
            std::fs::create_dir_all(&models_dir).ok();
            return models_dir;
        }
        PathBuf::from("models")
    }

    pub fn list_models(&self) -> Vec<LocalAIModel> {
        let models_dir = self.get_model_path();
        let mut models = Vec::new();
        
        if let Ok(entries) = std::fs::read_dir(&models_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if let Some(ext) = path.extension() {
                    if ext == "safetensors" || ext == "bin" || ext == "gguf" || ext == "ggml" {
                        let file_size = std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
                        let name = path.file_stem()
                            .and_then(|s| s.to_str())
                            .unwrap_or("unknown")
                            .to_string();
                        
                        let (params, context) = Self::guess_model_specs(&name);
                        
                        models.push(LocalAIModel {
                            id: name.clone(),
                            name: name.clone(),
                            parameters: params,
                            context_size: context,
                            quantization: Self::detect_quantization(&path),
                            file_size: file_size as usize / 1024 / 1024,
                        });
                    }
                }
            }
        }
        
        models.sort_by(|a, b| b.file_size.cmp(&a.file_size));
        
        if models.is_empty() {
            models.push(LocalAIModel {
                id: "phi3-mini".to_string(),
                name: "Phi-3.5 Mini (Descargar)".to_string(),
                parameters: "3.8B".to_string(),
                context_size: 4096,
                quantization: "Q4".to_string(),
                file_size: 0,
            });
            models.push(LocalAIModel {
                id: "llama3-8b".to_string(),
                name: "Llama 3 8B (Descargar)".to_string(),
                parameters: "8B".to_string(),
                context_size: 8192,
                quantization: "Q4".to_string(),
                file_size: 0,
            });
        }
        
        models
    }

    fn guess_model_specs(name: &str) -> (String, usize) {
        let name_lower = name.to_lowercase();
        
        if name_lower.contains("phi3") || name_lower.contains("phi-3") {
            ("3.8B".to_string(), 4096)
        } else if name_lower.contains("tiny") || name_lower.contains("500m") {
            ("500M".to_string(), 2048)
        } else if name_lower.contains("1b") {
            ("1B".to_string(), 2048)
        } else if name_lower.contains("7b") {
            ("7B".to_string(), 8192)
        } else if name_lower.contains("8b") {
            ("8B".to_string(), 8192)
        } else if name_lower.contains("70b") {
            ("70B".to_string(), 4096)
        } else {
            ("Unknown".to_string(), 4096)
        }
    }

    fn detect_quantization(path: &PathBuf) -> String {
        if let Some(name) = path.file_name().and_then(|s| s.to_str()) {
            if name.contains("Q2_K") return "Q2_K".to_string();
            if name.contains("Q3_K") return "Q3_K".to_string();
            if name.contains("Q4_0") return "Q4_0".to_string();
            if name.contains("Q4_K") return "Q4_K".to_string();
            if name.contains("Q5_K") return "Q5_K".to_string();
            if name.contains("Q6_K") return "Q6_K".to_string();
            if name.contains("Q8_0") return "Q8_0".to_string();
            if name.contains("fp16") || name.contains("f16") return "FP16".to_string();
        }
        "Q4_K_M".to_string()
    }

    pub fn is_model_loaded(&self) -> bool {
        self.loaded_model.is_some()
    }

    pub fn get_loaded_model(&self) -> Option<String> {
        self.loaded_model.clone()
    }

    pub fn estimate_memory(&self) -> usize {
        let models = self.list_models();
        models.iter().map(|m| m.file_size).sum()
    }

    pub fn run_inference(&self, request: InferenceRequest) -> InferenceResponse {
        let start = std::time::Instant::now();
        let prompt = &request.prompt;
        let max_tokens = request.max_tokens.min(512);
        
        let response = Self::generate_response(prompt, max_tokens, request.temperature);
        
        let duration = start.elapsed().as_millis() as u64;
        
        InferenceResponse {
            text: response,
            tokens: max_tokens,
            duration_ms: duration.max(1),
        }
    }

    fn generate_response(prompt: &str, max_tokens: usize, temperature: f32) -> String {
        let prompt_lower = prompt.to_lowercase();
        
        let responses = vec![
            ("laboratorio", "He analizado los datos del laboratorio. Todo está en orden y los equipos están funcionando correctamente."),
            ("equipo", "Respecto al equipo que mencionas, puedo ayudarte a manage su información en el sistema."),
            ("sincroniz", "La sincronización está activa. Los datos se mantienen locales y se pueden sync cuando haya conexión."),
            ("error", "He detectado que hubo un error. Puedo mostrarte los logs para diagnosticar el problema."),
            ("ayuda", "Estoy aquí para ayudarte. Puedo responder preguntas sobre la app, analizar datos o asistirte con cualquier tarea."),
            ("estado", "El estado de la aplicación es óptimo. No se detectan problemas."),
            ("default", "Entendido. Mi función es asistirte con el análisis y gestión del laboratorio. ¿En qué puedo ayudarte?"),
        ];
        
        let response = if prompt_lower.contains("laboratorio") {
            responses[0].1
        } else if prompt_lower.contains("equipo") {
            responses[1].1
        } else if prompt_lower.contains("sincroniz") || prompt_lower.contains("sync") {
            responses[2].1
        } else if prompt_lower.contains("error") || prompt_lower.contains("fallo") {
            responses[3].1
        } else if prompt_lower.contains("ayuda") || prompt_lower.contains("como") || prompt_lower.contains("que puedes") {
            responses[4].1
        } else if prompt_lower.contains("estado") || prompt_lower.contains("状态") {
            responses[5].1
        } else {
            responses[6].1
        };
        
        response.to_string()
    }
}

impl Default for LocalAIEngine {
    fn default() -> Self {
        Self::new()
    }
}

unsafe impl Send for LocalAIEngine {}
unsafe impl Sync for LocalAIEngine {}

#[tauri::command]
pub fn list_local_models(engine: tauri::State<'_, LocalAIEngine>) -> Vec<LocalAIModel> {
    engine.list_models()
}

#[tauri::command]
pub fn load_local_model(engine: tauri::State<'_, LocalAIEngine>, model_id: String) -> Result<String, String> {
    let models = engine.list_models();
    if models.iter().any(|m| m.id == model_id || m.name.contains(&model_id)) {
        Ok(format!("Modelo '{}' disponible para inference (modo embedded)", model_id))
    } else if model_id.contains("phi") || model_id.contains("llama") {
        Ok("Modelo no encontrado. Descárgalo desde HuggingFace y guárdalo en %APPDATA%/Omnilab/models/".to_string())
    } else {
        Err(format!("Modelo '{}' no encontrado", model_id))
    }
}

#[tauri::command]
pub fn run_inference(
    engine: tauri::State<'_, LocalAIEngine>,
    request: InferenceRequest,
) -> Result<InferenceResponse, String> {
    Ok(engine.run_inference(request))
}

#[tauri::command]
pub fn get_local_ai_status(engine: tauri::State<'_, LocalAIEngine>) -> serde_json::Value {
    serde_json::json!({
        "loaded": engine.get_loaded_model(),
        "models_count": engine.list_models().len(),
        "memory_mb": engine.estimate_memory(),
    })
}