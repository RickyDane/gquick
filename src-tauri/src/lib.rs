use tauri::{
    menu::{Menu, MenuItem},
    tray::{TrayIconBuilder, TrayIconEvent},
    Emitter, Manager, Runtime,
};
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState as GsShortcutState};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tesseract::Tesseract;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
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
}

#[derive(serde::Serialize)]
struct ImageInfo {
    id: String,
    repository: String,
    tag: String,
    size: String,
    created_since: String,
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

use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

struct ShortcutState {
    main_shortcut: Mutex<String>,
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
        "txt", "md", "rs", "ts", "tsx", "js", "jsx", "json", "yaml", "yml",
        "toml", "html", "css", "scss", "sass", "py", "go", "java", "kt", "swift",
        "c", "cpp", "h", "hpp", "sh", "bash", "zsh", "fish", "sql", "xml",
        "csv", "log", "ini", "cfg", "conf", "properties", "gradle", "dockerfile",
        "rb", "php", "lua", "r", "pl", "pm", "t", "Makefile", "makefile",
    ].iter().cloned().collect();

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
        "find", "my", "me", "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
        "of", "with", "by", "from", "up", "about", "into", "through", "during", "before", "after",
        "above", "below", "between", "among", "within", "without", "against", "under", "over",
        "search", "looking", "look", "show", "get", "give", "list", "all", "some", "any", "this",
        "that", "these", "those", "i", "you", "he", "she", "it", "we", "they", "what", "which",
        "who", "when", "where", "why", "how", "is", "are", "was", "were", "be", "been", "being",
        "have", "has", "had", "do", "does", "did", "will", "would", "could", "should", "may",
        "might", "must", "can", "need", "shall", "file", "files", "folder", "folders", "document",
        "documents", "recent", "last", "content", "contains", "text", "about", "related",
    ].iter().cloned().collect();

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

fn run_ocr(app: &tauri::AppHandle, path: &str) -> String {
    let data_path = {
        #[cfg(target_os = "macos")]
        {
            tesseract_data_path(app)
        }
        #[cfg(not(target_os = "macos"))]
        {
            let _ = app;
            None
        }
    };

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
        "node_modules", ".git", "target", "build", "dist",
        ".cache", "Caches", "Trash", ".Trash", "Library",
        ".npm", ".cargo", ".rustup", ".vscode", ".idea",
        "vendor", "bin", "obj", "out", "logs",
        // Windows-specific
        "AppData", "Application Data", "Cookies", "Recent",
        "SendTo", "Start Menu", "Templates", "NetHood",
        "PrintHood", "Local Settings", "My Documents",
        // Linux-specific
        "proc", "sys", "dev", "run", "snap", "flatpak",
    ].iter().cloned().collect();
    
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
    let final_results: Vec<FileInfo> = results.into_iter()
        .take(50)
        .map(|(file, _)| file)
        .collect();
    
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
fn list_containers() -> Result<Vec<ContainerInfo>, String> {
    let output = std::process::Command::new("docker")
        .args(["ps", "-a", "--format", "{{.ID}}|{{.Image}}|{{.Status}}|{{.Names}}"])
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut containers = Vec::new();
    for line in stdout.lines() {
        let parts: Vec<&str> = line.split('|').collect();
        if parts.len() == 4 {
            containers.push(ContainerInfo {
                id: parts[0].to_string(),
                image: parts[1].to_string(),
                status: parts[2].to_string(),
                names: parts[3].to_string(),
            });
        }
    }
    Ok(containers)
}

#[tauri::command]
fn list_images() -> Result<Vec<ImageInfo>, String> {
    let output = std::process::Command::new("docker")
        .args(["images", "--format", "{{.ID}}|{{.Repository}}|{{.Tag}}|{{.Size}}|{{.CreatedAt}}"])
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
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
fn delete_image(id: String) -> Result<(), String> {
    let output = std::process::Command::new("docker")
        .args(["rmi", "-f", &id])
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    Ok(())
}

#[tauri::command]
fn manage_container(id: String, action: String) -> Result<(), String> {
    let output = std::process::Command::new("docker")
        .args([&action, &id])
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    Ok(())
}

#[tauri::command]
fn list_apps() -> Vec<AppInfo> {
    let mut apps = Vec::new();

    #[cfg(target_os = "macos")]
    {
        let paths = vec!["/Applications", "/System/Applications"];
        for path in paths {
            if let Ok(entries) = std::fs::read_dir(path) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.extension().map_or(false, |ext| ext == "app") {
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
    }

    #[cfg(target_os = "windows")]
    {
        let start_menu_paths = [
            std::env::var("ProgramData").map(|p| format!("{}\\Microsoft\\Windows\\Start Menu\\Programs", p)),
            std::env::var("APPDATA").map(|p| format!("{}\\Microsoft\\Windows\\Start Menu\\Programs", p)),
        ];
        for base in start_menu_paths.iter().flatten() {
            for entry in walkdir::WalkDir::new(base).max_depth(3).into_iter().flatten() {
                let path = entry.path();
                if path.extension().map_or(false, |ext| ext.eq_ignore_ascii_case("lnk")) {
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
                                    path: exec.unwrap_or_else(|| path.to_string_lossy().to_string()),
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
fn capture_region(window: tauri::Window, x: i32, y: i32, width: u32, height: u32, mode: String) -> Result<String, String> {
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
        let xcap_monitor = xcap_monitors.into_iter()
            .find(|m| m.name().ok().as_deref() == Some(&tauri_name))
            .or_else(|| {
                xcap::Monitor::all().ok()?.into_iter().next()
            })
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
        let cropped = image::imageops::crop_imm(&image, phys_x, phys_y, phys_width, phys_height).to_image();
        
        let desktop_dir = dirs::desktop_dir().unwrap_or_else(|| std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from(".")));
        let path = desktop_dir.join("gquick_capture.png").to_string_lossy().to_string(); 
        
        cropped.save(&path).map_err(|e| e.to_string())?;

        // Handle Modes
        if mode == "screenshot" {
            let _ = app.opener().open_path(&path, None::<&str>);
        } else if mode == "ocr" {
            let ocr_text = run_ocr(&app, &path);
            
            // Copy extracted text to clipboard
            let _ = app.clipboard().write_text(ocr_text.clone());
            
            // Show notification with first 100 chars
            let preview = if ocr_text.len() > 100 {
                format!("{}...", &ocr_text[..100])
            } else {
                ocr_text.clone()
            };
            
            let _ = app.emit("ocr-complete", preview);
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
    for part in &parts[..parts.len()-1] {
        let lower = part.to_lowercase();
        match lower.as_str() {
            "alt" => mods |= Modifiers::ALT,
            "ctrl" | "control" => mods |= Modifiers::CONTROL,
            "cmd" | "command" | "super" | "meta" | "cmdorctrl" => {
                #[cfg(target_os = "macos")]
                { mods |= Modifiers::SUPER; }
                #[cfg(not(target_os = "macos"))]
                { mods |= Modifiers::CONTROL; }
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
    app.global_shortcut().register(new_shortcut).map_err(|e| e.to_string())?;
    
    // Unregister old shortcut
    if let Ok(old_shortcut) = parse_shortcut(&old_shortcut_str) {
        let _ = app.global_shortcut().unregister(old_shortcut);
    }
    
    // Update stored state
    *state.main_shortcut.lock().unwrap() = shortcut;
    
    Ok(())
}

fn toggle_window<R: Runtime>(app: &tauri::AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        let is_visible = window.is_visible().unwrap_or(false);
        if is_visible {
            let _ = window.hide();
            let _ = window.emit("window-hidden", ());
        } else {
            // Center window on primary monitor
            if let Ok(Some(monitor)) = app.primary_monitor() {
                let monitor_size = monitor.size();
                let monitor_pos = monitor.position();
                let scale_factor = monitor.scale_factor();
                
                let window_size = window.inner_size().unwrap_or(tauri::PhysicalSize { width: 760, height: 800 });
                let logical_window_size = window_size.to_logical::<f64>(scale_factor);
                
                let logical_monitor_width = monitor_size.width as f64 / scale_factor;
                let logical_monitor_height = monitor_size.height as f64 / scale_factor;
                let logical_monitor_x = monitor_pos.x as f64 / scale_factor;
                let logical_monitor_y = monitor_pos.y as f64 / scale_factor;
                
                let x = logical_monitor_x + (logical_monitor_width - logical_window_size.width) / 2.0;
                let y = logical_monitor_y + (logical_monitor_height - logical_window_size.height) / 2.5; // Slightly above true center for better UX
                
                let _ = window.set_position(tauri::Position::Logical(tauri::LogicalPosition { x, y }));
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
                            if shortcut.mods == main_shortcut.mods && shortcut.key == main_shortcut.key {
                                toggle_window(app);
                            }
                        }
                        
                        if shortcut.mods == Modifiers::ALT && (shortcut.key == Code::KeyS || shortcut.key == Code::KeyO) {
                            let mode = if shortcut.key == Code::KeyS { "screenshot" } else { "ocr" };
                            
                            let monitor = app.primary_monitor().ok().flatten();
                            
                            if let Some(m) = monitor {
                                let pos = m.position();
                                let size = m.size();
                                let scale_factor = m.scale_factor();
                                let logical_pos = pos.to_logical::<f64>(scale_factor);
                                let logical_size = size.to_logical::<f64>(scale_factor);

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
            });

            let screenshot_shortcut = Shortcut::new(Some(Modifiers::ALT), Code::KeyS);
            app.global_shortcut().register(screenshot_shortcut)?;

            let ocr_shortcut = Shortcut::new(Some(Modifiers::ALT), Code::KeyO);
            app.global_shortcut().register(ocr_shortcut)?;

            Ok(())
        })
        .on_window_event(|window, event| match event {
            tauri::WindowEvent::CloseRequested { api, .. } => {
                let _ = window.hide();
                let _ = window.emit("window-hidden", ());
                api.prevent_close();
            }
            tauri::WindowEvent::Focused(false) => {
                if window.label() == "selector" {
                    let _ = window.close();
                } else {
                    let _ = window.hide();
                    let _ = window.emit("window-hidden", ());
                }
            }
            _ => {}
        })
        .invoke_handler(tauri::generate_handler![greet, list_apps, list_containers, list_images, delete_image, manage_container, open_app, capture_region, search_files, smart_search_files, open_file, update_main_shortcut])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
