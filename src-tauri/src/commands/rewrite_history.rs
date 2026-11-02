//! The local append-only journal is synced before requests, previews and decisions.
use super::rewrite_journal_store;
use serde_json::Value;
use tauri::{AppHandle, Manager};

#[tauri::command]
pub async fn rewrite_history_list(app: AppHandle) -> Result<Vec<Value>, String> {
    let path = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("rewrite-history.json");
    tokio::task::spawn_blocking(move || rewrite_journal_store::list(&path))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn rewrite_history_append(app: AppHandle, event: Value) -> Result<(), String> {
    let path = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("rewrite-history.json");
    tokio::task::spawn_blocking(move || rewrite_journal_store::append(&path, event))
        .await
        .map_err(|e| e.to_string())?
}
