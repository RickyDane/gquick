use base64::Engine;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{TrayIconBuilder, TrayIconEvent},
    Emitter, Manager, Runtime,
};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_global_shortcut::{
    Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState as GsShortcutState,
};
use tauri_plugin_opener::OpenerExt;
#[cfg(target_os = "macos")]
use tesseract::Tesseract;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn create_note(
    state: tauri::State<'_, DbState>,
    title: String,
    content: String,
) -> Result<Note, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO notes (title, content) VALUES (?1, ?2)",
        rusqlite::params![&title, &content],
    )
    .map_err(|e| e.to_string())?;

    let id = conn.last_insert_rowid();
    let note = conn
        .query_row(
            "SELECT id, title, content, created_at, updated_at FROM notes WHERE id = ?1",
            rusqlite::params![id],
            |row| {
                Ok(Note {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    content: row.get(2)?,
                    created_at: row.get(3)?,
                    updated_at: row.get(4)?,
                })
            },
        )
        .map_err(|e| e.to_string())?;

    Ok(note)
}

#[tauri::command]
fn get_notes(state: tauri::State<'_, DbState>) -> Result<Vec<Note>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, title, content, created_at, updated_at FROM notes ORDER BY updated_at DESC",
        )
        .map_err(|e| e.to_string())?;

    let notes = stmt
        .query_map([], |row| {
            Ok(Note {
                id: row.get(0)?,
                title: row.get(1)?,
                content: row.get(2)?,
                created_at: row.get(3)?,
                updated_at: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(notes)
}

#[tauri::command]
fn update_note(
    state: tauri::State<'_, DbState>,
    id: i64,
    title: String,
    content: String,
) -> Result<Note, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE notes SET title = ?1, content = ?2, updated_at = CURRENT_TIMESTAMP WHERE id = ?3",
        rusqlite::params![&title, &content, id],
    )
    .map_err(|e| e.to_string())?;

    let note = conn
        .query_row(
            "SELECT id, title, content, created_at, updated_at FROM notes WHERE id = ?1",
            rusqlite::params![id],
            |row| {
                Ok(Note {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    content: row.get(2)?,
                    created_at: row.get(3)?,
                    updated_at: row.get(4)?,
                })
            },
        )
        .map_err(|e| e.to_string())?;

    Ok(note)
}

#[tauri::command]
fn delete_note(state: tauri::State<'_, DbState>, id: i64) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM notes WHERE id = ?1", rusqlite::params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn search_notes(state: tauri::State<'_, DbState>, query: String) -> Result<Vec<Note>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    // Escape SQL LIKE wildcards (% and _) so they are treated as literals
    let escaped_query = query.replace("%", "\\%").replace("_", "\\_");
    let search_pattern = format!("%{}%", escaped_query);
    let mut stmt = conn.prepare(
        "SELECT id, title, content, created_at, updated_at FROM notes WHERE title LIKE ?1 OR content LIKE ?1 ORDER BY updated_at DESC"
    ).map_err(|e| e.to_string())?;

    let notes = stmt
        .query_map(rusqlite::params![&search_pattern], |row| {
            Ok(Note {
                id: row.get(0)?,
                title: row.get(1)?,
                content: row.get(2)?,
                created_at: row.get(3)?,
                updated_at: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(notes)
}

#[tauri::command]
fn get_note_by_id(state: tauri::State<'_, DbState>, id: i64) -> Result<Option<Note>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, title, content, created_at, updated_at FROM notes WHERE id = ?1")
        .map_err(|e| e.to_string())?;

    let mut rows = stmt
        .query(rusqlite::params![id])
        .map_err(|e| e.to_string())?;
    if let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let note = Note {
            id: row.get(0).map_err(|e| e.to_string())?,
            title: row.get(1).map_err(|e| e.to_string())?,
            content: row.get(2).map_err(|e| e.to_string())?,
            created_at: row.get(3).map_err(|e| e.to_string())?,
            updated_at: row.get(4).map_err(|e| e.to_string())?,
        };
        Ok(Some(note))
    } else {
        Ok(None)
    }
}

#[derive(serde::Serialize)]
struct AppInfo {
    name: String,
    path: String,
    icon: Option<String>,
}

#[derive(serde::Serialize)]
struct ContainerInfo {
    id: String,
    image: String,
    status: String,
    names: String,
    ports: String,
    state: String,
    created_at: String,
}

#[derive(serde::Serialize)]
struct ImageInfo {
    id: String,
    repository: String,
    tag: String,
    size: String,
    created_since: String,
}

#[derive(serde::Serialize)]
struct DockerStatus {
    cli_installed: bool,
    daemon_running: bool,
    docker_version: Option<String>,
    compose_available: bool,
    compose_version: Option<String>,
    error_code: Option<String>,
    error_message: Option<String>,
}

#[derive(serde::Serialize)]
struct DockerCommandResult {
    stdout: String,
    stderr: String,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct DockerHubRepository {
    name: String,
    namespace: String,
    repository_name: String,
    description: String,
    star_count: u64,
    pull_count: u64,
    is_official: bool,
    is_automated: bool,
    last_updated: Option<String>,
}

#[derive(serde::Deserialize)]
struct DockerHubApiResponse {
    results: Option<Vec<DockerHubApiRepository>>,
}

#[derive(serde::Deserialize)]
struct DockerHubApiRepository {
    repo_name: Option<String>,
    name: Option<String>,
    namespace: Option<String>,
    short_description: Option<String>,
    star_count: Option<u64>,
    pull_count: Option<u64>,
    is_official: Option<bool>,
    is_automated: Option<bool>,
    last_updated: Option<String>,
}

#[derive(serde::Deserialize)]
struct PortMapping {
    host: String,
    container: String,
    protocol: Option<String>,
}

#[derive(serde::Deserialize)]
struct EnvVar {
    key: String,
    value: String,
}

#[derive(serde::Deserialize)]
struct VolumeMapping {
    host: String,
    container: String,
    readonly: Option<bool>,
}

#[derive(serde::Deserialize)]
struct RunContainerOptions {
    image: String,
    name: Option<String>,
    detached: bool,
    interactive: bool,
    ports: Vec<PortMapping>,
    env: Vec<EnvVar>,
    volumes: Vec<VolumeMapping>,
    command: Vec<String>,
    remove_when_exit: Option<bool>,
    extra_args: Vec<String>,
}

#[derive(serde::Serialize, Clone)]
struct FileInfo {
    name: String,
    path: String,
    is_dir: bool,
}

#[derive(serde::Serialize, Clone)]
struct SmartFileInfo {
    name: String,
    path: String,
    is_dir: bool,
    created: Option<String>,
    modified: Option<String>,
    size: u64,
    content_preview: Option<String>,
    full_content: Option<String>,
}

use std::collections::HashMap;
use std::io::{self, Read};
#[cfg(unix)]
use std::os::unix::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

async fn run_blocking<F, R>(operation: F) -> Result<R, String>
where
    F: FnOnce() -> R + Send + 'static,
    R: Send + 'static,
{
    tauri::async_runtime::spawn_blocking(operation)
        .await
        .map_err(|e| docker_err("COMMAND_FAILED", format!("Background task failed: {e}")))
}

struct ShortcutState {
    main_shortcut: Mutex<String>,
    screenshot_shortcut: Mutex<String>,
    ocr_shortcut: Mutex<String>,
}

struct DialogState {
    is_open: std::sync::Mutex<bool>,
}

struct TerminalState {
    inline_processes: Arc<Mutex<HashMap<String, Arc<Mutex<Child>>>>>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct TerminalCommandResult {
    stdout: String,
    stderr: String,
    exit_code: Option<i32>,
    canceled: bool,
}

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct TerminalCommandOutputEvent {
    id: String,
    stream: String,
    chunk: String,
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
struct Note {
    id: i64,
    title: String,
    content: String,
    created_at: String,
    updated_at: String,
}

struct DbState {
    conn: Mutex<rusqlite::Connection>,
}

struct FileIndex {
    files: Vec<FileInfo>,
    last_updated: Option<Instant>,
}

static FILE_INDEX: Mutex<Option<Arc<Mutex<FileIndex>>>> = Mutex::new(None);

fn get_or_create_index() -> Arc<Mutex<FileIndex>> {
    let mut global = FILE_INDEX.lock().unwrap();
    if let Some(index) = global.as_ref() {
        return index.clone();
    }
    let index = Arc::new(Mutex::new(FileIndex {
        files: Vec::new(),
        last_updated: None,
    }));
    *global = Some(index.clone());
    index
}

fn should_refresh_index(index: &FileIndex) -> bool {
    match index.last_updated {
        None => true,
        Some(last) => Instant::now().duration_since(last) > Duration::from_secs(300), // 5 min cache
    }
}

fn system_time_to_iso(time: std::time::SystemTime) -> Option<String> {
    let datetime: chrono::DateTime<chrono::Local> = time.into();
    Some(datetime.to_rfc3339())
}

fn is_text_file(path: &std::path::Path) -> bool {
    let text_extensions: std::collections::HashSet<&str> = [
        "txt",
        "md",
        "rs",
        "ts",
        "tsx",
        "js",
        "jsx",
        "json",
        "yaml",
        "yml",
        "toml",
        "html",
        "css",
        "scss",
        "sass",
        "py",
        "go",
        "java",
        "kt",
        "swift",
        "c",
        "cpp",
        "h",
        "hpp",
        "sh",
        "bash",
        "zsh",
        "fish",
        "sql",
        "xml",
        "csv",
        "log",
        "ini",
        "cfg",
        "conf",
        "properties",
        "gradle",
        "dockerfile",
        "rb",
        "php",
        "lua",
        "r",
        "pl",
        "pm",
        "t",
        "Makefile",
        "makefile",
    ]
    .iter()
    .cloned()
    .collect();

    path.extension()
        .and_then(|e| e.to_str())
        .map(|ext| text_extensions.contains(ext.to_lowercase().as_str()))
        .unwrap_or(false)
}

fn read_full_content(path: &std::path::Path, max_size: usize) -> Option<String> {
    if !is_text_file(path) {
        return None;
    }

    // First check file size
    let metadata = match std::fs::metadata(path) {
        Ok(meta) => meta,
        Err(_) => return None,
    };

    let file_size = metadata.len() as usize;
    if file_size > max_size {
        // For large files, just read the beginning and end
        return read_large_file_content(path, max_size);
    }

    match std::fs::read_to_string(path) {
        Ok(content) => {
            // Verify it's actually text by checking for null bytes
            if content.bytes().any(|b| b == 0) {
                return None;
            }
            Some(content)
        }
        Err(_) => None,
    }
}

fn read_large_file_content(path: &std::path::Path, max_size: usize) -> Option<String> {
    use std::io::{BufRead, BufReader};

    let file = match std::fs::File::open(path) {
        Ok(f) => f,
        Err(_) => return None,
    };

    let reader = BufReader::new(file);
    let mut content = String::new();
    let mut byte_count = 0;

    for line in reader.lines() {
        if let Ok(line) = line {
            byte_count += line.len() + 1; // +1 for newline
            if byte_count > max_size {
                content.push_str("\n... [file truncated, content too large] ...");
                break;
            }
            content.push_str(&line);
            content.push('\n');
        }
    }

    if content.is_empty() {
        None
    } else {
        Some(content)
    }
}

fn extract_meaningful_keywords(query: &str) -> Vec<String> {
    let stop_words: std::collections::HashSet<&str> = [
        "find",
        "my",
        "me",
        "the",
        "a",
        "an",
        "and",
        "or",
        "but",
        "in",
        "on",
        "at",
        "to",
        "for",
        "of",
        "with",
        "by",
        "from",
        "up",
        "about",
        "into",
        "through",
        "during",
        "before",
        "after",
        "above",
        "below",
        "between",
        "among",
        "within",
        "without",
        "against",
        "under",
        "over",
        "search",
        "looking",
        "look",
        "show",
        "get",
        "give",
        "list",
        "all",
        "some",
        "any",
        "this",
        "that",
        "these",
        "those",
        "i",
        "you",
        "he",
        "she",
        "it",
        "we",
        "they",
        "what",
        "which",
        "who",
        "when",
        "where",
        "why",
        "how",
        "is",
        "are",
        "was",
        "were",
        "be",
        "been",
        "being",
        "have",
        "has",
        "had",
        "do",
        "does",
        "did",
        "will",
        "would",
        "could",
        "should",
        "may",
        "might",
        "must",
        "can",
        "need",
        "shall",
        "file",
        "files",
        "folder",
        "folders",
        "document",
        "documents",
        "recent",
        "last",
        "content",
        "contains",
        "text",
        "about",
        "related",
    ]
    .iter()
    .cloned()
    .collect();

    query
        .to_lowercase()
        .split_whitespace()
        .filter(|word| {
            let w = word.trim_matches(|c: char| !c.is_alphanumeric());
            w.len() > 1 && !stop_words.contains(w)
        })
        .map(|s| s.to_string())
        .collect()
}

fn score_file_relevance(name_lower: &str, path_lower: &str, keywords: &[String]) -> Option<i32> {
    if keywords.is_empty() {
        // If no meaningful keywords, fall back to checking if the full query matches
        return None;
    }

    let mut score = 0i32;
    let mut matched_keywords = 0;

    for keyword in keywords {
        let kw_lower = keyword.to_lowercase();

        // Name exact match
        if name_lower == kw_lower {
            score += 500;
            matched_keywords += 1;
        }
        // Name contains keyword
        else if name_lower.contains(&kw_lower) {
            score += 200;
            matched_keywords += 1;
        }
        // Path contains keyword
        else if path_lower.contains(&kw_lower) {
            score += 50;
            matched_keywords += 1;
        }
    }

    // Bonus for matching more keywords
    if matched_keywords > 1 {
        score += matched_keywords * 25;
    }

    // Boost if ALL keywords matched somewhere
    if matched_keywords == keywords.len() as i32 {
        score += 300;
    }

    // Require at least one keyword to match
    if matched_keywords == 0 {
        return None;
    }

    Some(score)
}

fn parse_time_filter(query: &str) -> Option<u64> {
    let query_lower = query.to_lowercase();
    let now = std::time::SystemTime::now();
    let now_secs = now.duration_since(std::time::UNIX_EPOCH).ok()?.as_secs();

    if query_lower.contains("today") || query_lower.contains("yesterday") {
        Some(now_secs - 24 * 60 * 60) // Last 24 hours
    } else if query_lower.contains("last week") {
        Some(now_secs - 7 * 24 * 60 * 60) // Last 7 days
    } else if query_lower.contains("last month") {
        Some(now_secs - 30 * 24 * 60 * 60) // Last 30 days
    } else if query_lower.contains("recent") {
        Some(now_secs - 7 * 24 * 60 * 60) // Last 7 days for "recent"
    } else {
        None
    }
}

#[cfg(target_os = "macos")]
fn tesseract_data_path(app: &tauri::AppHandle) -> Option<String> {
    app.path()
        .resource_dir()
        .ok()
        .map(|dir| dir.join("tessdata"))
        .filter(|dir| dir.exists())
        .map(|dir| dir.to_string_lossy().to_string())
}

#[cfg(target_os = "macos")]
fn run_ocr(app: &tauri::AppHandle, path: &str) -> String {
    let data_path = tesseract_data_path(app);

    match Tesseract::new(data_path.as_deref(), Some("eng")) {
        Ok(tess) => match tess.set_image(path) {
            Ok(mut tess) => match tess.get_text() {
                Ok(text) => {
                    let trimmed = text.trim();
                    if trimmed.is_empty() {
                        "No text found in image".to_string()
                    } else {
                        trimmed.to_string()
                    }
                }
                Err(e) => {
                    eprintln!("OCR text extraction failed: {}", e);
                    "OCR unavailable: failed to extract text from image.".to_string()
                }
            },
            Err(e) => {
                eprintln!("Failed to load image for OCR: {}", e);
                "OCR unavailable: failed to load captured image.".to_string()
            }
        },
        Err(e) => {
            eprintln!("Tesseract initialization failed: {}", e);
            "OCR unavailable: Tesseract not installed or failed to initialize.".to_string()
        }
    }
}

fn build_file_index() -> Vec<FileInfo> {
    let mut files = Vec::with_capacity(10000);

    #[cfg(target_os = "windows")]
    let home = std::env::var("USERPROFILE").unwrap_or_else(|_| ".".to_string());
    #[cfg(not(target_os = "windows"))]
    let home = std::env::var("HOME").unwrap_or_else(|_| "/".to_string());

    let skip_dirs: std::collections::HashSet<&str> = [
        "node_modules",
        ".git",
        "target",
        "build",
        "dist",
        ".cache",
        "Caches",
        "Trash",
        ".Trash",
        "Library",
        ".npm",
        ".cargo",
        ".rustup",
        ".vscode",
        ".idea",
        "vendor",
        "bin",
        "obj",
        "out",
        "logs",
        // Windows-specific
        "AppData",
        "Application Data",
        "Cookies",
        "Recent",
        "SendTo",
        "Start Menu",
        "Templates",
        "NetHood",
        "PrintHood",
        "Local Settings",
        "My Documents",
        // Linux-specific
        "proc",
        "sys",
        "dev",
        "run",
        "snap",
        "flatpak",
    ]
    .iter()
    .cloned()
    .collect();

    let walker = walkdir::WalkDir::new(&home)
        .max_depth(6)
        .follow_links(false)
        .into_iter()
        .filter_entry(|e| {
            let name = e.file_name().to_string_lossy();
            !name.starts_with('.') && !skip_dirs.contains(name.as_ref())
        });

    for entry in walker {
        if let Ok(entry) = entry {
            let path = entry.path();
            let is_dir = entry.file_type().is_dir();

            if let Some(name) = path.file_name() {
                let name_str = name.to_string_lossy().to_string();
                let path_str = path.to_string_lossy().to_string();

                files.push(FileInfo {
                    name: name_str,
                    path: path_str,
                    is_dir,
                });

                if files.len() >= 50000 {
                    break;
                }
            }
        }
    }

    files
}

#[tauri::command]
fn search_files(query: String) -> Result<Vec<FileInfo>, String> {
    let index_arc = get_or_create_index();

    {
        let index = index_arc.lock().unwrap();
        if should_refresh_index(&index) {
            drop(index);
            let new_files = build_file_index();
            let mut index = index_arc.lock().unwrap();
            index.files = new_files;
            index.last_updated = Some(Instant::now());
        }
    }

    let index = index_arc.lock().unwrap();
    let query_lower = query.to_lowercase();
    let keywords = extract_meaningful_keywords(&query);

    let mut results: Vec<(FileInfo, i32)> = index
        .files
        .iter()
        .filter_map(|file| {
            let name_lower = file.name.to_lowercase();
            let path_lower = file.path.to_lowercase();

            let mut score: i32;

            // Try keyword-based matching first
            if let Some(keyword_score) = score_file_relevance(&name_lower, &path_lower, &keywords) {
                score = keyword_score;
            } else {
                // Fallback: full query string matching
                if name_lower == query_lower {
                    score = 1000;
                } else if name_lower.starts_with(&query_lower) {
                    score = 500;
                } else if name_lower.contains(&query_lower) {
                    score = 300;
                } else if path_lower.contains(&query_lower) {
                    score = 100;
                } else {
                    return None;
                }
            }

            // Boost directories slightly when searching
            if file.is_dir {
                score += 10;
            }

            Some((file.clone(), score))
        })
        .collect();

    // Sort by score descending
    results.sort_by(|a, b| b.1.cmp(&a.1));

    // Return top 50 results
    let final_results: Vec<FileInfo> = results.into_iter().take(50).map(|(file, _)| file).collect();

    Ok(final_results)
}

#[tauri::command]
fn smart_search_files(query: String) -> Result<Vec<SmartFileInfo>, String> {
    let index_arc = get_or_create_index();

    {
        let index = index_arc.lock().unwrap();
        if should_refresh_index(&index) {
            drop(index);
            let new_files = build_file_index();
            let mut index = index_arc.lock().unwrap();
            index.files = new_files;
            index.last_updated = Some(Instant::now());
        }
    }

    let index = index_arc.lock().unwrap();
    let query_lower = query.to_lowercase();
    let keywords = extract_meaningful_keywords(&query);

    // Check for time-based filtering
    let time_filter = parse_time_filter(&query);
    let _now = std::time::SystemTime::now();

    // Get candidate files (up to 100)
    let mut candidates: Vec<(FileInfo, i32)> = index
        .files
        .iter()
        .filter_map(|file| {
            let name_lower = file.name.to_lowercase();
            let path_lower = file.path.to_lowercase();

            let mut score: i32;

            // Try keyword-based matching first
            if let Some(keyword_score) = score_file_relevance(&name_lower, &path_lower, &keywords) {
                score = keyword_score;
            } else {
                // Fallback: full query string matching
                if name_lower == query_lower {
                    score = 1000;
                } else if name_lower.starts_with(&query_lower) {
                    score = 500;
                } else if name_lower.contains(&query_lower) {
                    score = 300;
                } else if path_lower.contains(&query_lower) {
                    score = 100;
                } else {
                    return None;
                }
            }

            // Boost directories slightly when searching
            if file.is_dir {
                score += 10;
            }

            Some((file.clone(), score))
        })
        .collect();

    // Sort by score descending
    candidates.sort_by(|a, b| b.1.cmp(&a.1));
    candidates.truncate(100);
    drop(index); // Release the lock before doing file I/O

    // Extract metadata for each candidate
    let mut results = Vec::with_capacity(candidates.len());

    for (file_info, _score) in candidates {
        let path = std::path::Path::new(&file_info.path);

        // Get file metadata
        let (created, modified, size) = match std::fs::metadata(path) {
            Ok(meta) => {
                let created = meta.created().ok().and_then(system_time_to_iso);
                let modified = meta.modified().ok().and_then(system_time_to_iso);
                let size = meta.len();
                (created, modified, size)
            }
            Err(_) => (None, None, 0),
        };

        // Apply time filter if present
        if let Some(min_timestamp) = time_filter {
            if let Some(ref modified_str) = modified {
                // Parse the ISO string back to check timestamp
                if let Ok(modified_time) = chrono::DateTime::parse_from_rfc3339(modified_str) {
                    let modified_timestamp = modified_time.timestamp() as u64;
                    if modified_timestamp < min_timestamp {
                        continue;
                    }
                }
            }
        }

        // Read full content for text files (up to 100KB)
        let (content_preview, full_content) = if !file_info.is_dir {
            let full = read_full_content(path, 100_000);
            let preview = full.as_ref().map(|c| {
                let mut s = c.replace('\n', " ").replace('\r', " ").replace('\t', " ");
                if s.len() > 3000 {
                    s.truncate(3000);
                    s.push_str("...");
                }
                s
            });
            (preview, full)
        } else {
            (None, None)
        };

        results.push(SmartFileInfo {
            name: file_info.name,
            path: file_info.path,
            is_dir: file_info.is_dir,
            created,
            modified,
            size,
            content_preview,
            full_content,
        });
    }

    Ok(results)
}

#[tauri::command]
fn open_file(app: tauri::AppHandle, path: String) -> Result<(), String> {
    app.opener()
        .open_path(&path, None::<&str>)
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn docker_status() -> DockerStatus {
    match run_blocking(docker_status_blocking).await {
        Ok(status) => status,
        Err(error) => DockerStatus {
            cli_installed: false,
            daemon_running: false,
            docker_version: None,
            compose_available: false,
            compose_version: None,
            error_code: Some("COMMAND_FAILED".into()),
            error_message: Some(error),
        },
    }
}

fn docker_status_blocking() -> DockerStatus {
    let version = Command::new("docker").arg("--version").output();
    let docker_version = match version {
        Ok(output) if output.status.success() => {
            Some(String::from_utf8_lossy(&output.stdout).trim().to_string())
        }
        Ok(output) => {
            return DockerStatus {
                cli_installed: false,
                daemon_running: false,
                docker_version: None,
                compose_available: false,
                compose_version: None,
                error_code: Some("CLI_MISSING".into()),
                error_message: Some(String::from_utf8_lossy(&output.stderr).trim().to_string()),
            }
        }
        Err(_) => {
            return DockerStatus {
                cli_installed: false,
                daemon_running: false,
                docker_version: None,
                compose_available: false,
                compose_version: None,
                error_code: Some("CLI_MISSING".into()),
                error_message: Some("Docker CLI is not installed or is not on PATH.".into()),
            }
        }
    };

    let info = Command::new("docker").arg("info").output();
    let (daemon_running, error_code, error_message) = match info {
        Ok(output) if output.status.success() => (true, None, None),
        Ok(output) => (
            false,
            Some("DAEMON_DOWN".into()),
            Some(String::from_utf8_lossy(&output.stderr).trim().to_string()),
        ),
        Err(e) => (false, Some("DAEMON_DOWN".into()), Some(e.to_string())),
    };

    let compose = Command::new("docker").args(["compose", "version"]).output();
    let (compose_available, compose_version) = match compose {
        Ok(output) if output.status.success() => (
            true,
            Some(String::from_utf8_lossy(&output.stdout).trim().to_string()),
        ),
        _ => (false, None),
    };

    DockerStatus {
        cli_installed: true,
        daemon_running,
        docker_version,
        compose_available,
        compose_version,
        error_code,
        error_message,
    }
}

#[tauri::command]
async fn search_docker_hub(
    query: String,
    page_size: Option<u32>,
) -> Result<Vec<DockerHubRepository>, String> {
    const MAX_PAGE_SIZE: u32 = 25;

    let normalized = query.trim();
    if normalized.is_empty() {
        return Err(docker_err(
            "VALIDATION_FAILED",
            "Docker Hub query cannot be empty.".into(),
        ));
    }

    let page_size = page_size.unwrap_or(10).clamp(1, MAX_PAGE_SIZE);
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .user_agent("GQuick/0.1 DockerHubSearch")
        .build()
        .map_err(|e| docker_err("DOCKER_HUB_CLIENT_FAILED", e.to_string()))?;

    let mut url = reqwest::Url::parse("https://hub.docker.com/v2/search/repositories/")
        .map_err(|e| docker_err("DOCKER_HUB_URL_FAILED", e.to_string()))?;
    url.query_pairs_mut()
        .append_pair("query", normalized)
        .append_pair("page_size", &page_size.to_string());

    let response = client
        .get(url)
        .send()
        .await
        .map_err(|e| docker_err("DOCKER_HUB_REQUEST_FAILED", e.to_string()))?;

    let status = response.status();
    if !status.is_success() {
        return Err(docker_err(
            "DOCKER_HUB_REQUEST_FAILED",
            format!("Docker Hub returned HTTP {}.", status.as_u16()),
        ));
    }

    let data = response
        .json::<DockerHubApiResponse>()
        .await
        .map_err(|e| docker_err("DOCKER_HUB_PARSE_FAILED", e.to_string()))?;

    Ok(data
        .results
        .unwrap_or_default()
        .into_iter()
        .map(normalize_docker_hub_repository)
        .collect())
}

fn normalize_docker_hub_repository(item: DockerHubApiRepository) -> DockerHubRepository {
    let repo_name = item.repo_name.or(item.name.clone()).unwrap_or_default();
    let (namespace, name) = match repo_name.split_once('/') {
        Some((namespace, name)) => (namespace.to_string(), name.to_string()),
        None => (
            item.namespace.unwrap_or_else(|| "library".into()),
            repo_name,
        ),
    };
    let repository_name = if namespace == "library" {
        name.clone()
    } else {
        format!("{}/{}", namespace, name)
    };

    DockerHubRepository {
        name,
        namespace,
        repository_name,
        description: item
            .short_description
            .unwrap_or_else(|| "No description available".into()),
        star_count: item.star_count.unwrap_or(0),
        pull_count: item.pull_count.unwrap_or(0),
        is_official: item.is_official.unwrap_or(false),
        is_automated: item.is_automated.unwrap_or(false),
        last_updated: item.last_updated,
    }
}

fn docker_err(code: &str, message: String) -> String {
    format!("{}: {}", code, message.trim())
}

fn validate_ref(value: &str, field: &str) -> Result<(), String> {
    if value.trim().is_empty() || value.contains('\0') || value.len() > 512 {
        return Err(docker_err(
            "VALIDATION_FAILED",
            format!("Invalid {}.", field),
        ));
    }
    Ok(())
}

fn require_confirmed(confirmed: Option<bool>, operation: &str) -> Result<(), String> {
    if confirmed.unwrap_or(false) {
        Ok(())
    } else {
        Err(docker_err(
            "CONFIRMATION_REQUIRED",
            format!("{} requires explicit backend confirmation.", operation),
        ))
    }
}

fn docker_timeout(args: &[String]) -> Duration {
    match args.first().map(String::as_str) {
        Some("pull") => Duration::from_secs(30 * 60),
        Some("logs") => Duration::from_secs(5 * 60),
        Some("system") | Some("container") | Some("image") | Some("volume")
            if args.get(1).map(String::as_str) == Some("prune") =>
        {
            Duration::from_secs(10 * 60)
        }
        Some("compose") => match args
            .iter()
            .map(String::as_str)
            .find(|arg| ["up", "pull", "logs"].contains(arg))
        {
            Some("up") | Some("pull") => Duration::from_secs(30 * 60),
            Some("logs") => Duration::from_secs(5 * 60),
            _ => Duration::from_secs(5 * 60),
        },
        _ => Duration::from_secs(120),
    }
}

fn read_pipe_stream(
    app: tauri::AppHandle,
    id: String,
    stream: &'static str,
    mut pipe: impl Read + Send + 'static,
) -> std::thread::JoinHandle<Result<String, String>> {
    std::thread::spawn(move || {
        let mut output = String::new();
        let mut buffer = [0_u8; 8192];

        loop {
            let bytes_read = pipe.read(&mut buffer).map_err(|e| e.to_string())?;
            if bytes_read == 0 {
                break;
            }

            let chunk = String::from_utf8_lossy(&buffer[..bytes_read]).to_string();
            output.push_str(&chunk);
            let _ = app.emit(
                "terminal-command-output",
                TerminalCommandOutputEvent {
                    id: id.clone(),
                    stream: stream.to_string(),
                    chunk,
                },
            );
        }

        Ok(output)
    })
}

fn read_pipe(
    mut pipe: impl Read + Send + 'static,
) -> std::thread::JoinHandle<Result<String, String>> {
    std::thread::spawn(move || {
        let mut output = String::new();
        pipe.read_to_string(&mut output)
            .map_err(|e| e.to_string())?;
        Ok(output)
    })
}

fn platform_shell_command(command: &str) -> Command {
    #[cfg(target_os = "windows")]
    {
        let mut cmd = Command::new("cmd");
        cmd.args(["/C", command]);
        cmd
    }
    #[cfg(not(target_os = "windows"))]
    {
        let mut cmd = Command::new("sh");
        cmd.args(["-lc", command]);
        cmd
    }
}

fn inline_shell_command(command: &str) -> Command {
    let mut cmd = platform_shell_command(command);
    #[cfg(unix)]
    unsafe {
        // Put the shell in its own session/process group so cancellation can
        // terminate commands it spawned instead of only killing the shell.
        cmd.pre_exec(|| {
            if libc::setsid() == -1 {
                Err(io::Error::last_os_error())
            } else {
                Ok(())
            }
        });
    }
    cmd
}

fn terminate_inline_child(child: &Arc<Mutex<Child>>) -> Result<(), String> {
    let mut locked = child.lock().map_err(|e| e.to_string())?;
    let pid = locked.id();

    #[cfg(unix)]
    {
        let pgid = format!("-{pid}");
        let _ = Command::new("kill").args(["-TERM", &pgid]).status();
        let started = Instant::now();
        loop {
            if locked.try_wait().map_err(|e| e.to_string())?.is_some() {
                return Ok(());
            }
            if started.elapsed() > Duration::from_millis(900) {
                break;
            }
            std::thread::sleep(Duration::from_millis(50));
        }
        let _ = Command::new("kill").args(["-KILL", &pgid]).status();
        let _ = locked.wait();
        return Ok(());
    }

    #[cfg(target_os = "windows")]
    {
        let _ = Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .status();
        let _ = locked.wait();
        return Ok(());
    }

    #[cfg(not(any(unix, target_os = "windows")))]
    {
        let _ = locked.kill();
        let _ = locked.wait();
        return Ok(());
    }
}

#[tauri::command]
fn open_terminal_command(command: String) -> Result<(), String> {
    let trimmed = command.trim();
    if trimmed.is_empty() {
        return Err("Command is empty".into());
    }

    #[cfg(target_os = "macos")]
    {
        // Use argv instead of interpolating the command into AppleScript source.
        // This preserves spaces, quotes, backslashes, and newlines without
        // relying on fragile AppleScript string escaping.
        let output = Command::new("osascript")
            .args([
                "-e",
                "on run argv",
                "-e",
                "set commandText to item 1 of argv",
                "-e",
                "tell application id \"com.apple.Terminal\"",
                "-e",
                "activate",
                "-e",
                "do script commandText",
                "-e",
                "end tell",
                "-e",
                "end run",
                "--",
                trimmed,
            ])
            .output()
            .map_err(|e| format!("Failed to open Terminal.app: {e}"))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
            let details = match (stderr.is_empty(), stdout.is_empty()) {
                (false, false) => format!("\nstderr: {stderr}\nstdout: {stdout}"),
                (false, true) => format!("\nstderr: {stderr}"),
                (true, false) => format!("\nstdout: {stdout}"),
                (true, true) => String::new(),
            };

            return Err(format!(
                "Terminal.app returned exit status {}{}",
                output
                    .status
                    .code()
                    .map_or_else(|| "unknown".into(), |code| code.to_string()),
                details
            ));
        }

        return Ok(());
    }

    #[cfg(target_os = "windows")]
    {
        Command::new("cmd")
            .args(["/C", "start", "", "cmd", "/K", trimmed])
            .spawn()
            .map_err(|e| format!("Failed to open terminal: {e}"))?;
        return Ok(());
    }

    #[cfg(target_os = "linux")]
    {
        let candidates = [
            "x-terminal-emulator",
            "gnome-terminal",
            "konsole",
            "xfce4-terminal",
            "mate-terminal",
            "alacritty",
            "kitty",
            "xterm",
        ];

        for terminal in candidates {
            let mut cmd = Command::new(terminal);
            match terminal {
                "gnome-terminal" | "xfce4-terminal" | "mate-terminal" => {
                    cmd.args(["--", "sh", "-lc", trimmed]);
                }
                "konsole" => {
                    cmd.args(["-e", "sh", "-lc", trimmed]);
                }
                _ => {
                    cmd.args(["-e", "sh", "-lc", trimmed]);
                }
            }
            if cmd.spawn().is_ok() {
                return Ok(());
            }
        }
        return Err("No supported terminal emulator found".into());
    }

    #[allow(unreachable_code)]
    Err("Opening terminal is not supported on this platform".into())
}

#[tauri::command]
async fn run_terminal_command_inline(
    app: tauri::AppHandle,
    state: tauri::State<'_, TerminalState>,
    id: String,
    command: String,
) -> Result<TerminalCommandResult, String> {
    let trimmed = command.trim().to_string();
    if trimmed.is_empty() {
        return Err("Command is empty".into());
    }

    let processes = Arc::clone(&state.inner().inline_processes);

    run_blocking({
        let app = app.clone();
        move || -> Result<TerminalCommandResult, String> {
            let child = {
                let mut map = processes.lock().map_err(|e| e.to_string())?;
                if !map.is_empty() {
                    return Err("An inline command is already running".into());
                }

                let mut child = match inline_shell_command(&trimmed)
                    .stdout(Stdio::piped())
                    .stderr(Stdio::piped())
                    .spawn()
                {
                    Ok(child) => child,
                    Err(e) => return Err(format!("Failed to run command: {e}")),
                };

                let stdout_handle = child
                    .stdout
                    .take()
                    .map(|stdout| read_pipe_stream(app.clone(), id.clone(), "stdout", stdout));
                let stderr_handle = child
                    .stderr
                    .take()
                    .map(|stderr| read_pipe_stream(app.clone(), id.clone(), "stderr", stderr));
                let child = Arc::new(Mutex::new(child));
                map.insert(id.clone(), Arc::clone(&child));
                (child, stdout_handle, stderr_handle)
            };

            let (child, stdout_handle, stderr_handle) = child;

            let status = loop {
                let maybe_status = {
                    let mut locked = match child.lock() {
                        Ok(locked) => locked,
                        Err(e) => {
                            if let Ok(mut map) = processes.lock() {
                                map.remove(&id);
                            }
                            return Err(e.to_string());
                        }
                    };
                    match locked.try_wait() {
                        Ok(status) => status,
                        Err(e) => {
                            if let Ok(mut map) = processes.lock() {
                                map.remove(&id);
                            }
                            return Err(format!("Failed to read command status: {e}"));
                        }
                    }
                };
                if let Some(status) = maybe_status {
                    break status;
                }
                std::thread::sleep(Duration::from_millis(75));
            };

            {
                if let Ok(mut map) = processes.lock() {
                    map.remove(&id);
                }
            }
            let stdout = match stdout_handle {
                Some(handle) => handle
                    .join()
                    .map_err(|_| "Failed to read command stdout".to_string())?
                    .map_err(|e| format!("Failed to read command stdout: {e}"))?,
                None => String::new(),
            };
            let stderr = match stderr_handle {
                Some(handle) => handle
                    .join()
                    .map_err(|_| "Failed to read command stderr".to_string())?
                    .map_err(|e| format!("Failed to read command stderr: {e}"))?,
                None => String::new(),
            };

            Ok(TerminalCommandResult {
                stdout,
                stderr,
                exit_code: status.code(),
                canceled: status.code().is_none(),
            })
        }
    })
    .await?
}

#[tauri::command]
fn cancel_terminal_command(
    state: tauri::State<'_, TerminalState>,
    id: String,
) -> Result<(), String> {
    let child = {
        let mut map = state.inline_processes.lock().map_err(|e| e.to_string())?;
        map.remove(&id)
    };

    if let Some(child) = child {
        terminate_inline_child(&child)?;
    }
    Ok(())
}

#[tauri::command]
fn cancel_all_terminal_commands(state: tauri::State<'_, TerminalState>) -> Result<(), String> {
    let children = {
        let mut map = state.inline_processes.lock().map_err(|e| e.to_string())?;
        map.drain().map(|(_, child)| child).collect::<Vec<_>>()
    };

    for child in children {
        terminate_inline_child(&child)?;
    }
    Ok(())
}

fn has_running_inline_command<R: Runtime>(app: &tauri::AppHandle<R>) -> bool {
    app.try_state::<TerminalState>()
        .and_then(|state| {
            state
                .inline_processes
                .lock()
                .ok()
                .map(|processes| !processes.is_empty())
        })
        .unwrap_or(false)
}

fn request_terminal_close_confirmation<R: Runtime>(window: &tauri::Window<R>, reason: &str) {
    let _ = window.emit("terminal-close-requested", reason.to_string());
}

#[tauri::command]
fn hide_main_window(window: tauri::Window) -> Result<(), String> {
    window.hide().map_err(|e| e.to_string())?;
    window
        .emit("window-hidden", ())
        .map_err(|e| e.to_string())?;
    Ok(())
}

fn docker_output(args: &[String]) -> Result<DockerCommandResult, String> {
    let status = docker_status_blocking();
    if !status.cli_installed {
        return Err(docker_err(
            "CLI_MISSING",
            status
                .error_message
                .unwrap_or_else(|| "Docker CLI not found.".into()),
        ));
    }
    if !status.daemon_running {
        return Err(docker_err(
            "DAEMON_DOWN",
            status
                .error_message
                .unwrap_or_else(|| "Docker daemon is not running.".into()),
        ));
    }

    let mut child = Command::new("docker")
        .args(args)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| docker_err("COMMAND_FAILED", e.to_string()))?;

    let stdout_handle = child.stdout.take().map(read_pipe);
    let stderr_handle = child.stderr.take().map(read_pipe);

    let timeout = docker_timeout(args);
    let started = Instant::now();
    let status_code = loop {
        if let Some(status_code) = child
            .try_wait()
            .map_err(|e| docker_err("COMMAND_FAILED", e.to_string()))?
        {
            break status_code;
        }
        if started.elapsed() > timeout {
            let _ = child.kill();
            let _ = child.wait();
            return Err(docker_err("TIMEOUT", format!("Docker command timed out after {} seconds. Long operations may still be running in Docker; retry or check Docker Desktop/CLI output.", timeout.as_secs())));
        }
        std::thread::sleep(Duration::from_millis(100));
    };

    let stdout = match stdout_handle {
        Some(handle) => handle
            .join()
            .map_err(|_| docker_err("COMMAND_FAILED", "Failed to read Docker stdout.".into()))?
            .map_err(|e| docker_err("COMMAND_FAILED", e))?,
        None => String::new(),
    };
    let stderr = match stderr_handle {
        Some(handle) => handle
            .join()
            .map_err(|_| docker_err("COMMAND_FAILED", "Failed to read Docker stderr.".into()))?
            .map_err(|e| docker_err("COMMAND_FAILED", e))?,
        None => String::new(),
    };

    let result = DockerCommandResult { stdout, stderr };

    if !status_code.success() {
        return Err(docker_err(
            "COMMAND_FAILED",
            if result.stderr.trim().is_empty() {
                result.stdout.clone()
            } else {
                result.stderr.clone()
            },
        ));
    }

    Ok(result)
}

#[tauri::command]
async fn list_containers() -> Result<Vec<ContainerInfo>, String> {
    run_blocking(list_containers_blocking).await?
}

fn list_containers_blocking() -> Result<Vec<ContainerInfo>, String> {
    let args = vec![
        "ps".into(),
        "-a".into(),
        "--format".into(),
        "{{.ID}}|{{.Image}}|{{.Status}}|{{.Names}}|{{.Ports}}|{{.State}}|{{.CreatedAt}}".into(),
    ];
    let output = docker_output(&args)?;
    let stdout = output.stdout;
    let mut containers = Vec::new();
    for line in stdout.lines() {
        let parts: Vec<&str> = line.split('|').collect();
        if parts.len() == 7 {
            containers.push(ContainerInfo {
                id: parts[0].to_string(),
                image: parts[1].to_string(),
                status: parts[2].to_string(),
                names: parts[3].to_string(),
                ports: parts[4].to_string(),
                state: parts[5].to_string(),
                created_at: parts[6].to_string(),
            });
        }
    }
    Ok(containers)
}

#[tauri::command]
async fn list_images() -> Result<Vec<ImageInfo>, String> {
    run_blocking(list_images_blocking).await?
}

fn list_images_blocking() -> Result<Vec<ImageInfo>, String> {
    let args = vec![
        "images".into(),
        "--format".into(),
        "{{.ID}}|{{.Repository}}|{{.Tag}}|{{.Size}}|{{.CreatedAt}}".into(),
    ];
    let output = docker_output(&args)?;
    let stdout = output.stdout;
    let mut images = Vec::new();
    for line in stdout.lines() {
        let parts: Vec<&str> = line.split('|').collect();
        if parts.len() == 5 {
            images.push(ImageInfo {
                id: parts[0].to_string(),
                repository: parts[1].to_string(),
                tag: parts[2].to_string(),
                size: parts[3].to_string(),
                created_since: parts[4].to_string(),
            });
        }
    }
    Ok(images)
}

#[tauri::command]
async fn delete_image(
    id: String,
    force: Option<bool>,
    confirmed: Option<bool>,
) -> Result<DockerCommandResult, String> {
    run_blocking(move || delete_image_blocking(id, force, confirmed)).await?
}

fn delete_image_blocking(
    id: String,
    force: Option<bool>,
    confirmed: Option<bool>,
) -> Result<DockerCommandResult, String> {
    require_confirmed(confirmed, "Deleting Docker images")?;
    validate_ref(&id, "image id")?;
    let mut args = vec!["rmi".into()];
    if force.unwrap_or(false) {
        args.push("--force".into());
    }
    args.push(id);
    docker_output(&args)
}

#[tauri::command]
async fn manage_container(
    id: String,
    action: String,
    confirmed: Option<bool>,
) -> Result<DockerCommandResult, String> {
    run_blocking(move || manage_container_blocking(id, action, confirmed)).await?
}

fn manage_container_blocking(
    id: String,
    action: String,
    confirmed: Option<bool>,
) -> Result<DockerCommandResult, String> {
    validate_ref(&id, "container id")?;
    let allowed = [
        "start", "stop", "restart", "pause", "unpause", "remove", "kill",
    ];
    if !allowed.contains(&action.as_str()) {
        return Err(docker_err(
            "VALIDATION_FAILED",
            format!("Unsupported container action: {}", action),
        ));
    }
    if action == "remove" || action == "kill" {
        require_confirmed(confirmed, "Destructive container operations")?;
    }
    let docker_action = if action == "remove" {
        "rm"
    } else {
        action.as_str()
    };
    docker_output(&vec![docker_action.into(), id])
}

#[tauri::command]
async fn pull_image(image: String) -> Result<DockerCommandResult, String> {
    run_blocking(move || pull_image_blocking(image)).await?
}

fn pull_image_blocking(image: String) -> Result<DockerCommandResult, String> {
    validate_ref(&image, "image")?;
    docker_output(&vec!["pull".into(), image])
}

#[tauri::command]
async fn run_container(options: RunContainerOptions) -> Result<DockerCommandResult, String> {
    run_blocking(move || run_container_blocking(options)).await?
}

fn run_container_blocking(options: RunContainerOptions) -> Result<DockerCommandResult, String> {
    validate_ref(&options.image, "image")?;
    let mut args = vec!["run".into()];
    if options.detached {
        args.push("--detach".into());
    }
    if options.interactive {
        args.push("--interactive".into());
        args.push("--tty".into());
    }
    if options.remove_when_exit.unwrap_or(false) {
        args.push("--rm".into());
    }
    if let Some(name) = options.name.filter(|n| !n.trim().is_empty()) {
        validate_ref(&name, "container name")?;
        args.push("--name".into());
        args.push(name);
    }
    for port in options.ports {
        validate_ref(&port.host, "host port")?;
        validate_ref(&port.container, "container port")?;
        let proto = port.protocol.unwrap_or_else(|| "tcp".into());
        if proto != "tcp" && proto != "udp" {
            return Err(docker_err(
                "VALIDATION_FAILED",
                "Protocol must be tcp or udp.".into(),
            ));
        }
        args.push("--publish".into());
        args.push(format!("{}:{}/{}", port.host, port.container, proto));
    }
    for env in options.env {
        validate_ref(&env.key, "env key")?;
        args.push("--env".into());
        args.push(format!("{}={}", env.key, env.value));
    }
    for volume in options.volumes {
        validate_ref(&volume.host, "host path")?;
        validate_ref(&volume.container, "container path")?;
        let suffix = if volume.readonly.unwrap_or(false) {
            ":ro"
        } else {
            ""
        };
        args.push("--volume".into());
        args.push(format!("{}:{}{}", volume.host, volume.container, suffix));
    }
    let safe_extra = [
        "--pull",
        "--platform",
        "--network",
        "--hostname",
        "--user",
        "--workdir",
        "--entrypoint",
        "--add-host",
        "--dns",
        "--label",
        "--memory",
        "--cpus",
    ];
    let mut extras = options.extra_args.into_iter();
    while let Some(flag) = extras.next() {
        if !safe_extra.contains(&flag.as_str()) {
            return Err(docker_err(
                "VALIDATION_FAILED",
                format!("Unsupported advanced flag: {}", flag),
            ));
        }
        args.push(flag);
        if let Some(value) = extras.next() {
            args.push(value);
        }
    }
    args.push(options.image);
    args.extend(options.command);
    docker_output(&args)
}

#[tauri::command]
async fn container_logs(
    id: String,
    tail: Option<u32>,
    timestamps: Option<bool>,
) -> Result<DockerCommandResult, String> {
    run_blocking(move || container_logs_blocking(id, tail, timestamps)).await?
}

fn container_logs_blocking(
    id: String,
    tail: Option<u32>,
    timestamps: Option<bool>,
) -> Result<DockerCommandResult, String> {
    validate_ref(&id, "container id")?;
    let mut args = vec!["logs".into()];
    if timestamps.unwrap_or(false) {
        args.push("--timestamps".into());
    }
    args.push("--tail".into());
    args.push(tail.unwrap_or(200).min(5000).to_string());
    args.push(id);
    docker_output(&args)
}

#[tauri::command]
async fn exec_container(id: String, command: Vec<String>) -> Result<DockerCommandResult, String> {
    run_blocking(move || exec_container_blocking(id, command)).await?
}

fn exec_container_blocking(
    id: String,
    command: Vec<String>,
) -> Result<DockerCommandResult, String> {
    validate_ref(&id, "container id")?;
    if command.is_empty() {
        return Err(docker_err(
            "VALIDATION_FAILED",
            "Command is required.".into(),
        ));
    }
    let mut args = vec!["exec".into(), id];
    args.extend(command);
    docker_output(&args)
}

#[tauri::command]
async fn inspect_docker(target: String) -> Result<DockerCommandResult, String> {
    run_blocking(move || inspect_docker_blocking(target)).await?
}

fn inspect_docker_blocking(target: String) -> Result<DockerCommandResult, String> {
    validate_ref(&target, "inspect target")?;
    docker_output(&vec!["inspect".into(), target])
}

#[tauri::command]
async fn prune_docker(
    kind: String,
    volumes: Option<bool>,
    force: Option<bool>,
    confirmed: Option<bool>,
) -> Result<DockerCommandResult, String> {
    run_blocking(move || prune_docker_blocking(kind, volumes, force, confirmed)).await?
}

fn prune_docker_blocking(
    kind: String,
    volumes: Option<bool>,
    force: Option<bool>,
    confirmed: Option<bool>,
) -> Result<DockerCommandResult, String> {
    require_confirmed(confirmed, "Docker prune")?;
    let mut args = match kind.as_str() {
        "containers" => vec!["container".into(), "prune".into()],
        "images" => vec!["image".into(), "prune".into()],
        "volumes" => vec!["volume".into(), "prune".into()],
        "system" => vec!["system".into(), "prune".into()],
        _ => {
            return Err(docker_err(
                "VALIDATION_FAILED",
                format!("Unsupported prune kind: {}", kind),
            ))
        }
    };
    if force.unwrap_or(true) {
        args.push("--force".into());
    }
    if kind == "system" && volumes.unwrap_or(false) {
        args.push("--volumes".into());
    }
    docker_output(&args)
}

fn is_safe_compose_name(path: &Path) -> bool {
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    let extension = path
        .extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    matches!(
        file_name.as_str(),
        "docker-compose.yml" | "docker-compose.yaml" | "compose.yml" | "compose.yaml"
    ) || ((extension == "yml" || extension == "yaml") && file_name.contains("compose"))
}

fn validate_compose_path_for_read(path: &str) -> Result<PathBuf, String> {
    let path_ref = Path::new(path);
    if path.trim().is_empty() || path.contains('\0') || !is_safe_compose_name(path_ref) {
        return Err(docker_err("VALIDATION_FAILED", "Compose file path must end with docker-compose.yml/yaml, compose.yml/yaml, or another *compose*.yml/yaml file.".into()));
    }
    let canonical = path_ref
        .canonicalize()
        .map_err(|_| docker_err("VALIDATION_FAILED", "Compose file does not exist.".into()))?;
    if !canonical.is_file() {
        return Err(docker_err(
            "VALIDATION_FAILED",
            "Compose file does not exist.".into(),
        ));
    }
    Ok(canonical)
}

fn validate_compose_path_for_write(path: &str) -> Result<PathBuf, String> {
    let path_ref = Path::new(path);
    if path.trim().is_empty() || path.contains('\0') || !is_safe_compose_name(path_ref) {
        return Err(docker_err("VALIDATION_FAILED", "Compose file path must end with docker-compose.yml/yaml, compose.yml/yaml, or another *compose*.yml/yaml file.".into()));
    }
    if path_ref
        .components()
        .any(|component| matches!(component, std::path::Component::ParentDir))
    {
        return Err(docker_err(
            "VALIDATION_FAILED",
            "Compose file path cannot contain parent-directory traversal.".into(),
        ));
    }
    let parent = path_ref.parent().ok_or_else(|| {
        docker_err(
            "VALIDATION_FAILED",
            "Compose file parent directory is required.".into(),
        )
    })?;
    let canonical_parent = parent.canonicalize().map_err(|_| {
        docker_err(
            "VALIDATION_FAILED",
            "Compose file parent directory does not exist.".into(),
        )
    })?;
    Ok(canonical_parent.join(
        path_ref.file_name().ok_or_else(|| {
            docker_err("VALIDATION_FAILED", "Compose file name is required.".into())
        })?,
    ))
}

#[tauri::command]
async fn compose_read_file(path: String) -> Result<String, String> {
    run_blocking(move || compose_read_file_blocking(path)).await?
}

fn compose_read_file_blocking(path: String) -> Result<String, String> {
    let path_ref = validate_compose_path_for_read(&path)?;
    std::fs::read_to_string(path_ref).map_err(|e| docker_err("COMMAND_FAILED", e.to_string()))
}

#[tauri::command]
async fn compose_write_file(
    path: String,
    content: String,
    overwrite: Option<bool>,
    confirmed: Option<bool>,
) -> Result<(), String> {
    run_blocking(move || compose_write_file_blocking(path, content, overwrite, confirmed)).await?
}

fn compose_write_file_blocking(
    path: String,
    content: String,
    overwrite: Option<bool>,
    confirmed: Option<bool>,
) -> Result<(), String> {
    let path_ref = validate_compose_path_for_write(&path)?;
    if path_ref.exists() {
        if !overwrite.unwrap_or(false) {
            return Err(docker_err(
                "VALIDATION_FAILED",
                "File exists; confirm overwrite first.".into(),
            ));
        }
        require_confirmed(confirmed, "Overwriting compose files")?;
    }
    std::fs::write(path_ref, content).map_err(|e| docker_err("COMMAND_FAILED", e.to_string()))
}

#[tauri::command]
async fn compose_action(
    path: String,
    action: String,
    detach: Option<bool>,
    volumes: Option<bool>,
    confirmed: Option<bool>,
) -> Result<DockerCommandResult, String> {
    run_blocking(move || compose_action_blocking(path, action, detach, volumes, confirmed)).await?
}

fn compose_action_blocking(
    path: String,
    action: String,
    detach: Option<bool>,
    volumes: Option<bool>,
    confirmed: Option<bool>,
) -> Result<DockerCommandResult, String> {
    let path_ref = validate_compose_path_for_read(&path)?;
    let mut args = vec![
        "compose".into(),
        "-f".into(),
        path_ref.to_string_lossy().to_string(),
        action.clone(),
    ];
    match action.as_str() {
        "up" => {
            if detach.unwrap_or(true) {
                args.push("--detach".into());
            }
        }
        "down" => {
            if volumes.unwrap_or(false) {
                require_confirmed(confirmed, "Compose down with volumes")?;
                args.push("--volumes".into());
            }
        }
        "pull" | "logs" | "ps" | "restart" => {}
        _ => {
            return Err(docker_err(
                "VALIDATION_FAILED",
                format!("Unsupported compose action: {}", action),
            ))
        }
    }
    docker_output(&args)
}

#[cfg(target_os = "macos")]
fn get_macos_app_icon_path(app_path: &std::path::Path) -> Option<std::path::PathBuf> {
    let plist_path = app_path.join("Contents/Info.plist");
    if !plist_path.exists() {
        return None;
    }

    let output = std::process::Command::new("plutil")
        .args(["-convert", "json", "-o", "-", plist_path.to_str()?])
        .output()
        .ok()?;

    if !output.status.success() {
        return None;
    }

    let json: serde_json::Value = serde_json::from_slice(&output.stdout).ok()?;

    // Check keys in order: CFBundleIconName (modern), CFBundleIconFile, CFBundleIcons
    let mut icon_name = json
        .get("CFBundleIconName")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    if icon_name.is_none() {
        icon_name = json
            .get("CFBundleIconFile")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
    }

    if icon_name.is_none() {
        if let Some(icons) = json.get("CFBundleIcons") {
            if let Some(primary) = icons.get("CFBundlePrimaryIcon") {
                if let Some(files) = primary.get("CFBundleIconFiles") {
                    if let Some(arr) = files.as_array() {
                        if let Some(first) = arr.first() {
                            icon_name = first.as_str().map(|s| s.to_string());
                        }
                    }
                }
            }
        }
    }

    let icon_name = icon_name?;
    let resources_dir = app_path.join("Contents/Resources");

    // 1. Try {icon_name}.icns
    let icns_path = resources_dir.join(format!("{}.icns", icon_name));
    if icns_path.exists() {
        return Some(icns_path);
    }

    // 2. Try as-is (may already have extension)
    let direct_path = resources_dir.join(&icon_name);
    if direct_path.exists() && direct_path.is_file() {
        return Some(direct_path);
    }

    // 3. Try .appiconset directory
    let appiconset_path = resources_dir.join(format!("{}.appiconset", icon_name));
    if appiconset_path.exists() && appiconset_path.is_dir() {
        let mut png_files: Vec<(std::path::PathBuf, u64)> = std::fs::read_dir(&appiconset_path)
            .ok()?
            .filter_map(|entry| {
                let entry = entry.ok()?;
                let path = entry.path();
                if path.extension()?.to_str()?.eq_ignore_ascii_case("png") {
                    let size = std::fs::metadata(&path).ok()?.len();
                    Some((path, size))
                } else {
                    None
                }
            })
            .collect();

        // Sort by file size descending and pick the largest
        png_files.sort_by(|a, b| b.1.cmp(&a.1));
        return png_files.into_iter().next().map(|(path, _)| path);
    }

    None
}

#[cfg(target_os = "macos")]
fn get_cache_path(
    app_path: &std::path::Path,
    cache_dir: &std::path::Path,
) -> Option<std::path::PathBuf> {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};

    let app_name = app_path.file_stem()?.to_str()?;
    let mut hasher = DefaultHasher::new();
    app_path.hash(&mut hasher);
    let hash = format!("{:x}", hasher.finish());
    Some(cache_dir.join(format!("{}_{}.png", app_name, hash)))
}

#[cfg(target_os = "macos")]
fn get_swift_extractor() -> Option<&'static std::path::PathBuf> {
    use std::sync::OnceLock;
    static SWIFT_EXTRACTOR: OnceLock<Option<std::path::PathBuf>> = OnceLock::new();

    SWIFT_EXTRACTOR
        .get_or_init(|| {
            let cache_dir = dirs::cache_dir()?.join("gquick");
            let binary_path = cache_dir.join("extract_icon");

            if binary_path.exists() {
                return Some(binary_path);
            }

            std::fs::create_dir_all(&cache_dir).ok()?;

            let swift_source = r#"import Cocoa
import Foundation
let args = CommandLine.arguments
guard args.count >= 3 else { exit(1) }
let appPath = args[1]
let outputPath = args[2]
let icon = NSWorkspace.shared.icon(forFile: appPath)
icon.size = NSSize(width: 128, height: 128)
guard let tiffData = icon.tiffRepresentation,
      let bitmap = NSBitmapImageRep(data: tiffData),
      let pngData = bitmap.representation(using: .png, properties: [:]) else {
    exit(1)
}
try pngData.write(to: URL(fileURLWithPath: outputPath))
"#;

            let swift_file = cache_dir.join("extract_icon.swift");
            std::fs::write(&swift_file, swift_source).ok()?;

            let output = std::process::Command::new("swiftc")
                .args(["-O", "-o", binary_path.to_str()?, swift_file.to_str()?])
                .output()
                .ok()?;

            if output.status.success() && binary_path.exists() {
                Some(binary_path)
            } else {
                None
            }
        })
        .as_ref()
}

#[cfg(target_os = "macos")]
fn ensure_app_icon_cached(
    app_path: &std::path::Path,
    cache_dir: &std::path::Path,
) -> Option<String> {
    // Ensure cache directory exists
    std::fs::create_dir_all(cache_dir).ok()?;

    let cache_path = get_cache_path(app_path, cache_dir)?;

    // If cache already exists, return it
    if cache_path.exists() {
        return Some(cache_path.to_string_lossy().to_string());
    }

    // Try to find icon source via plist
    if let Some(source_icon) = get_macos_app_icon_path(app_path) {
        // If source is PNG, copy directly
        if source_icon
            .extension()
            .map_or(false, |ext| ext.eq_ignore_ascii_case("png"))
        {
            std::fs::copy(&source_icon, &cache_path).ok()?;
            if cache_path.exists() {
                return Some(cache_path.to_string_lossy().to_string());
            }
        }

        // If source is ICNS, convert with sips
        if source_icon
            .extension()
            .map_or(false, |ext| ext.eq_ignore_ascii_case("icns"))
        {
            let output = std::process::Command::new("sips")
                .args([
                    "-s",
                    "format",
                    "png",
                    source_icon.to_str()?,
                    "--out",
                    cache_path.to_str()?,
                ])
                .output()
                .ok()?;

            if output.status.success() && cache_path.exists() {
                return Some(cache_path.to_string_lossy().to_string());
            }
        }
    }

    // Fallback: use Swift extractor
    if let Some(extractor) = get_swift_extractor() {
        let output = std::process::Command::new(extractor)
            .args([app_path.to_str()?, cache_path.to_str()?])
            .output()
            .ok()?;

        if output.status.success() && cache_path.exists() {
            return Some(cache_path.to_string_lossy().to_string());
        }
    }

    None
}

#[tauri::command]
fn list_apps(app: tauri::AppHandle) -> Vec<AppInfo> {
    let mut apps = Vec::new();

    #[cfg(target_os = "macos")]
    {
        let cache_dir = app
            .path()
            .app_local_data_dir()
            .ok()
            .map(|dir| dir.join("app-icons"));

        let mut paths = vec![
            "/Applications".to_string(),
            "/System/Applications".to_string(),
        ];
        if let Ok(home) = std::env::var("HOME") {
            paths.push(format!("{}/Applications", home));
        }

        let mut app_entries: Vec<(std::path::PathBuf, String)> = Vec::new();

        for path in paths {
            if let Ok(entries) = std::fs::read_dir(&path) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path
                        .extension()
                        .map_or(false, |ext| ext.eq_ignore_ascii_case("app"))
                    {
                        let name = path
                            .file_stem()
                            .map_or("Unknown".to_string(), |s| s.to_string_lossy().to_string());
                        app_entries.push((path, name));
                    }
                }
            }
        }

        // Extract icons in parallel using rayon
        use rayon::prelude::*;
        let cache_ref = cache_dir.as_ref();
        let icons: Vec<Option<String>> = app_entries
            .par_iter()
            .map(|(path, _)| cache_ref.and_then(|dir| ensure_app_icon_cached(path, dir)))
            .collect();

        // Combine entries with icons
        for ((path, name), icon) in app_entries.into_iter().zip(icons.into_iter()) {
            apps.push(AppInfo {
                name,
                path: path.to_string_lossy().to_string(),
                icon,
            });
        }
    }

    #[cfg(target_os = "windows")]
    {
        let start_menu_paths = [
            std::env::var("ProgramData")
                .map(|p| format!("{}\\Microsoft\\Windows\\Start Menu\\Programs", p)),
            std::env::var("APPDATA")
                .map(|p| format!("{}\\Microsoft\\Windows\\Start Menu\\Programs", p)),
        ];
        for base in start_menu_paths.iter().flatten() {
            for entry in walkdir::WalkDir::new(base)
                .max_depth(3)
                .into_iter()
                .flatten()
            {
                let path = entry.path();
                if path
                    .extension()
                    .map_or(false, |ext| ext.eq_ignore_ascii_case("lnk"))
                {
                    let name = path
                        .file_stem()
                        .map_or("Unknown".to_string(), |s| s.to_string_lossy().to_string());
                    apps.push(AppInfo {
                        name,
                        path: path.to_string_lossy().to_string(),
                        icon: None,
                    });
                }
            }
        }
    }

    #[cfg(target_os = "linux")]
    {
        let desktop_paths = [
            "/usr/share/applications".to_string(),
            "/usr/local/share/applications".to_string(),
            dirs::data_dir()
                .map(|p| p.join("applications").to_string_lossy().to_string())
                .unwrap_or_default(),
        ];
        for base in desktop_paths.iter().filter(|p| !p.is_empty()) {
            if let Ok(entries) = std::fs::read_dir(base) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.extension().map_or(false, |ext| ext == "desktop") {
                        if let Ok(content) = std::fs::read_to_string(&path) {
                            let mut name = None;
                            let mut exec = None;
                            let mut no_display = false;
                            let mut hidden = false;
                            let mut in_entry = false;
                            for line in content.lines() {
                                let trimmed = line.trim();
                                if trimmed == "[Desktop Entry]" {
                                    in_entry = true;
                                    continue;
                                }
                                if trimmed.starts_with('[') {
                                    in_entry = false;
                                    continue;
                                }
                                if !in_entry {
                                    continue;
                                }
                                if let Some((key, value)) = trimmed.split_once('=') {
                                    match key {
                                        "Name" if name.is_none() => name = Some(value.to_string()),
                                        "Exec" if exec.is_none() => exec = Some(value.to_string()),
                                        "NoDisplay" => no_display = value.trim() == "true",
                                        "Hidden" => hidden = value.trim() == "true",
                                        _ => {}
                                    }
                                }
                            }
                            if no_display || hidden {
                                continue;
                            }
                            if let Some(name) = name {
                                apps.push(AppInfo {
                                    name,
                                    path: exec
                                        .unwrap_or_else(|| path.to_string_lossy().to_string()),
                                    icon: None,
                                });
                            }
                        }
                    }
                }
            }
        }
    }

    apps
}

#[tauri::command]
fn capture_region(
    window: tauri::Window,
    x: i32,
    y: i32,
    width: u32,
    height: u32,
    mode: String,
) -> Result<String, String> {
    // 1. Get monitor info while window is still visible
    let tauri_monitor = match window.current_monitor() {
        Ok(Some(m)) => m,
        _ => {
            let _ = window.close();
            return Err("No monitor found".to_string());
        }
    };
    let tauri_name = match tauri_monitor.name() {
        Some(n) => n.to_string(),
        None => {
            let _ = window.close();
            return Err("Monitor has no name".to_string());
        }
    };
    let scale_factor = window.scale_factor().unwrap_or(1.0);
    let app = window.app_handle();

    // 2. Hide the window immediately to clear the screen
    let _ = window.hide();
    std::thread::sleep(std::time::Duration::from_millis(150));

    // 3. Do capture in a closure so we can clean up on error
    let capture_result = (|| -> Result<String, String> {
        let xcap_monitors = xcap::Monitor::all().map_err(|e| e.to_string())?;
        let xcap_monitor = xcap_monitors
            .into_iter()
            .find(|m| m.name().ok().as_deref() == Some(&tauri_name))
            .or_else(|| xcap::Monitor::all().ok()?.into_iter().next())
            .ok_or_else(|| "Could not find matching xcap monitor".to_string())?;

        let image = xcap_monitor.capture_image().map_err(|e| e.to_string())?;

        // Convert logical coordinates to physical coordinates
        let phys_x = (x as f64 * scale_factor).round() as u32;
        let phys_y = (y as f64 * scale_factor).round() as u32;
        let phys_width = (width as f64 * scale_factor).round() as u32;
        let phys_height = (height as f64 * scale_factor).round() as u32;

        // Ensure we don't exceed image bounds
        let phys_x = phys_x.min(image.width());
        let phys_y = phys_y.min(image.height());
        let phys_width = phys_width.min(image.width() - phys_x);
        let phys_height = phys_height.min(image.height() - phys_y);

        if phys_width < 2 || phys_height < 2 {
            return Err("Selected region is too small".to_string());
        }

        // Crop and Save
        let cropped =
            image::imageops::crop_imm(&image, phys_x, phys_y, phys_width, phys_height).to_image();

        let desktop_dir = dirs::desktop_dir().unwrap_or_else(|| {
            std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("."))
        });
        let path = desktop_dir
            .join("gquick_capture.png")
            .to_string_lossy()
            .to_string();

        cropped.save(&path).map_err(|e| e.to_string())?;

        // Handle Modes
        if mode == "screenshot" {
            // Copy screenshot to clipboard
            let width = cropped.width();
            let height = cropped.height();
            let rgba_bytes = cropped.into_raw();
            let tauri_image = tauri::image::Image::new_owned(rgba_bytes, width, height);
            let _ = app.clipboard().write_image(&tauri_image);
        } else if mode == "ocr" {
            #[cfg(target_os = "macos")]
            {
                let ocr_text = run_ocr(&app, &path);

                // Copy extracted text to clipboard
                let _ = app.clipboard().write_text(ocr_text.clone());

                // Show notification with first 100 chars
                let preview = if ocr_text.len() > 100 {
                    format!("{}...", &ocr_text[..100])
                } else {
                    ocr_text.clone()
                };

                if let Err(e) = app.emit("ocr-complete", preview) {
                    eprintln!("Failed to emit ocr-complete: {}", e);
                }
            }

            #[cfg(not(target_os = "macos"))]
            {
                match std::fs::read(&path) {
                    Ok(bytes) => {
                        let image_base64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
                        if let Err(e) = app.emit("ocr-image-ready", image_base64) {
                            eprintln!("Failed to emit ocr-image-ready: {}", e);
                        }
                    }
                    Err(e) => {
                        eprintln!("Failed to read captured image for OCR: {}", e);
                        if let Err(emit_err) =
                            app.emit("ocr-error", format!("Failed to read image: {}", e))
                        {
                            eprintln!("Failed to emit ocr-error: {}", emit_err);
                        }
                    }
                }
            }
        }

        Ok(path)
    })();

    // 4. Always close the window when done
    let _ = window.close();

    capture_result
}

#[tauri::command]
fn open_app(path: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/C", "start", "", &path])
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn parse_shortcut(s: &str) -> Result<Shortcut, String> {
    let parts: Vec<&str> = s.split('+').map(|p| p.trim()).collect();
    if parts.len() < 2 {
        return Err("Invalid shortcut format".into());
    }

    let key = parts.last().unwrap();
    let code = match key.to_lowercase().as_str() {
        "space" => Code::Space,
        "enter" | "return" => Code::Enter,
        "tab" => Code::Tab,
        "a" => Code::KeyA,
        "b" => Code::KeyB,
        "c" => Code::KeyC,
        "d" => Code::KeyD,
        "e" => Code::KeyE,
        "f" => Code::KeyF,
        "g" => Code::KeyG,
        "h" => Code::KeyH,
        "i" => Code::KeyI,
        "j" => Code::KeyJ,
        "k" => Code::KeyK,
        "l" => Code::KeyL,
        "m" => Code::KeyM,
        "n" => Code::KeyN,
        "o" => Code::KeyO,
        "p" => Code::KeyP,
        "q" => Code::KeyQ,
        "r" => Code::KeyR,
        "s" => Code::KeyS,
        "t" => Code::KeyT,
        "u" => Code::KeyU,
        "v" => Code::KeyV,
        "w" => Code::KeyW,
        "x" => Code::KeyX,
        "y" => Code::KeyY,
        "z" => Code::KeyZ,
        "0" => Code::Digit0,
        "1" => Code::Digit1,
        "2" => Code::Digit2,
        "3" => Code::Digit3,
        "4" => Code::Digit4,
        "5" => Code::Digit5,
        "6" => Code::Digit6,
        "7" => Code::Digit7,
        "8" => Code::Digit8,
        "9" => Code::Digit9,
        "f1" => Code::F1,
        "f2" => Code::F2,
        "f3" => Code::F3,
        "f4" => Code::F4,
        "f5" => Code::F5,
        "f6" => Code::F6,
        "f7" => Code::F7,
        "f8" => Code::F8,
        "f9" => Code::F9,
        "f10" => Code::F10,
        "f11" => Code::F11,
        "f12" => Code::F12,
        _ => return Err(format!("Unknown key: {}", key)),
    };

    let mut mods = Modifiers::empty();
    for part in &parts[..parts.len() - 1] {
        let lower = part.to_lowercase();
        match lower.as_str() {
            "alt" => mods |= Modifiers::ALT,
            "ctrl" | "control" => mods |= Modifiers::CONTROL,
            "cmd" | "command" | "super" | "meta" | "cmdorctrl" => {
                #[cfg(target_os = "macos")]
                {
                    mods |= Modifiers::SUPER;
                }
                #[cfg(not(target_os = "macos"))]
                {
                    mods |= Modifiers::CONTROL;
                }
            }
            "shift" => mods |= Modifiers::SHIFT,
            _ => return Err(format!("Unknown modifier: {}", part)),
        }
    }

    Ok(Shortcut::new(Some(mods), code))
}

#[tauri::command]
fn update_main_shortcut(app: tauri::AppHandle, shortcut: String) -> Result<(), String> {
    let state = app.state::<ShortcutState>();
    let old_shortcut_str = state.main_shortcut.lock().unwrap().clone();

    // Parse and register new shortcut
    let new_shortcut = parse_shortcut(&shortcut)?;
    app.global_shortcut()
        .register(new_shortcut)
        .map_err(|e| e.to_string())?;

    // Unregister old shortcut
    if let Ok(old_shortcut) = parse_shortcut(&old_shortcut_str) {
        let _ = app.global_shortcut().unregister(old_shortcut);
    }

    // Update stored state
    *state.main_shortcut.lock().unwrap() = shortcut;

    Ok(())
}

#[tauri::command]
fn update_screenshot_shortcut(app: tauri::AppHandle, shortcut: String) -> Result<(), String> {
    let state = app.state::<ShortcutState>();
    let old_shortcut_str = state.screenshot_shortcut.lock().unwrap().clone();

    let new_shortcut = parse_shortcut(&shortcut)?;
    app.global_shortcut()
        .register(new_shortcut)
        .map_err(|e| e.to_string())?;

    if let Ok(old_shortcut) = parse_shortcut(&old_shortcut_str) {
        let _ = app.global_shortcut().unregister(old_shortcut);
    }

    *state.screenshot_shortcut.lock().unwrap() = shortcut;

    Ok(())
}

#[tauri::command]
fn update_ocr_shortcut(app: tauri::AppHandle, shortcut: String) -> Result<(), String> {
    let state = app.state::<ShortcutState>();
    let old_shortcut_str = state.ocr_shortcut.lock().unwrap().clone();

    let new_shortcut = parse_shortcut(&shortcut)?;
    app.global_shortcut()
        .register(new_shortcut)
        .map_err(|e| e.to_string())?;

    if let Ok(old_shortcut) = parse_shortcut(&old_shortcut_str) {
        let _ = app.global_shortcut().unregister(old_shortcut);
    }

    *state.ocr_shortcut.lock().unwrap() = shortcut;

    Ok(())
}

#[derive(serde::Serialize)]
struct ImageAttachment {
    data_url: String,
    mime_type: String,
    base64: String,
}

#[tauri::command]
fn close_selector(window: tauri::Window) {
    let _ = window.close();
}

#[tauri::command]
async fn open_image_dialog(
    app: tauri::AppHandle,
    state: tauri::State<'_, DialogState>,
) -> Result<Vec<ImageAttachment>, String> {
    use tauri_plugin_dialog::DialogExt;

    // Mark dialog as open so Focused(false) doesn't hide the window
    {
        let mut is_open = state.is_open.lock().unwrap();
        *is_open = true;
    }

    // Open native file picker (blocking via channel)
    let (tx, rx) = std::sync::mpsc::channel();
    app.dialog()
        .file()
        .add_filter("Images", &["png", "jpg", "jpeg", "webp", "gif"])
        .pick_files(move |files| {
            let _ = tx.send(files);
        });
    let files = rx.recv().unwrap_or(None);

    // Mark dialog as closed
    {
        let mut is_open = state.is_open.lock().unwrap();
        *is_open = false;
    }

    // Show and focus the main window again
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }

    let Some(paths) = files else {
        return Ok(vec![]);
    };

    let mut images = Vec::new();
    for path in paths {
        let path_str = path.to_string();
        let contents = match std::fs::read(&path_str) {
            Ok(c) => c,
            Err(_) => continue,
        };

        // Skip if > 5MB
        if contents.len() > 5 * 1024 * 1024 {
            continue;
        }

        let extension = path_str.split('.').last().unwrap_or("").to_lowercase();
        let mime_type = match extension.as_str() {
            "png" => "image/png",
            "jpg" | "jpeg" => "image/jpeg",
            "webp" => "image/webp",
            "gif" => "image/gif",
            _ => "image/png",
        };

        let base64_str = base64::engine::general_purpose::STANDARD.encode(&contents);
        let data_url = format!("data:{};base64,{}", mime_type, base64_str);

        images.push(ImageAttachment {
            data_url,
            mime_type: mime_type.to_string(),
            base64: base64_str,
        });
    }

    Ok(images)
}

fn toggle_window<R: Runtime>(app: &tauri::AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        let is_visible = window.is_visible().unwrap_or(false);
        if is_visible {
            if has_running_inline_command(app) {
                let _ = window.emit("terminal-close-requested", "toggle".to_string());
                return;
            }
            let _ = window.hide();
            let _ = window.emit("window-hidden", ());
        } else {
            // Center window on primary monitor
            if let Ok(Some(monitor)) = app.primary_monitor() {
                let monitor_size = monitor.size();
                let monitor_pos = monitor.position();
                let scale_factor = monitor.scale_factor();

                let window_size = window.inner_size().unwrap_or(tauri::PhysicalSize {
                    width: 760,
                    height: 800,
                });
                let logical_window_size = window_size.to_logical::<f64>(scale_factor);

                let logical_monitor_width = monitor_size.width as f64 / scale_factor;
                let logical_monitor_height = monitor_size.height as f64 / scale_factor;
                let logical_monitor_x = monitor_pos.x as f64 / scale_factor;
                let logical_monitor_y = monitor_pos.y as f64 / scale_factor;

                let x =
                    logical_monitor_x + (logical_monitor_width - logical_window_size.width) / 2.0;
                let y =
                    logical_monitor_y + (logical_monitor_height - logical_window_size.height) / 2.5; // Slightly above true center for better UX

                let _ =
                    window.set_position(tauri::Position::Logical(tauri::LogicalPosition { x, y }));
            }
            let _ = window.show();
            let _ = window.set_focus();
            let _ = window.emit("window-shown", ());
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    if event.state() == GsShortcutState::Pressed {
                        // Check main window shortcut dynamically
                        let state = app.state::<ShortcutState>();
                        let main_str = state.main_shortcut.lock().unwrap().clone();
                        if let Ok(main_shortcut) = parse_shortcut(&main_str) {
                            if shortcut.mods == main_shortcut.mods
                                && shortcut.key == main_shortcut.key
                            {
                                toggle_window(app);
                            }
                        }

                        // Check screenshot shortcut
                        let screenshot_str = state.screenshot_shortcut.lock().unwrap().clone();
                        if let Ok(screenshot_shortcut) = parse_shortcut(&screenshot_str) {
                            if shortcut.mods == screenshot_shortcut.mods
                                && shortcut.key == screenshot_shortcut.key
                            {
                                let mode = "screenshot";
                                let monitor = app.primary_monitor().ok().flatten();

                                if let Some(m) = monitor {
                                    let pos = m.position();
                                    let size = m.size();
                                    let scale_factor = m.scale_factor();
                                    let logical_pos = pos.to_logical::<f64>(scale_factor);
                                    let logical_size = size.to_logical::<f64>(scale_factor);

                                    if let Some(selector) = app.get_webview_window("selector") {
                                        let _ = selector.emit("set-mode", mode);
                                        let _ =
                                            selector.set_size(tauri::Size::Logical(logical_size));
                                        let _ = selector
                                            .set_position(tauri::Position::Logical(logical_pos));
                                        let _ = selector.show();
                                        let _ = selector.set_focus();
                                    } else {
                                        let builder = tauri::WebviewWindowBuilder::new(
                                            app,
                                            "selector",
                                            tauri::WebviewUrl::App(
                                                format!("index.html?mode={}", mode).into(),
                                            ),
                                        )
                                        .title("Selector")
                                        .inner_size(logical_size.width, logical_size.height)
                                        .position(logical_pos.x, logical_pos.y)
                                        .decorations(false)
                                        .transparent(true)
                                        .always_on_top(true)
                                        .shadow(false)
                                        .visible(false);

                                        if let Ok(window) = builder.build() {
                                            let _ = window.show();
                                            let _ = window.set_focus();
                                        }
                                    }
                                }
                            }
                        }

                        // Check OCR shortcut
                        let ocr_str = state.ocr_shortcut.lock().unwrap().clone();
                        if let Ok(ocr_shortcut) = parse_shortcut(&ocr_str) {
                            if shortcut.mods == ocr_shortcut.mods
                                && shortcut.key == ocr_shortcut.key
                            {
                                let mode = "ocr";
                                let monitor = app.primary_monitor().ok().flatten();

                                if let Some(m) = monitor {
                                    let pos = m.position();
                                    let size = m.size();
                                    let scale_factor = m.scale_factor();
                                    let logical_pos = pos.to_logical::<f64>(scale_factor);
                                    let logical_size = size.to_logical::<f64>(scale_factor);

                                    if let Some(selector) = app.get_webview_window("selector") {
                                        let _ = selector.emit("set-mode", mode);
                                        let _ =
                                            selector.set_size(tauri::Size::Logical(logical_size));
                                        let _ = selector
                                            .set_position(tauri::Position::Logical(logical_pos));
                                        let _ = selector.show();
                                        let _ = selector.set_focus();
                                    } else {
                                        let builder = tauri::WebviewWindowBuilder::new(
                                            app,
                                            "selector",
                                            tauri::WebviewUrl::App(
                                                format!("index.html?mode={}", mode).into(),
                                            ),
                                        )
                                        .title("Selector")
                                        .inner_size(logical_size.width, logical_size.height)
                                        .position(logical_pos.x, logical_pos.y)
                                        .decorations(false)
                                        .transparent(true)
                                        .always_on_top(true)
                                        .shadow(false)
                                        .visible(false);

                                        if let Ok(window) = builder.build() {
                                            let _ = window.show();
                                            let _ = window.set_focus();
                                        }
                                    }
                                }
                            }
                        }
                    }
                })
                .build(),
        )
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .setup(|app| {
            // Hide dock icon on macOS, keep only tray icon
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&quit_i])?;

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click { .. } = event {
                        let app = tray.app_handle();
                        toggle_window(app);
                    }
                })
                .build(app)?;

            // Initialize shortcut state with default
            #[cfg(target_os = "windows")]
            let default_shortcut = "Alt+Shift+Space".to_string();
            #[cfg(not(target_os = "windows"))]
            let default_shortcut = "Alt+Space".to_string();

            let default_shortcut_parsed = parse_shortcut(&default_shortcut)
                .map_err(|e| format!("Failed to parse default shortcut: {}", e))?;
            app.global_shortcut().register(default_shortcut_parsed)?;

            app.manage(ShortcutState {
                main_shortcut: Mutex::new(default_shortcut),
                screenshot_shortcut: Mutex::new("Alt+S".to_string()),
                ocr_shortcut: Mutex::new("Alt+O".to_string()),
            });

            app.manage(DialogState {
                is_open: std::sync::Mutex::new(false),
            });

            app.manage(TerminalState {
                inline_processes: Arc::new(Mutex::new(HashMap::new())),
            });

            // Initialize SQLite database for notes
            let app_data_dir = app
                .path()
                .app_data_dir()
                .map_err(|e| format!("Failed to get app data dir: {}", e))?;
            std::fs::create_dir_all(&app_data_dir)
                .map_err(|e| format!("Failed to create app data dir: {}", e))?;
            let db_path = app_data_dir.join("gquick.db");
            let conn = rusqlite::Connection::open(&db_path)
                .map_err(|e| format!("Failed to open database: {}", e))?;
            conn.execute(
                "CREATE TABLE IF NOT EXISTS notes (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    title TEXT NOT NULL,
                    content TEXT NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )",
                [],
            )
            .map_err(|e| format!("Failed to create notes table: {}", e))?;
            app.manage(DbState {
                conn: Mutex::new(conn),
            });

            let screenshot_shortcut = parse_shortcut("Alt+S")
                .map_err(|e| format!("Failed to parse screenshot shortcut: {}", e))?;
            app.global_shortcut().register(screenshot_shortcut)?;

            let ocr_shortcut = parse_shortcut("Alt+O")
                .map_err(|e| format!("Failed to parse OCR shortcut: {}", e))?;
            app.global_shortcut().register(ocr_shortcut)?;

            Ok(())
        })
        .on_window_event(|window, event| match event {
            tauri::WindowEvent::CloseRequested { api, .. } => {
                if window.label() == "selector" {
                    // Allow selector window to close normally
                } else {
                    if has_running_inline_command(&window.app_handle()) {
                        request_terminal_close_confirmation(window, "close");
                        api.prevent_close();
                        return;
                    }
                    let _ = window.hide();
                    let _ = window.emit("window-hidden", ());
                    api.prevent_close();
                }
            }
            tauri::WindowEvent::Focused(false) => {
                if window.label() == "selector" {
                    let _ = window.close();
                } else {
                    // Check if a dialog is open - don't hide window in that case
                    let app_handle = window.app_handle();
                    let dialog_state = app_handle.state::<DialogState>();
                    let is_dialog_open = *dialog_state.is_open.lock().unwrap();
                    if !is_dialog_open {
                        if has_running_inline_command(&app_handle) {
                            request_terminal_close_confirmation(window, "focus-lost");
                            return;
                        }
                        let _ = window.hide();
                        let _ = window.emit("window-hidden", ());
                    }
                }
            }
            _ => {}
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            list_apps,
            docker_status,
            search_docker_hub,
            list_containers,
            list_images,
            delete_image,
            manage_container,
            pull_image,
            run_container,
            container_logs,
            exec_container,
            inspect_docker,
            prune_docker,
            compose_read_file,
            compose_write_file,
            compose_action,
            open_app,
            capture_region,
            search_files,
            smart_search_files,
            open_file,
            update_main_shortcut,
            update_screenshot_shortcut,
            update_ocr_shortcut,
            open_image_dialog,
            close_selector,
            create_note,
            get_notes,
            update_note,
            delete_note,
            search_notes,
            get_note_by_id,
            open_terminal_command,
            run_terminal_command_inline,
            cancel_terminal_command,
            cancel_all_terminal_commands,
            hide_main_window
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
