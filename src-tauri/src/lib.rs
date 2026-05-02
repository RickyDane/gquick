use base64::Engine;
#[cfg(target_os = "macos")]
use std::cell::RefCell;
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Emitter, Manager, Runtime,
};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_global_shortcut::{
    Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState as GsShortcutState,
};
use tauri_plugin_opener::OpenerExt;
#[cfg(target_os = "macos")]
use tesseract::Tesseract;

#[cfg(target_os = "macos")]
use objc2::rc::Retained;

#[cfg(target_os = "macos")]
use objc2::{class, extern_class, extern_methods, msg_send, sel};

#[cfg(target_os = "macos")]
use objc2::runtime::NSObject;

#[cfg(target_os = "macos")]
use objc2_foundation::NSString;

#[cfg(target_os = "macos")]
use std::ffi::c_void;

#[cfg(target_os = "macos")]
#[link(name = "CoreWLAN", kind = "framework")]
extern "C" {}

#[cfg(target_os = "macos")]
#[link(name = "CoreLocation", kind = "framework")]
extern "C" {}

#[cfg(target_os = "macos")]
extern "C" {
    fn pthread_main_np() -> i32;
}

#[cfg(target_os = "macos")]
extern_class!(
    #[unsafe(super(NSObject))]
    #[name = "CWWiFiClient"]
    pub struct CWWiFiClient;
);

#[cfg(target_os = "macos")]
extern_class!(
    #[unsafe(super(NSObject))]
    #[name = "CWInterface"]
    pub struct CWInterface;
);

#[cfg(target_os = "macos")]
extern_class!(
    #[unsafe(super(NSObject))]
    #[name = "CLLocationManager"]
    pub struct CLLocationManager;
);

#[cfg(target_os = "macos")]
#[allow(non_snake_case)]
impl CWWiFiClient {
    extern_methods!(
        #[unsafe(method(sharedWiFiClient))]
        pub fn sharedWiFiClient() -> Retained<CWWiFiClient>;

        #[unsafe(method(interface))]
        pub fn interface(&self) -> Option<Retained<CWInterface>>;
    );
}

#[cfg(target_os = "macos")]
impl CWInterface {
    extern_methods!(
        #[unsafe(method(ssid))]
        pub fn ssid(&self) -> Option<Retained<NSString>>;
    );
}

#[cfg(target_os = "macos")]
thread_local! {
    static WIFI_LOCATION_MANAGER: RefCell<Option<Retained<CLLocationManager>>> = const { RefCell::new(None) };
}

#[cfg(target_os = "macos")]
fn with_macos_location_manager<F, R>(f: F) -> R
where
    F: FnOnce(&Retained<CLLocationManager>) -> R,
{
    WIFI_LOCATION_MANAGER.with(|cell| {
        let mut cell = cell.borrow_mut();
        if cell.is_none() {
            let manager: Retained<CLLocationManager> = unsafe { msg_send![class!(CLLocationManager), new] };
            *cell = Some(manager);
        }

        f(cell.as_ref().unwrap())
    })
}

#[tauri::command]
fn quit_app(app: tauri::AppHandle) {
    app.exit(0);
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
    let search_pattern = format!("%{}%", escape_like_pattern(&query));
    let mut stmt = conn.prepare(
        "SELECT id, title, content, created_at, updated_at FROM notes WHERE title LIKE ?1 ESCAPE '\\' OR content LIKE ?1 ESCAPE '\\' ORDER BY updated_at DESC"
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

fn escape_like_pattern(value: &str) -> String {
    value
        .replace('\\', "\\\\")
        .replace('%', "\\%")
        .replace('_', "\\_")
}

#[cfg(test)]
mod tests {
    use super::{
        escape_like_pattern, file_matches_query, is_safe_ai_read_path, parse_file_search_max_depth,
        read_ai_file_content, runtime_search_roots, score_file_relevance, search_roots_for_home,
        should_index_entry_name, truncate_string_to_byte_boundary, validate_ai_readable_file,
        FileInfo,
    };
    use std::path::PathBuf;

    #[test]
    fn escapes_like_wildcards_and_escape_character() {
        assert_eq!(
            escape_like_pattern(r"100%_done\today"),
            r"100\%\_done\\today"
        );
    }

    #[test]
    fn parses_file_search_depth_with_safe_bounds() {
        assert_eq!(parse_file_search_max_depth(None), 12);
        assert_eq!(parse_file_search_max_depth(Some("2".to_string())), 6);
        assert_eq!(parse_file_search_max_depth(Some("18".to_string())), 18);
        assert_eq!(parse_file_search_max_depth(Some("100".to_string())), 32);
        assert_eq!(parse_file_search_max_depth(Some("nope".to_string())), 12);
    }

    #[test]
    fn safe_ai_read_policy_rejects_hidden_and_secret_paths() {
        assert!(is_safe_ai_read_path(&PathBuf::from("/tmp/.hidden/notes.txt")).is_err());
        assert!(is_safe_ai_read_path(&PathBuf::from("/tmp/api_token.txt")).is_err());
        assert!(is_safe_ai_read_path(&PathBuf::from("/tmp/public-notes.txt")).is_ok());
    }

    #[test]
    fn file_matching_handles_nested_folder_case_and_unicode_forms() {
        let folder = FileInfo {
            name: "Ausgangsrechnungen".to_string(),
            path: "/Users/ricky/Documents/Beruflich/Selbststa\u{308}ndigkeit/Arickinda/Ausgangsrechnungen".to_string(),
            is_dir: true,
        };

        assert!(file_matches_query(&folder, "ausgangsrechnungen").is_some());

        let keywords = vec!["selbstständigkeit".to_string()];
        let name = "Ausgangsrechnungen".to_string();
        let path = folder.path.clone();
        assert!(score_file_relevance(&name, &path, &keywords).is_some());
    }

    #[test]
    fn search_roots_prioritize_user_document_folders_before_home() {
        let home = PathBuf::from("/Users/ricky");
        let roots = search_roots_for_home(&home);

        assert_eq!(roots.first(), Some(&home.join("Documents")));
        assert!(roots.contains(&home));
    }

    #[test]
    fn file_search_policy_skips_hidden_entries_but_keeps_user_documents() {
        assert!(!should_index_entry_name(".ssh"));
        assert!(!should_index_entry_name(".config"));
        assert!(!should_index_entry_name(".gnupg"));
        assert!(!should_index_entry_name(".hidden-note.txt"));
        assert!(should_index_entry_name("Documents"));
        assert!(should_index_entry_name("Ausgangsrechnungen"));
    }

    #[test]
    fn runtime_search_finds_nested_folder_without_index() {
        let base = std::env::temp_dir().join(format!(
            "gquick-runtime-file-search-test-{}",
            std::process::id()
        ));
        let target = base
            .join("Documents")
            .join("Beruflich")
            .join("Selbststa\u{308}ndigkeit")
            .join("Arickinda")
            .join("Ausgangsrechnungen");

        let _ = std::fs::remove_dir_all(&base);
        std::fs::create_dir_all(&target).unwrap();

        let results = runtime_search_roots(
            "ausgangsrechnungen",
            &[base.join("Documents")],
            12,
            10_000,
            10,
        );
        let _ = std::fs::remove_dir_all(&base);

        assert!(results.iter().any(|(file, _)| file
            .path
            .ends_with("Beruflich/Selbststa\u{308}ndigkeit/Arickinda/Ausgangsrechnungen")));
    }

    #[test]
    fn runtime_search_keeps_best_match_not_first_match() {
        let base = std::env::temp_dir().join(format!(
            "gquick-runtime-ranking-test-{}",
            std::process::id()
        ));
        let low_score_dir = base.join("needle-holder");
        let high_score_dir = base.join("later");
        let high_score_file = high_score_dir.join("needle");

        let _ = std::fs::remove_dir_all(&base);
        std::fs::create_dir_all(&low_score_dir).unwrap();
        std::fs::write(low_score_dir.join("alpha.txt"), "low").unwrap();
        std::fs::create_dir_all(&high_score_dir).unwrap();
        std::fs::write(&high_score_file, "high").unwrap();

        let results = runtime_search_roots("needle", &[base.clone()], 4, 10_000, 1);
        let _ = std::fs::remove_dir_all(&base);

        assert_eq!(results.len(), 1);
        assert_eq!(results[0].0.path, high_score_file.to_string_lossy());
    }

    #[test]
    fn runtime_search_skips_hidden_entries_with_jwalk() {
        let base = std::env::temp_dir().join(format!(
            "gquick-runtime-hidden-skip-test-{}",
            std::process::id()
        ));
        let hidden = base.join("Documents").join(".hidden");
        let visible = base.join("Documents").join("visible");

        let _ = std::fs::remove_dir_all(&base);
        std::fs::create_dir_all(&hidden).unwrap();
        std::fs::create_dir_all(&visible).unwrap();
        std::fs::write(hidden.join("needle.txt"), "hidden").unwrap();
        std::fs::write(visible.join("needle.txt"), "visible").unwrap();

        let results = runtime_search_roots("needle", &[base.join("Documents")], 4, 10_000, 10);
        let _ = std::fs::remove_dir_all(&base);

        assert!(results
            .iter()
            .any(|(file, _)| file.path.contains("visible")));
        assert!(!results
            .iter()
            .any(|(file, _)| file.path.contains(".hidden")));
    }

    #[test]
    fn runtime_search_gives_each_root_its_own_budget() {
        let base = std::env::temp_dir().join(format!(
            "gquick-runtime-root-budget-test-{}",
            std::process::id()
        ));
        let crowded_root = base.join("crowded");
        let exact_root = base.join("exact-root");
        let exact_file = exact_root.join("needle.txt");

        let _ = std::fs::remove_dir_all(&base);
        std::fs::create_dir_all(&crowded_root).unwrap();
        std::fs::create_dir_all(&exact_root).unwrap();
        for i in 0..8_200 {
            std::fs::write(crowded_root.join(format!("f-{i}.txt")), "filler").unwrap();
        }
        std::fs::write(&exact_file, "target").unwrap();

        let results = runtime_search_roots("needle", &[crowded_root, exact_root], 2, 9_000, 10);
        let _ = std::fs::remove_dir_all(&base);

        assert!(results
            .iter()
            .any(|(file, _)| file.path == exact_file.to_string_lossy()));
    }

    #[test]
    fn truncating_string_uses_utf8_boundaries() {
        let mut value = "abc😀def".to_string();

        assert!(truncate_string_to_byte_boundary(&mut value, 5));
        assert_eq!(value, "abc");
    }

    #[test]
    fn read_ai_file_content_truncates_at_utf8_boundary() {
        let base = std::env::current_dir()
            .unwrap()
            .join("target")
            .join(format!("gquick-utf8-truncate-test-{}", std::process::id()));
        let target = base.join("unicode.txt");

        let _ = std::fs::remove_dir_all(&base);
        std::fs::create_dir_all(&base).unwrap();
        std::fs::write(&target, "abc😀def").unwrap();

        let result = read_ai_file_content(&target, 5);
        let _ = std::fs::remove_dir_all(&base);

        assert_eq!(
            result.as_deref(),
            Some("abc\n... [file truncated, content too large] ...")
        );
    }

    #[cfg(unix)]
    #[test]
    fn validate_ai_readable_file_rejects_symlinks() {
        let base =
            std::env::temp_dir().join(format!("gquick-safe-read-test-{}", std::process::id()));
        let target = base.join("target.txt");
        let link = base.join("link.txt");

        std::fs::create_dir_all(&base).unwrap();
        std::fs::write(&target, "safe text").unwrap();
        std::os::unix::fs::symlink(&target, &link).unwrap();

        let result = validate_ai_readable_file(&link);
        let _ = std::fs::remove_dir_all(&base);

        assert!(result.is_err());
    }

    #[cfg(unix)]
    #[test]
    fn read_ai_file_content_rejects_symlinked_text_files() {
        let base = std::env::temp_dir().join(format!(
            "gquick-safe-content-read-test-{}",
            std::process::id()
        ));
        let target = base.join("target.txt");
        let link = base.join("link.txt");

        std::fs::create_dir_all(&base).unwrap();
        std::fs::write(&target, "safe text").unwrap();
        std::os::unix::fs::symlink(&target, &link).unwrap();

        let result = read_ai_file_content(&link, 100);
        let _ = std::fs::remove_dir_all(&base);

        assert!(result.is_none());
    }

    #[cfg(unix)]
    #[test]
    fn read_ai_file_content_rejects_symlinked_ancestor() {
        let base = std::env::current_dir()
            .unwrap()
            .join("target")
            .join(format!(
                "gquick-safe-ancestor-read-test-{}",
                std::process::id()
            ));
        let real_dir = base.join("real");
        let link_dir = base.join("link");
        let target = real_dir.join("notes.txt");
        let linked_path = link_dir.join("notes.txt");

        let _ = std::fs::remove_dir_all(&base);
        std::fs::create_dir_all(&real_dir).unwrap();
        std::fs::write(&target, "safe text").unwrap();
        std::os::unix::fs::symlink(&real_dir, &link_dir).unwrap();

        let result = read_ai_file_content(&linked_path, 100);
        let _ = std::fs::remove_dir_all(&base);

        assert!(result.is_none());
    }
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

#[derive(serde::Serialize, Clone)]
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
struct NetworkInfo {
    local_ip: String,
    public_ip: String,
    ssid: String,
    wifi_permission_state: String,
    latency: String,
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

use std::collections::{HashMap, HashSet};
use std::io::Read;
use std::net::IpAddr;
#[cfg(unix)]
use std::os::unix::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use unicode_normalization::UnicodeNormalization;

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

struct PreviousFocusState {
    target: Mutex<Option<PreviousFocusTarget>>,
}

#[cfg(target_os = "macos")]
#[derive(Clone, Debug)]
struct PreviousFocusTarget {
    bundle_identifier: String,
}

#[cfg(target_os = "windows")]
#[derive(Clone, Copy, Debug)]
struct PreviousFocusTarget {
    hwnd: usize,
}

#[cfg(target_os = "linux")]
#[derive(Clone, Debug)]
struct PreviousFocusTarget {
    window_id: String,
}

#[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
#[derive(Clone, Debug)]
struct PreviousFocusTarget;

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

struct AppsCacheState {
    apps: Mutex<Vec<AppInfo>>,
    last_updated: Mutex<Instant>,
}

const APPS_CACHE_TTL: Duration = Duration::from_secs(5);

const DEFAULT_FILE_SEARCH_MAX_DEPTH: usize = 12;
const MIN_FILE_SEARCH_MAX_DEPTH: usize = 6;
const MAX_FILE_SEARCH_MAX_DEPTH: usize = 32;
const RUNTIME_FILE_SEARCH_MAX_VISITED: usize = 25_000;
const FILE_SEARCH_RESULT_LIMIT: usize = 50;
const SMART_FILE_SEARCH_CANDIDATE_LIMIT: usize = 100;
const AI_READ_FILE_MAX_BYTES: usize = 200_000;
const AI_READ_FILE_DEFAULT_BYTES: usize = 100_000;

fn parse_file_search_max_depth(value: Option<String>) -> usize {
    value
        .and_then(|raw| raw.parse::<usize>().ok())
        .map(|depth| depth.clamp(MIN_FILE_SEARCH_MAX_DEPTH, MAX_FILE_SEARCH_MAX_DEPTH))
        .unwrap_or(DEFAULT_FILE_SEARCH_MAX_DEPTH)
}

fn configured_file_search_max_depth() -> usize {
    parse_file_search_max_depth(std::env::var("GQUICK_FILE_SEARCH_MAX_DEPTH").ok())
}

fn normalize_search_text(value: &str) -> String {
    value.nfc().collect::<String>().to_lowercase()
}

fn should_index_entry_name(name: &str) -> bool {
    !name.starts_with('.')
}

fn truncate_string_to_byte_boundary(value: &mut String, max_bytes: usize) -> bool {
    if value.len() <= max_bytes {
        return false;
    }

    let boundary = if value.is_char_boundary(max_bytes) {
        max_bytes
    } else {
        value
            .char_indices()
            .map(|(index, _)| index)
            .take_while(|index| *index < max_bytes)
            .last()
            .unwrap_or(0)
    };
    value.truncate(boundary);
    true
}

fn search_roots_for_home(home: &Path) -> Vec<PathBuf> {
    let priority_dirs = [
        "Documents",
        "Desktop",
        "Downloads",
        "Projects",
        "Coding",
        "Developer",
        "Pictures",
        "Movies",
        "Music",
    ];

    let mut roots: Vec<PathBuf> = priority_dirs.iter().map(|dir| home.join(dir)).collect();
    roots.push(home.to_path_buf());
    roots
}

fn default_search_roots() -> Vec<PathBuf> {
    #[cfg(target_os = "windows")]
    let home = std::env::var("USERPROFILE").ok();
    #[cfg(not(target_os = "windows"))]
    let home = std::env::var("HOME").ok();

    home.map(|home| search_roots_for_home(Path::new(&home)))
        .unwrap_or_default()
}

fn file_search_skip_dirs() -> std::collections::HashSet<&'static str> {
    [
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
        "proc",
        "sys",
        "dev",
        "run",
        "snap",
        "flatpak",
    ]
    .iter()
    .cloned()
    .collect()
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

fn path_has_hidden_component(path: &std::path::Path) -> bool {
    path.components().any(|component| {
        matches!(component, std::path::Component::Normal(name) if name.to_string_lossy().starts_with('.'))
    })
}

fn filename_contains_secret_marker(file_name_lower: &str) -> bool {
    let denied_exact = [
        ".env",
        "credentials",
        "credential",
        "secrets",
        "secret",
        "id_rsa",
        "id_dsa",
        "id_ecdsa",
        "id_ed25519",
        "known_hosts",
        "authorized_keys",
        "kubeconfig",
    ];
    let denied_fragments = [
        "credential",
        "credentials",
        "secret",
        "token",
        "apikey",
        "api_key",
        "access_key",
        "private_key",
        "client_secret",
        "authkey",
        "auth_key",
    ];

    denied_exact.contains(&file_name_lower)
        || file_name_lower.starts_with(".env")
        || denied_fragments
            .iter()
            .any(|fragment| file_name_lower.contains(fragment))
}

fn has_sensitive_extension(path: &std::path::Path) -> bool {
    let denied_extensions = [
        "pem", "key", "p12", "pfx", "crt", "cer", "der", "kdbx", "gpg", "asc", "age", "env",
    ];

    path.extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| denied_extensions.contains(&ext.to_lowercase().as_str()))
        .unwrap_or(false)
}

fn is_safe_ai_read_path(path: &std::path::Path) -> Result<(), String> {
    let file_name_lower = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or_default()
        .to_lowercase();

    if path_has_hidden_component(path) {
        return Err("Refusing to read hidden files or files inside hidden folders".to_string());
    }

    if filename_contains_secret_marker(&file_name_lower) || has_sensitive_extension(path) {
        return Err(
            "Refusing to read files that look like secrets, credentials, or keys".to_string(),
        );
    }

    Ok(())
}

#[cfg(test)]
fn validate_ai_readable_file(path: &std::path::Path) -> Result<std::fs::Metadata, String> {
    let (_file, metadata) = open_ai_readable_file(path)?;
    Ok(metadata)
}

#[cfg(unix)]
fn path_normal_components(path: &std::path::Path) -> Result<Vec<&std::ffi::OsStr>, String> {
    use std::path::Component;

    let mut components = Vec::new();
    for component in path.components() {
        match component {
            Component::RootDir | Component::Prefix(_) => {}
            Component::Normal(part) => components.push(part),
            Component::CurDir | Component::ParentDir => {
                return Err("Refusing to read paths containing . or ..".to_string());
            }
        }
    }

    if components.is_empty() {
        return Err("Cannot read a directory".to_string());
    }

    Ok(components)
}

#[cfg(unix)]
fn open_ai_readable_file_handle(path: &std::path::Path) -> Result<std::fs::File, String> {
    use std::ffi::CString;
    use std::os::fd::{AsRawFd, FromRawFd};
    use std::os::unix::ffi::OsStrExt;

    if !path.is_absolute() {
        return Err("File path must be absolute".to_string());
    }

    let components = path_normal_components(path)?;
    let mut dir = std::fs::File::open(std::path::Path::new("/"))
        .map_err(|_| "File could not be accessed or permission was denied".to_string())?;

    for component in &components[..components.len() - 1] {
        let name = CString::new(component.as_bytes())
            .map_err(|_| "Refusing to read paths containing NUL bytes".to_string())?;
        let fd = unsafe {
            libc::openat(
                dir.as_raw_fd(),
                name.as_ptr(),
                libc::O_RDONLY | libc::O_CLOEXEC | libc::O_NOFOLLOW | libc::O_DIRECTORY,
            )
        };

        if fd < 0 {
            return Err("Refusing to read through symlinked or invalid folders".to_string());
        }

        dir = unsafe { std::fs::File::from_raw_fd(fd) };
    }

    let final_name = CString::new(components[components.len() - 1].as_bytes())
        .map_err(|_| "Refusing to read paths containing NUL bytes".to_string())?;
    let fd = unsafe {
        libc::openat(
            dir.as_raw_fd(),
            final_name.as_ptr(),
            libc::O_RDONLY | libc::O_CLOEXEC | libc::O_NOFOLLOW,
        )
    };

    if fd < 0 {
        return Err("File could not be accessed or permission was denied".to_string());
    }

    Ok(unsafe { std::fs::File::from_raw_fd(fd) })
}

#[cfg(windows)]
fn path_normal_components(path: &std::path::Path) -> Result<Vec<&std::ffi::OsStr>, String> {
    use std::path::Component;

    let mut components = Vec::new();
    for component in path.components() {
        match component {
            Component::RootDir | Component::Prefix(_) => {}
            Component::Normal(part) => components.push(part),
            Component::CurDir | Component::ParentDir => {
                return Err("Refusing to read paths containing . or ..".to_string());
            }
        }
    }

    if components.is_empty() {
        return Err("Cannot read a directory".to_string());
    }

    Ok(components)
}

#[cfg(windows)]
fn metadata_is_reparse_point(metadata: &std::fs::Metadata) -> bool {
    use std::os::windows::fs::MetadataExt;

    const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x0000_0400;
    metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0
}

#[cfg(windows)]
fn open_no_follow_final(path: &std::path::Path) -> std::io::Result<std::fs::File> {
    use std::os::windows::fs::OpenOptionsExt;

    const FILE_FLAG_OPEN_REPARSE_POINT: u32 = 0x0020_0000;

    std::fs::OpenOptions::new()
        .read(true)
        .custom_flags(FILE_FLAG_OPEN_REPARSE_POINT)
        .open(path)
}

#[cfg(windows)]
fn open_ai_readable_file_handle(path: &std::path::Path) -> Result<std::fs::File, String> {
    if !path.is_absolute() {
        return Err("File path must be absolute".to_string());
    }

    let _components = path_normal_components(path)?;

    // Windows fallback: reject reparse-point ancestors immediately before final open.
    // A malicious same-user race between this check and open remains possible because std
    // does not expose component-by-component CreateFileW handles here.
    let mut ancestors: Vec<&std::path::Path> = path.ancestors().skip(1).collect();
    ancestors.reverse();
    for ancestor in ancestors {
        let metadata = std::fs::symlink_metadata(ancestor)
            .map_err(|_| "File could not be accessed or permission was denied".to_string())?;
        if metadata_is_reparse_point(&metadata) {
            return Err("Refusing to read through reparse-point folders".to_string());
        }
        if !metadata.is_dir() {
            return Err("Refusing to read through non-directory ancestors".to_string());
        }
    }

    open_no_follow_final(path)
        .map_err(|_| "File could not be accessed or permission was denied".to_string())
}

#[cfg(not(any(unix, windows)))]
fn path_normal_components(path: &std::path::Path) -> Result<Vec<&std::ffi::OsStr>, String> {
    use std::path::Component;

    let mut components = Vec::new();
    for component in path.components() {
        match component {
            Component::RootDir | Component::Prefix(_) => {}
            Component::Normal(part) => components.push(part),
            Component::CurDir | Component::ParentDir => {
                return Err("Refusing to read paths containing . or ..".to_string());
            }
        }
    }

    if components.is_empty() {
        return Err("Cannot read a directory".to_string());
    }

    Ok(components)
}

#[cfg(not(any(unix, windows)))]
fn open_ai_readable_file_handle(path: &std::path::Path) -> Result<std::fs::File, String> {
    if !path.is_absolute() {
        return Err("File path must be absolute".to_string());
    }

    let _components = path_normal_components(path)?;
    let metadata = std::fs::symlink_metadata(path)
        .map_err(|_| "File could not be accessed or permission was denied".to_string())?;
    if metadata.file_type().is_symlink() {
        return Err("Refusing to read symlinked files".to_string());
    }

    std::fs::OpenOptions::new()
        .read(true)
        .open(path)
        .map_err(|_| "File could not be accessed or permission was denied".to_string())
}

fn validate_opened_ai_file_metadata(metadata: &std::fs::Metadata) -> Result<(), String> {
    if metadata.file_type().is_symlink() {
        return Err("Refusing to read symlinked files".to_string());
    }

    #[cfg(windows)]
    {
        if metadata_is_reparse_point(metadata) {
            return Err("Refusing to read reparse-point files".to_string());
        }
    }

    if metadata.is_dir() {
        return Err("Cannot read a directory".to_string());
    }

    if !metadata.is_file() {
        return Err("Refusing to read non-regular files".to_string());
    }

    Ok(())
}

fn open_ai_readable_file(
    path: &std::path::Path,
) -> Result<(std::fs::File, std::fs::Metadata), String> {
    is_safe_ai_read_path(path)?;

    let file = open_ai_readable_file_handle(path)?;
    let metadata = file
        .metadata()
        .map_err(|_| "File could not be accessed or permission was denied".to_string())?;

    validate_opened_ai_file_metadata(&metadata)?;

    Ok((file, metadata))
}

fn read_opened_text_content(mut file: std::fs::File, max_size: usize) -> Option<String> {
    use std::io::Read;

    let read_limit = max_size.saturating_add(1) as u64;
    let mut buffer = Vec::with_capacity(max_size.min(64 * 1024));
    file.by_ref()
        .take(read_limit)
        .read_to_end(&mut buffer)
        .ok()?;

    let truncated = buffer.len() > max_size;
    if truncated {
        buffer.truncate(max_size);
    }

    if buffer.iter().any(|byte| *byte == 0) {
        return None;
    }

    let mut content = match String::from_utf8(buffer) {
        Ok(content) => content,
        Err(err) if truncated && err.utf8_error().error_len().is_none() => {
            let valid_up_to = err.utf8_error().valid_up_to();
            let mut bytes = err.into_bytes();
            bytes.truncate(valid_up_to);
            String::from_utf8(bytes).ok()?
        }
        Err(_) => return None,
    };
    if truncated {
        content.push_str("\n... [file truncated, content too large] ...");
    }

    Some(content)
}

fn read_ai_file_content(path: &std::path::Path, max_size: usize) -> Option<String> {
    if !is_text_file(path) {
        return None;
    }

    let (file, _metadata) = open_ai_readable_file(path).ok()?;
    read_opened_text_content(file, max_size)
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

    normalize_search_text(query)
        .split_whitespace()
        .filter(|word| {
            let w = word.trim_matches(|c: char| !c.is_alphanumeric());
            w.len() > 1 && !stop_words.contains(w)
        })
        .map(|s| s.to_string())
        .collect()
}

fn score_file_relevance(name: &str, path: &str, keywords: &[String]) -> Option<i32> {
    if keywords.is_empty() {
        // If no meaningful keywords, fall back to checking if the full query matches
        return None;
    }

    let name_lower = normalize_search_text(name);
    let path_lower = normalize_search_text(path);

    let mut score = 0i32;
    let mut matched_keywords = 0;

    for keyword in keywords {
        let kw_lower = normalize_search_text(keyword);

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

fn file_matches_query(file: &FileInfo, query: &str) -> Option<i32> {
    let query_lower = normalize_search_text(query);
    let keywords = extract_meaningful_keywords(query);

    let mut score =
        if let Some(keyword_score) = score_file_relevance(&file.name, &file.path, &keywords) {
            keyword_score
        } else {
            let name_lower = normalize_search_text(&file.name);
            let path_lower = normalize_search_text(&file.path);

            if name_lower == query_lower {
                1000
            } else if name_lower.starts_with(&query_lower) {
                500
            } else if name_lower.contains(&query_lower) {
                300
            } else if path_lower.contains(&query_lower) {
                100
            } else {
                return None;
            }
        };

    if file.is_dir {
        score += 10;
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

fn runtime_search_roots(
    query: &str,
    roots: &[PathBuf],
    max_depth: usize,
    max_visited: usize,
    result_limit: usize,
) -> Vec<(FileInfo, i32)> {
    let skip_dirs = file_search_skip_dirs();
    let mut results = Vec::new();
    let mut seen_paths = HashSet::new();
    let mut visited = 0usize;
    let query_basename = normalize_search_text(query.trim());

    for root in roots {
        if visited >= max_visited {
            break;
        }
        if !root.exists() {
            continue;
        }

        let root_budget = max_visited.saturating_sub(visited).min(8_000).max(500);
        let mut root_visited = 0usize;
        let skip_dirs = skip_dirs.clone();
        let walker = jwalk::WalkDir::new(root)
            .max_depth(max_depth)
            .follow_links(false)
            .process_read_dir(move |_depth, _path, _read_dir_state, children| {
                children.retain(|entry| {
                    let Ok(entry) = entry else {
                        return false;
                    };
                    let name = entry.file_name.to_string_lossy();
                    should_index_entry_name(name.as_ref()) && !skip_dirs.contains(name.as_ref())
                });
            })
            .into_iter();

        for entry in walker {
            if visited >= max_visited || root_visited >= root_budget {
                break;
            }

            let Ok(entry) = entry else {
                continue;
            };
            visited += 1;
            root_visited += 1;

            if entry.file_type().is_symlink() {
                continue;
            }

            let path = entry.path();
            if !seen_paths.insert(path.to_path_buf()) {
                continue;
            }

            let Some(name) = path.file_name() else {
                continue;
            };
            let name_str = name.to_string_lossy().to_string();
            if !should_index_entry_name(&name_str) {
                continue;
            }

            let file = FileInfo {
                name: name_str,
                path: path.to_string_lossy().to_string(),
                is_dir: entry.file_type().is_dir(),
            };

            if let Some(score) = file_matches_query(&file, query) {
                // Runtime results get small boost because priority roots are searched first.
                results.push((file, score + 25));
                results.sort_by(|a, b| b.1.cmp(&a.1));
                results.truncate(result_limit);

                let has_exact = results
                    .iter()
                    .any(|(file, _)| normalize_search_text(&file.name) == query_basename);
                if has_exact && root_visited > 1_500 {
                    break;
                }
            }
        }
    }

    results.sort_by(|a, b| b.1.cmp(&a.1));
    results.truncate(result_limit);
    results
}

fn runtime_search_files(query: &str, result_limit: usize) -> Vec<(FileInfo, i32)> {
    runtime_search_roots(
        query,
        &default_search_roots(),
        configured_file_search_max_depth(),
        RUNTIME_FILE_SEARCH_MAX_VISITED,
        result_limit,
    )
}

fn path_is_under_search_roots(path: &Path) -> bool {
    let Ok(canonical_path) = std::fs::canonicalize(path) else {
        return false;
    };

    default_search_roots()
        .iter()
        .filter_map(|root| std::fs::canonicalize(root).ok())
        .any(|root| canonical_path.starts_with(root))
}

#[tauri::command]
async fn search_files(app: tauri::AppHandle, query: String) -> Result<Vec<FileInfo>, String> {
    run_blocking(move || search_files_blocking(app, query)).await?
}

#[tauri::command]
async fn launcher_search_files(
    app: tauri::AppHandle,
    query: String,
) -> Result<Vec<FileInfo>, String> {
    run_blocking(move || launcher_search_files_blocking(app, query)).await?
}

fn search_files_blocking(_app: tauri::AppHandle, query: String) -> Result<Vec<FileInfo>, String> {
    let runtime_matches = runtime_search_files(&query, FILE_SEARCH_RESULT_LIMIT);
    Ok(runtime_matches.into_iter().map(|(file, _)| file).collect())
}

fn launcher_search_files_blocking(
    _app: tauri::AppHandle,
    query: String,
) -> Result<Vec<FileInfo>, String> {
    let runtime_matches = runtime_search_files(&query, FILE_SEARCH_RESULT_LIMIT);
    Ok(runtime_matches.into_iter().map(|(file, _)| file).collect())
}

#[tauri::command]
async fn smart_search_files(
    app: tauri::AppHandle,
    query: String,
) -> Result<Vec<SmartFileInfo>, String> {
    run_blocking(move || smart_search_files_blocking(app, query)).await?
}

fn smart_search_files_blocking(
    _app: tauri::AppHandle,
    query: String,
) -> Result<Vec<SmartFileInfo>, String> {
    let time_filter = parse_time_filter(&query);

    let candidates = runtime_search_files(&query, SMART_FILE_SEARCH_CANDIDATE_LIMIT);
    let mut results = Vec::with_capacity(candidates.len());

    for (file_info, _score) in candidates {
        let path = std::path::Path::new(&file_info.path);

        // Get metadata without following symlinks. Symlink candidates can only come from stale indexes.
        let metadata = match std::fs::symlink_metadata(path) {
            Ok(meta) if meta.file_type().is_symlink() => continue,
            Ok(meta) => meta,
            Err(_) => continue,
        };

        let is_dir = metadata.is_dir();

        let (created, modified, size) = {
            let meta = &metadata;
            let created = meta.created().ok().and_then(system_time_to_iso);
            let modified = meta.modified().ok().and_then(system_time_to_iso);
            let size = meta.len();
            (created, modified, size)
        };

        /*
         * Unsafe filenames still return metadata-only so search results remain predictable,
         * but no file content is read or sent to the AI provider.
         */
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

        // Safe reader opens with no-follow semantics, validates handle metadata, then reads from that same handle.
        let (content_preview, full_content) = if is_dir {
            (None, None)
        } else {
            let full = read_ai_file_content(path, 100_000);
            let preview = full.as_ref().map(|c| {
                let mut s = c.replace(['\n', '\r', '\t'], " ");
                if truncate_string_to_byte_boundary(&mut s, 3000) {
                    s.push_str("...");
                }
                s
            });
            (preview, full)
        };

        results.push(SmartFileInfo {
            name: file_info.name,
            path: file_info.path,
            is_dir,
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
async fn read_file(path: String, max_bytes: Option<usize>) -> Result<String, String> {
    run_blocking(move || read_file_blocking(path, max_bytes)).await?
}

fn read_file_blocking(path: String, max_bytes: Option<usize>) -> Result<String, String> {
    let path = std::path::Path::new(&path);

    if !path.is_absolute() {
        return Err("File path must be an absolute path returned by search_files".to_string());
    }

    is_safe_ai_read_path(path)?;

    if !path_is_under_search_roots(path) {
        return Err("File is outside searchable user folders".to_string());
    }

    let limit = max_bytes
        .unwrap_or(AI_READ_FILE_DEFAULT_BYTES)
        .clamp(1, AI_READ_FILE_MAX_BYTES);

    read_ai_file_content(path, limit).ok_or_else(|| {
        "File could not be read as text, is too large, or permission was denied".to_string()
    })
}

#[derive(serde::Serialize)]
struct WebSearchResult {
    title: String,
    url: String,
    snippet: String,
}

#[tauri::command]
async fn web_search(query: String) -> Result<Vec<WebSearchResult>, String> {
    let trimmed = query.trim();
    if trimmed.is_empty() {
        return Err("Search query cannot be empty.".to_string());
    }

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .user_agent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36")
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {e}"))?;

    let mut url = reqwest::Url::parse("https://html.duckduckgo.com/html/")
        .map_err(|e| format!("Failed to parse search URL: {e}"))?;
    url.query_pairs_mut().append_pair("q", trimmed);

    let response = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("Web search request failed: {e}"))?;

    let status = response.status();
    if !status.is_success() {
        return Err(format!("Web search returned HTTP {}.", status.as_u16()));
    }

    let html = response
        .text()
        .await
        .map_err(|e| format!("Failed to read web search response: {e}"))?;

    let document = scraper::Html::parse_document(&html);
    let result_selector = scraper::Selector::parse(".result")
        .map_err(|_| "Failed to parse result selector".to_string())?;
    let title_selector = scraper::Selector::parse(".result__title > a")
        .map_err(|_| "Failed to parse title selector".to_string())?;
    let url_selector = scraper::Selector::parse(".result__url")
        .map_err(|_| "Failed to parse URL selector".to_string())?;
    let snippet_selector = scraper::Selector::parse(".result__snippet")
        .map_err(|_| "Failed to parse snippet selector".to_string())?;

    let mut results = Vec::new();

    for result in document.select(&result_selector).take(8) {
        let title = result
            .select(&title_selector)
            .next()
            .map(|el| el.text().collect::<String>().trim().to_string())
            .unwrap_or_default();

        let url = result
            .select(&url_selector)
            .next()
            .map(|el| el.text().collect::<String>().trim().to_string())
            .or_else(|| {
                result
                    .select(&title_selector)
                    .next()
                    .and_then(|el| el.value().attr("href"))
                    .map(|s| s.to_string())
            })
            .unwrap_or_default();

        let snippet = result
            .select(&snippet_selector)
            .next()
            .map(|el| el.text().collect::<String>().trim().to_string())
            .unwrap_or_default();

        if title.is_empty() && url.is_empty() {
            continue;
        }

        results.push(WebSearchResult {
            title,
            url,
            snippet,
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

#[cfg(unix)]
fn terminate_process_tree(child: &mut Child) {
    let pid = child.id() as i32;
    unsafe {
        libc::kill(-pid, libc::SIGTERM);
    }
    let started = Instant::now();
    while started.elapsed() <= Duration::from_millis(300) {
        if matches!(child.try_wait(), Ok(Some(_))) {
            return;
        }
        std::thread::sleep(Duration::from_millis(25));
    }
    unsafe {
        libc::kill(-pid, libc::SIGKILL);
    }
}

#[cfg(target_os = "windows")]
fn terminate_process_tree(child: &mut Child) {
    let _ = Command::new("taskkill")
        .args(["/PID", &child.id().to_string(), "/T", "/F"])
        .status();
}

#[cfg(not(any(unix, target_os = "windows")))]
fn terminate_process_tree(child: &mut Child) {
    let _ = child.kill();
}

fn command_stdout_with_timeout(mut command: Command, timeout: Duration) -> Option<String> {
    #[cfg(unix)]
    unsafe {
        // Run each command in a new process group so timeout cleanup can stop
        // shell pipelines and child commands, not only the direct child.
        command.pre_exec(|| {
            if libc::setsid() == -1 {
                Err(std::io::Error::last_os_error())
            } else {
                Ok(())
            }
        });
    }

    let mut child = command
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .ok()?;
    let mut stdout_handle = child.stdout.take().map(read_pipe);
    let started = Instant::now();

    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                let stdout = stdout_handle.take()?.join().ok()?.ok()?;
                return status.success().then_some(stdout.trim().to_string());
            }
            Ok(None) if started.elapsed() <= timeout => {
                std::thread::sleep(Duration::from_millis(50));
            }
            _ => {
                terminate_process_tree(&mut child);
                let _ = child.wait();
                if let Some(handle) = stdout_handle.take() {
                    let _ = handle.join();
                }
                return None;
            }
        }
    }
}

fn command_stdout(program: &str, args: &[&str], timeout: Duration) -> Option<String> {
    let mut command = Command::new(program);
    command.args(args);
    command_stdout_with_timeout(command, timeout).filter(|output| !output.trim().is_empty())
}

fn shell_stdout(command: &str, timeout: Duration) -> Option<String> {
    command_stdout_with_timeout(platform_shell_command(command), timeout)
        .filter(|output| !output.trim().is_empty())
}

fn first_non_empty_command(commands: &[&str], timeout: Duration) -> Option<String> {
    commands
        .iter()
        .find_map(|command| shell_stdout(command, timeout))
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn parse_ping_latency(output: &str) -> Option<String> {
    let lower = output.to_lowercase();
    let markers = ["time=", "time<"];

    for marker in markers {
        if let Some(start) = lower.find(marker) {
            let value_start = start + marker.len();
            let value = lower[value_start..]
                .split_whitespace()
                .next()
                .unwrap_or_default()
                .trim_end_matches("ms")
                .trim();

            if !value.is_empty() {
                return Some(format!("{} ms", value));
            }
        }
    }

    None
}

fn normalize_unavailable(value: Option<String>) -> String {
    value
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "Unavailable".to_string())
}

#[cfg(target_os = "macos")]
fn parse_macos_default_interface(route_output: &str) -> Option<String> {
    route_output.lines().find_map(|line| {
        let trimmed = line.trim();
        trimmed
            .strip_prefix("interface:")
            .map(str::trim)
            .filter(|iface| !iface.is_empty())
            .map(ToOwned::to_owned)
    })
}

#[cfg(target_os = "macos")]
fn parse_macos_wifi_ssid_value(value: &str) -> Option<String> {
    let ssid = value.trim();
    let lower = ssid.to_lowercase();

    (!ssid.is_empty()
        && !is_redacted_ssid(ssid)
        && !lower.contains("not associated")
        && !lower.contains("could not find")
        && !lower.contains("error")
        && !lower.contains("inactive")
        && !lower.contains("unsupported"))
    .then_some(ssid.to_string())
}

#[cfg(target_os = "macos")]
fn is_redacted_ssid(value: &str) -> bool {
    let normalized = value.trim().trim_matches(['"', '\'']);
    let lower = normalized.to_lowercase();

    normalized.is_empty()
        || lower == "<redacted>"
        || lower == "redacted"
        || lower == "unavailable"
        || lower == "unknown"
        || lower.contains("redacted")
}

#[cfg(target_os = "macos")]
fn parse_macos_wifi_ssid(output: &str) -> Option<String> {
    let trimmed = output.trim();

    if let Some(ssid) = trimmed.strip_prefix("Current Wi-Fi Network:") {
        return parse_macos_wifi_ssid_value(ssid);
    }

    trimmed
        .lines()
        .find_map(|line| line.trim().strip_prefix("Current Wi-Fi Network:").and_then(parse_macos_wifi_ssid_value))
}

#[cfg(target_os = "macos")]
fn parse_macos_summary_field(line: &str, label: &str) -> Option<String> {
    let trimmed = line.trim();
    let rest = trimmed.strip_prefix(label)?;
    let rest = rest.trim_start();
    let rest = rest.strip_prefix(':')?.trim();
    parse_macos_wifi_ssid_value(rest)
}

#[cfg(target_os = "macos")]
fn parse_macos_ipconfig_summary_ssid(output: &str) -> Option<String> {
    output.lines().find_map(|line| {
        parse_macos_summary_field(line, "SSID")
            .or_else(|| parse_macos_summary_field(line, "NetworkID"))
    })
}

#[cfg(target_os = "macos")]
fn detect_macos_wifi_ssid_native() -> Option<String> {
    let authorized = macos_location_authorized();
    if !authorized {
        return None;
    }

    let client = CWWiFiClient::sharedWiFiClient();
    let interface = client.interface()?;
    let ssid = interface.ssid()?;
    parse_macos_wifi_ssid_value(&ssid.to_string())
}

#[cfg(target_os = "macos")]
fn macos_location_services_enabled() -> bool {
    unsafe { msg_send![class!(CLLocationManager), locationServicesEnabled] }
}

#[cfg(target_os = "macos")]
fn macos_location_authorization_status() -> isize {
    unsafe { msg_send![class!(CLLocationManager), authorizationStatus] }
}

#[cfg(target_os = "macos")]
fn macos_location_authorized() -> bool {
    matches!(
        macos_location_authorization_status(),
        3 | 4
    )
}

#[cfg(target_os = "macos")]
fn request_macos_location_permission_if_needed() {
    if !macos_location_services_enabled() || macos_location_authorization_status() != 0 {
        return;
    }

    with_macos_location_manager(|manager| {
        unsafe {
            if pthread_main_np() != 0 {
                let _: () = msg_send![&**manager, requestWhenInUseAuthorization];
            } else {
                let _: () = msg_send![&**manager,
                    performSelectorOnMainThread: sel!(requestWhenInUseAuthorization),
                    withObject: std::ptr::null_mut::<c_void>(),
                    waitUntilDone: true
                ];
            }
        }
    });
}

#[cfg(target_os = "macos")]
fn macos_wifi_permission_needed_message() -> String {
    "Wi-Fi Permission needed".to_string()
}

#[cfg(target_os = "macos")]
fn macos_wifi_permission_state() -> &'static str {
    if !macos_location_services_enabled() {
        return "disabled";
    }

    match macos_location_authorization_status() {
        3 | 4 => "granted",
        0 => "needed",
        1 | 2 => "denied",
        _ => "unknown",
    }
}

#[cfg(target_os = "macos")]
fn open_macos_location_settings() -> Result<(), String> {
    let status = Command::new("open")
        .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_LocationServices")
        .status()
        .map_err(|e| format!("Failed to open System Settings: {e}"))?;

    if status.success() {
        Ok(())
    } else {
        Err("Failed to open System Settings".to_string())
    }
}

#[tauri::command]
fn request_wifi_permission() -> Result<String, String> {
    #[cfg(target_os = "macos")]
    {
        let prompted = macos_location_authorization_status() == 0;
        request_macos_location_permission_if_needed();

        if !prompted && !macos_location_authorized() {
            let _ = open_macos_location_settings();
        }

        return Ok(if prompted {
            "prompted".to_string()
        } else {
            macos_wifi_permission_state().to_string()
        });
    }

    #[cfg(not(target_os = "macos"))]
    {
        Ok("not-applicable".to_string())
    }
}

#[tauri::command]
fn open_wifi_privacy_settings() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        open_macos_location_settings()
    }

    #[cfg(not(target_os = "macos"))]
    {
        Ok(())
    }
}

/// Detect Wi-Fi SSID by finding the actual Wi-Fi interface, not the default route.
/// Wi-Fi can be connected but not be the default route (e.g. Ethernet is default).
#[cfg(target_os = "macos")]
fn detect_macos_wifi_ssid(timeout: Duration) -> Option<String> {
    if !macos_location_authorized() {
        return None;
    }

    // Strategy 1: Native CoreWLAN API. Avoids command-line redaction.
    if let Some(ssid) = detect_macos_wifi_ssid_native() {
        return Some(ssid);
    }

    // Strategy 2: Fast path from ipconfig summary on actual Wi-Fi device.
    if let Some(wifi_device) = find_macos_wifi_device(timeout) {
        if let Some(output) = command_stdout("ipconfig", &["getsummary", &wifi_device], timeout) {
            if let Some(ssid) = parse_macos_ipconfig_summary_ssid(&output) {
                return Some(ssid);
            }
        }
    }

    // Strategy 3: Parse SSID from system_profiler AirPort data.
    if let Some(output) = shell_stdout("system_profiler SPAirPortDataType 2>/dev/null", timeout) {
        if let Some(ssid) = parse_system_profiler_ssid(&output) {
            return Some(ssid);
        }
    }

    // Strategy 4: Resolve Wi-Fi service name, then query service.
    if let Some(service_name) = find_macos_wifi_service_name(timeout) {
        if let Some(output) =
            command_stdout("networksetup", &["-getairportnetwork", &service_name], timeout)
        {
            if let Some(ssid) = parse_macos_wifi_ssid(&output) {
                return Some(ssid);
            }
        }
    }

    // Strategy 5: Try wdutil / airport.
    if let Some(output) = shell_stdout("wdutil info 2>/dev/null", timeout) {
        if let Some(ssid) = parse_wifi_tool_ssid(&output) {
            return Some(ssid);
        }
    }

    if let Some(output) = command_stdout(
        "/System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport",
        &["-I"],
        timeout,
    ) {
        if let Some(ssid) = parse_wifi_tool_ssid(&output) {
            return Some(ssid);
        }
    }

    None
}

/// Find Wi-Fi service name by mapping `networksetup -listnetworkserviceorder` to Wi-Fi device.
#[cfg(target_os = "macos")]
fn find_macos_wifi_service_name(timeout: Duration) -> Option<String> {
    let wifi_device = find_macos_wifi_device(timeout)?;
    let output = command_stdout("networksetup", &["-listnetworkserviceorder"], timeout)?;

    let mut current_service: Option<String> = None;
    for line in output.lines() {
        let trimmed = line.trim();

        if let Some(service_name) = parse_macos_service_order_line(trimmed) {
            current_service = Some(service_name);
            continue;
        }

        if let Some(port_and_device) = trimmed.strip_prefix("(Hardware Port: ") {
            let Some(service_name) = current_service.as_ref() else {
                continue;
            };

            let port_and_device = port_and_device.trim_end_matches(')');
            let Some((hardware_port, device)) = port_and_device.split_once(", Device: ") else {
                continue;
            };

            let hardware_port_lower = hardware_port.trim().to_lowercase();
            let device = device.trim();

            if device == wifi_device
                && (hardware_port_lower.contains("airport") || hardware_port_lower.contains("wi-fi"))
            {
                return Some(service_name.clone());
            }
        }
    }

    None
}

#[cfg(target_os = "macos")]
fn parse_macos_service_order_line(line: &str) -> Option<String> {
    let line = line.trim();
    let rest = line.strip_prefix('(')?;
    let (index, service_name) = rest.split_once(") ")?;

    if index.chars().all(|ch| ch.is_ascii_digit()) {
        let service_name = service_name.trim();
        if !service_name.is_empty() {
            return Some(service_name.to_string());
        }
    }

    None
}

/// Find Wi-Fi BSD device name by parsing `networksetup -listallhardwareports`.
#[cfg(target_os = "macos")]
fn find_macos_wifi_device(timeout: Duration) -> Option<String> {
    let output = command_stdout("networksetup", &["-listallhardwareports"], timeout)?;

    let mut wifi_port = false;
    for line in output.lines() {
        let trimmed = line.trim();

        if let Some(port) = trimmed.strip_prefix("Hardware Port:") {
            let lower = port.trim().to_lowercase();
            wifi_port = lower.contains("airport") || lower.contains("wi-fi");
            continue;
        }

        if wifi_port {
            if let Some(device) = trimmed.strip_prefix("Device:") {
                let iface = device.trim();
                if !iface.is_empty() {
                    return Some(iface.to_string());
                }
            }
        }
    }

    None
}

/// Parse SSID from `system_profiler SPAirPortDataType` output.
/// Looks for "SSID: " under "Current Network Information".
#[cfg(target_os = "macos")]
fn parse_system_profiler_ssid(output: &str) -> Option<String> {
    let mut in_current_network = false;
    let mut current_network_indent: Option<usize> = None;

    const IGNORED_KEYS: &[&str] = &[
        "PHY Mode",
        "Channel",
        "Country Code",
        "Network Type",
        "Security",
        "Signal / Noise",
        "Transmit Rate",
        "MCS Index",
        "SSID",
        "BSSID",
        "RSSI",
        "Noise",
        "HT",
        "MIMO",
        "NSS",
        "DFS",
        "State",
        "Mode",
    ];

    for line in output.lines() {
        let trimmed = line.trim();
        let indent = line.chars().take_while(|ch| ch.is_whitespace()).count();

        if trimmed.contains("Current Network Information") {
            in_current_network = true;
            current_network_indent = Some(indent);
            continue;
        }

        if in_current_network {
            // End of the current network block (next section at same or lower indent)
            if !trimmed.is_empty()
                && current_network_indent.is_some_and(|base| indent <= base)
                && !trimmed.ends_with(':')
            {
                break;
            }

            if let Some(ssid_value) = trimmed
                .strip_prefix("SSID:")
                .or_else(|| trimmed.strip_prefix("SSID :"))
            {
                if let Some(ssid) = parse_macos_wifi_ssid_value(ssid_value) {
                    return Some(ssid);
                }
            }

            if trimmed.ends_with(':') {
                let label = trimmed.trim_end_matches(':').trim();
                let lower_label = label.to_lowercase();
                let is_known_key = IGNORED_KEYS.iter().any(|key| lower_label == key.to_lowercase());

                if !label.is_empty() && !is_known_key {
                    if let Some(ssid) = parse_macos_wifi_ssid_value(label) {
                        return Some(ssid);
                    }
                }
            }
        }
    }

    None
}

#[cfg(target_os = "macos")]
fn parse_wifi_tool_ssid(output: &str) -> Option<String> {
    output.lines().find_map(|line| {
        let trimmed = line.trim();
        trimmed
            .strip_prefix("SSID:")
            .or_else(|| trimmed.strip_prefix("SSID :"))
            .map(str::trim)
            .and_then(parse_macos_wifi_ssid_value)
    })
}

fn get_local_network_info() -> NetworkInfo {
    let timeout = Duration::from_millis(1_500);
    let ping_timeout = Duration::from_millis(2_000);

    #[cfg(target_os = "macos")]
    let (local_ip, ssid, ping_output) = {
        let wifi_permission_state = macos_wifi_permission_state().to_string();

        let default_iface = command_stdout("route", &["-n", "get", "default"], timeout)
            .as_deref()
            .and_then(parse_macos_default_interface);
        let local_ip = default_iface
            .as_deref()
            .and_then(|iface| command_stdout("ipconfig", &["getifaddr", iface], timeout))
            .or_else(|| {
                first_non_empty_command(
                    &[
                        "ipconfig getifaddr en0",
                        "ipconfig getifaddr en1",
                        "ifconfig | awk '/inet / && $2 != \"127.0.0.1\" {print $2; exit}'",
                    ],
                    timeout,
                )
            });
        // Wi-Fi can be connected but not the default route (e.g. Ethernet is default).
        // Detect the actual Wi-Fi interface instead of assuming it's the default interface.
        let ssid = if wifi_permission_state == "granted" {
            detect_macos_wifi_ssid(timeout)
                .or_else(|| Some("Unavailable".to_string()))
        } else {
            Some(macos_wifi_permission_needed_message())
        };
        let ping_output =
            command_stdout("ping", &["-c", "1", "-W", "1000", "1.1.1.1"], ping_timeout);
        (local_ip, ssid, ping_output)
    };

    #[cfg(target_os = "windows")]
    let (local_ip, ssid, ping_output) = {
        let local_ip = shell_stdout("powershell -NoProfile -Command \"(Get-NetIPConfiguration | Where-Object {$_.IPv4DefaultGateway -and $_.IPv4Address} | Select-Object -First 1).IPv4Address.IPAddress\"", timeout);
        let ssid = shell_stdout("netsh wlan show interfaces | powershell -NoProfile -Command \"$input | Where-Object {$_ -match '^\\s*SSID\\s*:' -and $_ -notmatch 'BSSID'} | Select-Object -First 1 | ForEach-Object {($_ -split ':',2)[1].Trim()}\"", timeout);
        let ping_output = shell_stdout("ping -n 1 -w 1000 1.1.1.1", ping_timeout);
        (local_ip, ssid, ping_output)
    };

    #[cfg(target_os = "linux")]
    let (local_ip, ssid, ping_output) = {
        let local_ip = first_non_empty_command(&[
            "hostname -I | awk '{print $1}'",
            "ip route get 1.1.1.1 | awk '{for (i=1; i<=NF; i++) if ($i == \"src\") {print $(i+1); exit}}'",
        ], timeout);
        let ssid = first_non_empty_command(
            &[
                "iwgetid -r",
                "nmcli -t -f active,ssid dev wifi | awk -F: '$1 == \"yes\" {print $2; exit}'",
            ],
            timeout,
        );
        let ping_output = shell_stdout("ping -c 1 -W 1 1.1.1.1", ping_timeout);
        (local_ip, ssid, ping_output)
    };

    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    let (local_ip, ssid, ping_output) = (None, None, None);

    #[cfg(not(target_os = "macos"))]
    let wifi_permission_state = "granted".to_string();

    #[cfg(target_os = "macos")]
    let wifi_permission_state = macos_wifi_permission_state().to_string();

    NetworkInfo {
        local_ip: normalize_unavailable(local_ip),
        public_ip: "Unavailable".to_string(),
        ssid: normalize_unavailable(ssid),
        wifi_permission_state,
        latency: normalize_unavailable(ping_output.as_deref().and_then(parse_ping_latency)),
    }
}

async fn get_public_ip() -> Option<String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_millis(1_500))
        .build()
        .ok()?;
    let response = client.get("https://api.ipify.org").send().await.ok()?;
    if !response.status().is_success() {
        return None;
    }

    let body = response.text().await.ok()?;
    let ip = body.trim();

    ip.parse::<IpAddr>().ok().map(|addr| addr.to_string())
}

#[tauri::command]
async fn get_network_info() -> Result<NetworkInfo, String> {
    let mut info = run_blocking(get_local_network_info).await?;
    if let Some(public_ip) = get_public_ip().await {
        info.public_ip = public_ip;
    }

    Ok(info)
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
                Err(std::io::Error::last_os_error())
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

fn record_previous_focus<R: Runtime>(app: &tauri::AppHandle<R>) {
    let Some(state) = app.try_state::<PreviousFocusState>() else {
        return;
    };
    let target = capture_previous_focus_target();
    match state.target.lock() {
        Ok(mut previous) => *previous = target,
        Err(_) => {}
    };
}

fn restore_previous_focus<R: Runtime>(app: &tauri::AppHandle<R>) {
    let Some(state) = app.try_state::<PreviousFocusState>() else {
        return;
    };
    let target = state
        .target
        .lock()
        .ok()
        .and_then(|mut previous| previous.take());
    if let Some(target) = target {
        restore_previous_focus_target(target);
    }
}

fn hide_window<R: Runtime>(window: &tauri::Window<R>, restore_focus: bool) -> Result<(), String> {
    window.hide().map_err(|e| e.to_string())?;
    window
        .emit("window-hidden", ())
        .map_err(|e| e.to_string())?;
    if restore_focus {
        restore_previous_focus(&window.app_handle());
    }
    Ok(())
}

#[cfg(target_os = "macos")]
fn capture_previous_focus_target() -> Option<PreviousFocusTarget> {
    const GQUICK_BUNDLE_ID: &str = "com.gquick.app";
    let output = Command::new("osascript")
        .args([
            "-e",
            "id of application (path to frontmost application as text)",
        ])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let bundle_identifier = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if bundle_identifier.is_empty() || bundle_identifier == GQUICK_BUNDLE_ID {
        return None;
    }
    Some(PreviousFocusTarget { bundle_identifier })
}

#[cfg(target_os = "macos")]
fn restore_previous_focus_target(target: PreviousFocusTarget) {
    let script = format!(
        "tell application id \"{}\" to activate",
        target.bundle_identifier.replace('"', "\\\"")
    );
    let _ = Command::new("osascript").args(["-e", &script]).status();
}

#[cfg(target_os = "windows")]
fn capture_previous_focus_target() -> Option<PreviousFocusTarget> {
    use windows_sys::Win32::Foundation::HWND;
    use windows_sys::Win32::UI::WindowsAndMessaging::GetForegroundWindow;

    // Win32 foreground-window handles are process-global; store raw value only.
    let hwnd: HWND = unsafe { GetForegroundWindow() };
    if hwnd.is_null() {
        return None;
    }
    if foreground_window_is_current_process(hwnd) {
        return None;
    }
    Some(PreviousFocusTarget {
        hwnd: hwnd as usize,
    })
}

#[cfg(target_os = "windows")]
fn foreground_window_is_current_process(hwnd: windows_sys::Win32::Foundation::HWND) -> bool {
    use windows_sys::Win32::UI::WindowsAndMessaging::GetWindowThreadProcessId;

    let mut process_id = 0u32;
    unsafe {
        GetWindowThreadProcessId(hwnd, &mut process_id);
    }
    process_id != 0 && process_id == std::process::id()
}

#[cfg(target_os = "windows")]
fn restore_previous_focus_target(target: PreviousFocusTarget) {
    use windows_sys::Win32::Foundation::HWND;
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        IsWindow, SetForegroundWindow, ShowWindow, SW_RESTORE,
    };

    let hwnd = target.hwnd as HWND;
    // HWND may be stale if previous app closed. Win32 APIs fail silently here.
    unsafe {
        if IsWindow(hwnd) != 0 {
            ShowWindow(hwnd, SW_RESTORE);
            SetForegroundWindow(hwnd);
        }
    }
}

#[cfg(target_os = "linux")]
fn capture_previous_focus_target() -> Option<PreviousFocusTarget> {
    let output = Command::new("xdotool")
        .arg("getactivewindow")
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let window_id = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if window_id.is_empty() {
        return None;
    }
    Some(PreviousFocusTarget { window_id })
}

#[cfg(target_os = "linux")]
fn restore_previous_focus_target(target: PreviousFocusTarget) {
    let _ = Command::new("xdotool")
        .args(["windowactivate", &target.window_id])
        .status();
}

#[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
fn capture_previous_focus_target() -> Option<PreviousFocusTarget> {
    None
}

#[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
fn restore_previous_focus_target(_target: PreviousFocusTarget) {}

#[tauri::command]
fn hide_main_window(window: tauri::Window) -> Result<(), String> {
    hide_window(&window, true)
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
fn list_apps(app: tauri::AppHandle, cache_state: tauri::State<AppsCacheState>) -> Vec<AppInfo> {
    {
        let last_updated = cache_state.last_updated.lock().unwrap();
        let apps = cache_state.apps.lock().unwrap();
        if !apps.is_empty() && last_updated.elapsed() < APPS_CACHE_TTL {
            return apps.clone();
        }
    }

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

    let mut cached_apps = cache_state.apps.lock().unwrap();
    let mut last_updated = cache_state.last_updated.lock().unwrap();
    *cached_apps = apps.clone();
    *last_updated = Instant::now();

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
    let scale_factor = window.scale_factor().unwrap_or(1.0);
    let app = window.app_handle();

    // 2. Hide the window immediately to clear the screen
    // Block briefly to allow the compositor to fully hide our transparent
    // window before capturing. Windows DWM needs a bit more time.
    let _ = window.hide();
    #[cfg(target_os = "windows")]
    std::thread::sleep(std::time::Duration::from_millis(300));
    #[cfg(not(target_os = "windows"))]
    std::thread::sleep(std::time::Duration::from_millis(150));

    // 3. Do capture in a closure so we can clean up on error
    let capture_result = (|| -> Result<String, String> {
        let xcap_monitor = xcap_monitor_for_tauri_monitor(&tauri_monitor)?;

        // Convert logical coordinates to physical coordinates
        let phys_x = (x as f64 * scale_factor).round() as i32;
        let phys_y = (y as f64 * scale_factor).round() as i32;
        let phys_width = (width as f64 * scale_factor).round() as u32;
        let phys_height = (height as f64 * scale_factor).round() as u32;

        #[cfg(debug_assertions)]
        eprintln!(
            "[capture_region] physical coords: x={} y={} w={} h={}",
            phys_x, phys_y, phys_width, phys_height
        );

        // Clamp to monitor bounds
        let monitor_width = xcap_monitor.width().map_err(|e| e.to_string())?;
        let monitor_height = xcap_monitor.height().map_err(|e| e.to_string())?;
        let phys_x = phys_x.max(0).min(monitor_width as i32) as u32;
        let phys_y = phys_y.max(0).min(monitor_height as i32) as u32;
        let phys_width = phys_width.min(monitor_width - phys_x);
        let phys_height = phys_height.min(monitor_height - phys_y);

        if phys_width < 2 || phys_height < 2 {
            return Err("Selected region is too small".to_string());
        }

        #[cfg(debug_assertions)]
        eprintln!(
            "[capture_region] clamped coords: x={} y={} w={} h={}",
            phys_x, phys_y, phys_width, phys_height
        );

        let cropped = xcap_monitor
            .capture_region(phys_x, phys_y, phys_width, phys_height)
            .map_err(|e| e.to_string())?;

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

fn xcap_monitor_for_tauri_monitor(
    tauri_monitor: &tauri::Monitor,
) -> Result<xcap::Monitor, String> {
    let tauri_position = tauri_monitor.position();
    let tauri_size = tauri_monitor.size();
    let center_x = tauri_position.x + (tauri_size.width as i32 / 2);
    let center_y = tauri_position.y + (tauri_size.height as i32 / 2);

    #[cfg(debug_assertions)]
    eprintln!(
        "[capture_region] tauri monitor: pos=({},{}) size={}x{}",
        tauri_position.x, tauri_position.y, tauri_size.width, tauri_size.height
    );

    // Strategy 1: Try from_point with center coordinates
    if let Ok(monitor) = xcap::Monitor::from_point(center_x, center_y) {
        let Ok(mx) = monitor.x() else { return Ok(monitor); };
        let Ok(my) = monitor.y() else { return Ok(monitor); };
        let Ok(mw) = monitor.width() else { return Ok(monitor); };
        let Ok(mh) = monitor.height() else { return Ok(monitor); };
        #[cfg(debug_assertions)]
        eprintln!(
            "[capture_region] strategy 1 matched: name={:?} pos=({},{}) size={}x{}",
            monitor.name(),
            mx, my, mw, mh
        );
        return Ok(monitor);
    }

    // Strategy 2: Exact match by position and size
    let all_monitors =
        xcap::Monitor::all().map_err(|e| format!("Failed to enumerate monitors: {}", e))?;
    for monitor in &all_monitors {
        let Ok(mx) = monitor.x() else { continue; };
        let Ok(my) = monitor.y() else { continue; };
        let Ok(mw) = monitor.width() else { continue; };
        let Ok(mh) = monitor.height() else { continue; };

        if mx == tauri_position.x
            && my == tauri_position.y
            && mw == tauri_size.width
            && mh == tauri_size.height
        {
            #[cfg(debug_assertions)]
            eprintln!(
                "[capture_region] strategy 2 matched: name={:?} pos=({},{}) size={}x{}",
                monitor.name(),
                mx, my, mw, mh
            );
            return Ok(monitor.clone());
        }
    }

    // Strategy 3: Find monitor whose bounds contain the center point
    for monitor in &all_monitors {
        let Ok(mx) = monitor.x() else { continue; };
        let Ok(my) = monitor.y() else { continue; };
        let Ok(mw) = monitor.width() else { continue; };
        let Ok(mh) = monitor.height() else { continue; };

        let mright = mx + mw as i32;
        let mbottom = my + mh as i32;
        if center_x >= mx && center_x < mright && center_y >= my && center_y < mbottom {
            #[cfg(debug_assertions)]
            eprintln!(
                "[capture_region] strategy 3 matched: name={:?} pos=({},{}) size={}x{}",
                monitor.name(),
                mx, my, mw, mh
            );
            return Ok(monitor.clone());
        }
    }

    // Strategy 4: Ultimate fallback to primary monitor
    for monitor in &all_monitors {
        let Ok(true) = monitor.is_primary() else { continue; };
        let Ok(mx) = monitor.x() else { continue; };
        let Ok(my) = monitor.y() else { continue; };
        let Ok(mw) = monitor.width() else { continue; };
        let Ok(mh) = monitor.height() else { continue; };
        #[cfg(debug_assertions)]
        eprintln!(
            "[capture_region] strategy 4 fallback to primary: name={:?} pos=({},{}) size={}x{}",
            monitor.name(),
            mx, my, mw, mh
        );
        return Ok(monitor.clone());
    }

    Err("Could not find xcap monitor for selector monitor".to_string())
}

fn monitor_to_logical_geometry(
    monitor: &tauri::Monitor,
) -> (tauri::LogicalPosition<f64>, tauri::LogicalSize<f64>) {
    let scale_factor = monitor.scale_factor();
    let position = monitor.position();
    let size = monitor.size();

    (
        tauri::LogicalPosition {
            x: position.x as f64 / scale_factor,
            y: position.y as f64 / scale_factor,
        },
        tauri::LogicalSize {
            width: size.width as f64 / scale_factor,
            height: size.height as f64 / scale_factor,
        },
    )
}

fn monitor_geometry_for_mouse<R: Runtime>(
    app: &tauri::AppHandle<R>,
) -> Option<(tauri::LogicalPosition<f64>, tauri::LogicalSize<f64>)> {
    monitor_for_mouse(app)
        .or_else(|| app.primary_monitor().ok().flatten())
        .map(|monitor| monitor_to_logical_geometry(&monitor))
}

#[cfg(target_os = "macos")]
fn monitor_for_mouse<R: Runtime>(app: &tauri::AppHandle<R>) -> Option<tauri::Monitor> {
    use core_graphics::{
        display::CGDisplay, event::CGEvent, event_source::CGEventSource,
        event_source::CGEventSourceStateID,
    };

    let source = CGEventSource::new(CGEventSourceStateID::CombinedSessionState).ok()?;
    let event = CGEvent::new(source).ok()?;
    let mouse_point = event.location();

    let display_id = CGDisplay::displays_with_point(mouse_point, 1)
        .ok()
        .and_then(|(display_ids, _)| display_ids.first().copied())?;
    let display = CGDisplay::new(display_id);
    let bounds = display.bounds();

    let monitors = app.available_monitors().ok()?;
    monitors.into_iter().find(|monitor| {
        let position = monitor.position();
        let size = monitor.size();
        position.x == bounds.origin.x as i32
            && position.y == bounds.origin.y as i32
            && size.width as f64 == bounds.size.width
            && size.height as f64 == bounds.size.height
    })
}

#[cfg(target_os = "windows")]
fn monitor_for_mouse<R: Runtime>(app: &tauri::AppHandle<R>) -> Option<tauri::Monitor> {
    use windows_sys::Win32::Foundation::POINT;
    use windows_sys::Win32::UI::WindowsAndMessaging::GetCursorPos;

    let mut cursor = POINT { x: 0, y: 0 };
    let cursor_ok = unsafe { GetCursorPos(&mut cursor) } != 0;
    let monitors = app.available_monitors().ok()?;

    if cursor_ok {
        if let Some(monitor) = monitors.into_iter().find(|monitor| {
            let position = monitor.position();
            let size = monitor.size();
            let left = position.x;
            let top = position.y;
            let right = left + size.width as i32;
            let bottom = top + size.height as i32;

            cursor.x >= left && cursor.x < right && cursor.y >= top && cursor.y < bottom
        }) {
            return Some(monitor);
        }
    }

    None
}

#[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
fn monitor_for_mouse<R: Runtime>(_app: &tauri::AppHandle<R>) -> Option<tauri::Monitor> {
    None
}

#[cfg(target_os = "macos")]
fn selector_geometry_for_mouse<R: Runtime>(
    app: &tauri::AppHandle<R>,
) -> Option<(tauri::LogicalPosition<f64>, tauri::LogicalSize<f64>)> {
    monitor_geometry_for_mouse(app)
}

#[cfg(target_os = "windows")]
fn selector_geometry_for_mouse<R: Runtime>(
    app: &tauri::AppHandle<R>,
) -> Option<(tauri::LogicalPosition<f64>, tauri::LogicalSize<f64>)> {
    monitor_geometry_for_mouse(app)
}

#[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
fn selector_geometry_for_mouse<R: Runtime>(
    app: &tauri::AppHandle<R>,
) -> Option<(tauri::LogicalPosition<f64>, tauri::LogicalSize<f64>)> {
    monitor_geometry_for_mouse(app)
}

fn show_selector_window(app: &tauri::AppHandle, mode: &str) {
    if let Some((logical_pos, logical_size)) = selector_geometry_for_mouse(app) {
        if let Some(selector) = app.get_webview_window("selector") {
            let _ = selector.emit("set-mode", mode);
            let _ = selector.set_size(tauri::Size::Logical(logical_size));
            let _ = selector.set_position(tauri::Position::Logical(logical_pos));
            let _ = selector.show();
            let _ = selector.set_focus();
        } else {
            let builder = tauri::WebviewWindowBuilder::new(
                app,
                "selector",
                tauri::WebviewUrl::App(format!("index.html?mode={}", mode).into()),
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
            restore_previous_focus(app);
        } else {
            show_main_window(app);
        }
    }
}

fn show_main_window<R: Runtime>(app: &tauri::AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        let was_visible = window.is_visible().unwrap_or(false);

        if !was_visible {
            record_previous_focus(app);
        }

        // Center window on monitor under cursor when showing from hidden state.
        if !was_visible {
            if let Some(monitor) =
                monitor_for_mouse(app).or_else(|| app.primary_monitor().ok().flatten())
            {
                let scale_factor = monitor.scale_factor();
                let (logical_monitor_pos, logical_monitor_size) =
                    monitor_to_logical_geometry(&monitor);

                let window_size = window.inner_size().unwrap_or(tauri::PhysicalSize {
                    width: 760,
                    height: 800,
                });
                let logical_window_size = window_size.to_logical::<f64>(scale_factor);

                let x = logical_monitor_pos.x
                    + (logical_monitor_size.width - logical_window_size.width) / 2.0;
                let y = logical_monitor_pos.y
                    + (logical_monitor_size.height - logical_window_size.height) / 2.5; // Slightly above true center for better UX

                let _ =
                    window.set_position(tauri::Position::Logical(tauri::LogicalPosition { x, y }));
            }
        }

        let _ = window.show();
        let _ = window.set_focus();
        if !was_visible {
            let _ = window.emit("window-shown", ());
        }
    }
}

fn open_settings_window<R: Runtime>(app: &tauri::AppHandle<R>) {
    show_main_window(app);

    if let Some(window) = app.get_webview_window("main") {
        let _ = window.emit("open-settings", ());
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
                                show_selector_window(app, mode);
                            }
                        }

                        // Check OCR shortcut
                        let ocr_str = state.ocr_shortcut.lock().unwrap().clone();
                        if let Ok(ocr_shortcut) = parse_shortcut(&ocr_str) {
                            if shortcut.mods == ocr_shortcut.mods
                                && shortcut.key == ocr_shortcut.key
                            {
                                let mode = "ocr";
                                show_selector_window(app, mode);
                            }
                        }
                    }
                })
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // Hide dock icon on macOS, keep only tray icon
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            let open_i = MenuItem::with_id(app, "open", "Open GQuick", true, None::<&str>)?;
            let settings_i = MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)?;
            let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open_i, &settings_i, &quit_i])?;

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open" => {
                        show_main_window(app);
                    }
                    "settings" => {
                        open_settings_window(app);
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
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

            app.manage(PreviousFocusState {
                target: Mutex::new(None),
            });

            app.manage(TerminalState {
                inline_processes: Arc::new(Mutex::new(HashMap::new())),
            });

            app.manage(AppsCacheState {
                apps: Mutex::new(Vec::new()),
                last_updated: Mutex::new(Instant::now() - Duration::from_secs(60)),
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
                    let _ = hide_window(window, true);
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
                        let _ = hide_window(window, false);
                    }
                }
            }
            _ => {}
        })
        .invoke_handler(tauri::generate_handler![
            quit_app,
            list_apps,
            get_network_info,
            request_wifi_permission,
            open_wifi_privacy_settings,
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
            launcher_search_files,
            smart_search_files,
            read_file,
            web_search,
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
