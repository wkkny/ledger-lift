mod csv;
mod entries;
mod ollama;

use std::{
    process::Child,
    sync::{
        Mutex,
        atomic::{AtomicBool, Ordering},
    },
    time::Duration,
};

use entries::Entry;
use ollama::{ExtractOutcome, PullProgress, Status};
use reqwest::Client;
use tauri::{AppHandle, Manager, RunEvent, State, ipc::Channel};
use tauri_plugin_dialog::DialogExt;

struct AppState {
    client: Client,
    /// The Ollama process this app started, if any. Stopped when the app closes.
    ollama: Mutex<Option<Child>>,
    cancel: AtomicBool,
}

#[tauri::command]
fn default_model() -> &'static str {
    ollama::DEFAULT_MODEL
}

#[tauri::command]
async fn get_status(state: State<'_, AppState>, model: String) -> Result<Status, String> {
    Ok(ollama::status(&state.client, &model).await)
}

#[tauri::command]
async fn start_ollama(state: State<'_, AppState>) -> Result<(), String> {
    if ollama::is_running(&state.client).await {
        return Ok(());
    }
    let child = ollama::start(&state.client).await?;
    *state.ollama.lock().map_err(|_| "Internal error.")? = Some(child);
    Ok(())
}

#[tauri::command]
async fn pull_model(state: State<'_, AppState>, model: String, on_progress: Channel<PullProgress>) -> Result<(), String> {
    ollama::pull(&state.client, model.trim(), |progress| {
        let _ = on_progress.send(progress);
    })
    .await
}

#[tauri::command]
async fn warm_model(state: State<'_, AppState>, model: String) -> Result<(), String> {
    ollama::warm(&state.client, model.trim()).await;
    Ok(())
}

#[tauri::command]
async fn extract_entries(
    state: State<'_, AppState>,
    image: String,
    model: String,
    on_entry: Channel<Entry>,
) -> Result<ExtractOutcome, String> {
    state.cancel.store(false, Ordering::Relaxed);
    let outcome = ollama::extract(&state.client, &model, &image, &state.cancel, |entry| {
        let _ = on_entry.send(entry);
    })
    .await?;
    if outcome.count == 0 && !outcome.cancelled {
        return Err("No sales rows found. Try a closer, brighter photo.".into());
    }
    Ok(outcome)
}

#[tauri::command]
fn cancel_extract(state: State<'_, AppState>) {
    state.cancel.store(true, Ordering::Relaxed);
}

/// Asks where to save, then writes the CSV. Returns the saved path, or `None` if the owner cancelled.
#[tauri::command]
async fn save_csv(app: AppHandle, entries: Vec<Entry>, suggested_name: String) -> Result<Option<String>, String> {
    let (sender, receiver) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .set_file_name(suggested_name)
        .add_filter("CSV", &["csv"])
        .save_file(move |path| {
            let _ = sender.send(path);
        });
    let Some(path) = receiver.await.map_err(|_| "The save dialog closed unexpectedly.")? else {
        return Ok(None);
    };
    let path = path.into_path().map_err(|error| error.to_string())?;
    std::fs::write(&path, csv::to_csv(&entries)).map_err(|error| format!("Couldn't save the file: {error}"))?;
    Ok(Some(path.display().to_string()))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let client = Client::builder()
        .connect_timeout(Duration::from_secs(3))
        .build()
        .expect("failed to build the HTTP client");
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState { client, ollama: Mutex::new(None), cancel: AtomicBool::new(false) })
        .invoke_handler(tauri::generate_handler![
            default_model,
            get_status,
            start_ollama,
            pull_model,
            warm_model,
            extract_entries,
            cancel_extract,
            save_csv,
        ])
        .build(tauri::generate_context!())
        .expect("error while building the app")
        .run(|app, event| {
            if let RunEvent::Exit = event
                && let Ok(mut child) = app.state::<AppState>().ollama.lock()
                && let Some(mut process) = child.take()
            {
                let _ = process.kill();
            }
        });
}
