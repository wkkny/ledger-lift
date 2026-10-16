//! Everything that talks to, or manages, the Ollama service on the owner's computer.

use std::{
    path::PathBuf,
    process::{Child, Command, Stdio},
    sync::atomic::{AtomicBool, Ordering},
    time::Duration,
};

use futures_util::StreamExt;
use reqwest::{Client, Response};
use serde::Serialize;
use serde_json::{Value, json};

use crate::entries::{Entry, EntryStream};

const BASE_URL: &str = "http://127.0.0.1:11434";
/// The plain `-instruct` tag. The default `qwen3-vl:2b` tag reasons for 30-100 s before answering.
pub const DEFAULT_MODEL: &str = "qwen3-vl:2b-instruct";
/// Ollama's default 4096-token context is too small for a ledger photo plus its JSON answer.
const NUM_CTX: u32 = 8192;
/// Keeps the model loaded between pages so only the first page after a break pays the load time.
const KEEP_ALIVE: &str = "30m";
const MAX_IMAGE_BASE64_BYTES: usize = 16 * 1024 * 1024;

const SYSTEM_PROMPT: &str = "You extract handwritten sales ledger rows from a single page image.
Return only a JSON object with an `entries` array. Each entry must have `date`, `item`,
`quantity`, `amount`, and `uncertain_fields`. Use strings for values exactly as written;
use an empty string when a value is missing or cannot be read. `uncertain_fields` is an
array containing any of date, item, quantity, amount that you could not read confidently.
Do not invent values, calculate totals, normalize dates, or merge separate rows. Ignore
headers, totals, and notes that are not individual sales. Keep entries in page order.";

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub running: bool,
    pub binary_found: bool,
    pub models: Vec<String>,
    pub model_ready: bool,
}

#[derive(Debug, Serialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PullProgress {
    pub status: String,
    pub completed: Option<u64>,
    pub total: Option<u64>,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ExtractOutcome {
    pub count: usize,
    pub cancelled: bool,
}

fn url(path: &str) -> String {
    format!("{BASE_URL}{path}")
}

fn unreachable(error: reqwest::Error) -> String {
    format!("Couldn't reach Ollama. Make sure it is running and try again. ({error})")
}

async fn api_error(response: Response) -> String {
    let status = response.status();
    let body = response.text().await.unwrap_or_default();
    let detail = serde_json::from_str::<Value>(&body)
        .ok()
        .and_then(|value| value.get("error").and_then(Value::as_str).map(str::to_string))
        .unwrap_or(body);
    format!("Ollama returned an error ({status}). {}", detail.chars().take(300).collect::<String>())
}

/// Splits a byte stream of newline-delimited JSON into complete lines.
#[derive(Default)]
pub struct LineBuffer {
    pending: Vec<u8>,
}

impl LineBuffer {
    pub fn push(&mut self, bytes: &[u8]) -> Vec<String> {
        self.pending.extend_from_slice(bytes);
        let mut lines = Vec::new();
        while let Some(position) = self.pending.iter().position(|byte| *byte == b'\n') {
            let line: Vec<u8> = self.pending.drain(..=position).collect();
            let text = String::from_utf8_lossy(&line[..line.len() - 1]).trim().to_string();
            if !text.is_empty() {
                lines.push(text);
            }
        }
        lines
    }

    /// The final line, if the stream ended without a trailing newline.
    pub fn finish(&mut self) -> Option<String> {
        let text = String::from_utf8_lossy(&std::mem::take(&mut self.pending)).trim().to_string();
        (!text.is_empty()).then_some(text)
    }
}

/// The text the model added in one streamed chat line, or the error Ollama reported instead.
pub fn parse_chat_line(line: &str) -> Result<String, String> {
    let value: Value = serde_json::from_str(line).map_err(|error| format!("Unreadable reply from Ollama: {error}"))?;
    if let Some(error) = value.get("error").and_then(Value::as_str) {
        return Err(error.to_string());
    }
    Ok(value.pointer("/message/content").and_then(Value::as_str).unwrap_or("").to_string())
}

pub fn parse_pull_line(line: &str) -> Result<PullProgress, String> {
    let value: Value = serde_json::from_str(line).map_err(|error| format!("Unreadable reply from Ollama: {error}"))?;
    if let Some(error) = value.get("error").and_then(Value::as_str) {
        return Err(error.to_string());
    }
    Ok(PullProgress {
        status: value.get("status").and_then(Value::as_str).unwrap_or("").to_string(),
        completed: value.get("completed").and_then(Value::as_u64),
        total: value.get("total").and_then(Value::as_u64),
    })
}

pub fn chat_request(model: &str, image_base64: &str) -> Value {
    json!({
        "model": model,
        "stream": true,
        "format": "json",
        "keep_alive": KEEP_ALIVE,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": "Extract the sales entries from this ledger page.", "images": [image_base64]},
        ],
        "options": {"temperature": 0, "num_ctx": NUM_CTX},
    })
}

pub fn model_installed(models: &[String], model: &str) -> bool {
    let wanted = if model.contains(':') { model.to_string() } else { format!("{model}:latest") };
    models.contains(&wanted)
}

fn candidate_binaries() -> Vec<PathBuf> {
    let name = if cfg!(windows) { "ollama.exe" } else { "ollama" };
    let mut paths: Vec<PathBuf> = std::env::var_os("PATH")
        .map(|path| std::env::split_paths(&path).map(|dir| dir.join(name)).collect())
        .unwrap_or_default();
    // A desktop app launched from the Dock or Start menu gets a minimal PATH, so also check the usual installs.
    paths.extend(
        [
            "/opt/homebrew/bin/ollama",
            "/usr/local/bin/ollama",
            "/Applications/Ollama.app/Contents/Resources/ollama",
        ]
        .map(PathBuf::from),
    );
    if let Some(local) = std::env::var_os("LOCALAPPDATA") {
        paths.push(PathBuf::from(local).join("Programs").join("Ollama").join("ollama.exe"));
    }
    paths
}

pub fn find_binary() -> Option<PathBuf> {
    candidate_binaries().into_iter().find(|path| path.is_file())
}

pub async fn is_running(client: &Client) -> bool {
    client
        .get(url("/api/version"))
        .timeout(Duration::from_secs(2))
        .send()
        .await
        .is_ok_and(|response| response.status().is_success())
}

pub async fn status(client: &Client, model: &str) -> Status {
    let binary_found = find_binary().is_some();
    let tags = client.get(url("/api/tags")).timeout(Duration::from_secs(2)).send().await;
    let Ok(response) = tags.and_then(Response::error_for_status) else {
        return Status { running: false, binary_found, models: vec![], model_ready: false };
    };
    let models: Vec<String> = response
        .json::<Value>()
        .await
        .ok()
        .and_then(|value| value.get("models").and_then(Value::as_array).cloned())
        .unwrap_or_default()
        .iter()
        .filter_map(|entry| entry.get("name").and_then(Value::as_str).map(str::to_string))
        .collect();
    let model_ready = model_installed(&models, model);
    Status { running: true, binary_found, models, model_ready }
}

/// Starts `ollama serve` and waits until it answers. The caller keeps the returned process so it can
/// be stopped when the app closes.
pub async fn start(client: &Client) -> Result<Child, String> {
    let binary = find_binary().ok_or("Ollama is not installed on this computer.")?;
    let mut command = Command::new(binary);
    command.arg("serve").stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    let mut child = command.spawn().map_err(|error| format!("Couldn't start Ollama: {error}"))?;
    for _ in 0..80 {
        if is_running(client).await {
            return Ok(child);
        }
        if child.try_wait().ok().flatten().is_some() {
            return Err("Ollama stopped right after starting. Try opening the Ollama app once, then retry.".into());
        }
        tokio::time::sleep(Duration::from_millis(250)).await;
    }
    let _ = child.kill();
    Err("Ollama did not start within 20 seconds.".into())
}

pub async fn pull(client: &Client, model: &str, mut on_progress: impl FnMut(PullProgress)) -> Result<(), String> {
    let response = client
        .post(url("/api/pull"))
        .json(&json!({"model": model, "stream": true}))
        .send()
        .await
        .map_err(unreachable)?;
    if !response.status().is_success() {
        return Err(api_error(response).await);
    }
    let mut stream = response.bytes_stream();
    let mut lines = LineBuffer::default();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|error| format!("The download was interrupted. ({error})"))?;
        for line in lines.push(&chunk) {
            on_progress(parse_pull_line(&line)?);
        }
    }
    if let Some(line) = lines.finish() {
        on_progress(parse_pull_line(&line)?);
    }
    Ok(())
}

/// Loads the model into memory ahead of the first page. Failures are not worth reporting.
pub async fn warm(client: &Client, model: &str) {
    let _ = client
        .post(url("/api/generate"))
        .json(&json!({"model": model, "keep_alive": KEEP_ALIVE}))
        .timeout(Duration::from_secs(120))
        .send()
        .await;
}

/// Streams one extraction, calling `on_entry` as each row is finished.
pub async fn extract(
    client: &Client,
    model: &str,
    image_base64: &str,
    cancel: &AtomicBool,
    mut on_entry: impl FnMut(Entry),
) -> Result<ExtractOutcome, String> {
    if image_base64.is_empty() || image_base64.len() > MAX_IMAGE_BASE64_BYTES {
        return Err("The image is empty or too large.".into());
    }
    let model = model.trim();
    if model.is_empty() || model.len() > 120 {
        return Err("Enter a valid Ollama model name.".into());
    }
    let response = client
        .post(url("/api/chat"))
        .json(&chat_request(model, image_base64))
        .send()
        .await
        .map_err(unreachable)?;
    if !response.status().is_success() {
        return Err(api_error(response).await);
    }

    let mut stream = response.bytes_stream();
    let mut lines = LineBuffer::default();
    let mut entries = EntryStream::default();
    let mut count = 0;
    let mut handle_line = |line: String| -> Result<(), String> {
        for entry in entries.push(&parse_chat_line(&line)?) {
            count += 1;
            on_entry(entry);
        }
        Ok(())
    };
    while let Some(chunk) = stream.next().await {
        if cancel.load(Ordering::Relaxed) {
            return Ok(ExtractOutcome { count, cancelled: true });
        }
        let chunk = chunk.map_err(|error| format!("The connection to Ollama was interrupted. ({error})"))?;
        for line in lines.push(&chunk) {
            handle_line(line)?;
        }
    }
    if let Some(line) = lines.finish() {
        handle_line(line)?;
    }
    Ok(ExtractOutcome { count, cancelled: false })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn chat_request_streams_and_keeps_the_context_and_warmth_settings() {
        let request = chat_request("m", "AAAA");
        assert_eq!(request["stream"], true);
        assert_eq!(request["format"], "json");
        assert_eq!(request["keep_alive"], KEEP_ALIVE);
        // A ledger photo plus its answer overflows Ollama's default 4096-token context.
        assert!(request["options"]["num_ctx"].as_u64().unwrap() > 4096);
        assert_eq!(request["messages"][1]["images"][0], "AAAA");
    }

    #[test]
    fn the_default_model_does_not_reason_before_answering() {
        assert!(DEFAULT_MODEL.ends_with("-instruct"));
    }

    #[test]
    fn line_buffer_joins_lines_split_across_chunks() {
        let mut buffer = LineBuffer::default();
        assert!(buffer.push(b"{\"a\":").is_empty());
        assert_eq!(buffer.push(b"1}\n{\"b\":2}\n{\"c\""), vec!["{\"a\":1}", "{\"b\":2}"]);
        assert_eq!(buffer.finish().as_deref(), Some("{\"c\""));
        assert_eq!(buffer.finish(), None);
    }

    #[test]
    fn line_buffer_keeps_multibyte_characters_split_across_chunks() {
        let bytes = "{\"item\":\"café\"}\n".as_bytes();
        let split = bytes.iter().position(|byte| *byte == 0xC3).unwrap() + 1;
        let mut buffer = LineBuffer::default();
        assert!(buffer.push(&bytes[..split]).is_empty());
        assert_eq!(buffer.push(&bytes[split..]), vec!["{\"item\":\"café\"}"]);
    }

    #[test]
    fn chat_lines_yield_their_text_or_the_reported_error() {
        assert_eq!(parse_chat_line(r#"{"message":{"content":"hi"},"done":false}"#).unwrap(), "hi");
        assert_eq!(parse_chat_line(r#"{"message":{"thinking":"hm"},"done":false}"#).unwrap(), "");
        assert_eq!(
            parse_chat_line(r#"{"error":"request exceeds the available context size"}"#).unwrap_err(),
            "request exceeds the available context size"
        );
        assert!(parse_chat_line("not json").is_err());
    }

    #[test]
    fn pull_lines_report_progress_and_errors() {
        let progress = parse_pull_line(r#"{"status":"pulling abc","total":100,"completed":40}"#).unwrap();
        assert_eq!(progress, PullProgress { status: "pulling abc".into(), completed: Some(40), total: Some(100) });
        assert_eq!(parse_pull_line(r#"{"status":"success"}"#).unwrap().completed, None);
        assert_eq!(parse_pull_line(r#"{"error":"pull model manifest: file does not exist"}"#).unwrap_err(), "pull model manifest: file does not exist");
    }

    #[test]
    fn untagged_model_names_match_the_latest_tag() {
        let models = vec!["llama3:latest".to_string(), "qwen3-vl:2b-instruct".to_string()];
        assert!(model_installed(&models, "llama3"));
        assert!(model_installed(&models, "qwen3-vl:2b-instruct"));
        assert!(!model_installed(&models, "qwen3-vl:2b"));
        assert!(!model_installed(&models, "qwen3-vl"));
    }

    /// Run with: LEDGER_TEST_IMAGE=/path/to/page.jpg cargo test -- --ignored live
    #[tokio::test]
    #[ignore = "needs a running Ollama, the default model, and LEDGER_TEST_IMAGE"]
    async fn live_extraction_streams_rows_before_the_page_is_finished() {
        use base64::Engine;
        use std::time::Instant;

        let path = std::env::var("LEDGER_TEST_IMAGE").expect("set LEDGER_TEST_IMAGE to a ledger photo");
        let image = base64::engine::general_purpose::STANDARD.encode(std::fs::read(path).unwrap());
        let client = Client::new();
        let started = Instant::now();
        let mut arrivals = Vec::new();
        let outcome = extract(&client, DEFAULT_MODEL, &image, &AtomicBool::new(false), |entry| {
            arrivals.push((started.elapsed(), entry));
        })
        .await
        .unwrap();
        let total = started.elapsed();

        println!("{} rows in {:.1}s; first row at {:.1}s", outcome.count, total.as_secs_f32(), arrivals[0].0.as_secs_f32());
        assert!(!outcome.cancelled);
        assert!(outcome.count >= 10, "expected most of the page, got {}", outcome.count);
        assert!(arrivals[0].0 < total.mul_f32(0.8), "first row should arrive well before the end");
    }
}
