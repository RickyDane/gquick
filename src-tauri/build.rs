fn main() {
    // On Windows, locate the Tesseract installation and copy its DLLs so they
    // sit next to the compiled binary. This makes `tauri dev` work, and we also
    // stage them for the Tauri bundler by generating tauri.windows.conf.json.
    // NOTE: `cargo clean` does NOT remove tauri.windows.conf.json or the
    // tesseract-dlls/ directory because they live outside of target/. Remove
    // them manually if you need a fully clean state.
    #[cfg(target_os = "windows")]
    {
        if let Err(e) = windows::setup_tesseract_dlls() {
            println!("cargo:warning=Could not setup Tesseract DLLs: {}", e);
            println!("cargo:warning=The app may fail to start if the DLLs are not in PATH.");
            println!("cargo:warning=Install locations checked:");
            println!("cargo:warning=  - TESSDATA_PREFIX parent directory");
            println!("cargo:warning=  - PATH (directory containing tesseract.exe)");
            println!("cargo:warning=  - C:\\Program Files\\Tesseract-OCR");
            println!("cargo:warning=  - C:\\Program Files (x86)\\Tesseract-OCR");
            println!("cargo:warning=  - VCPKG_ROOT\\installed\\{triplet}\\bin");
        }
    }

    tauri_build::build();
}

#[cfg(target_os = "windows")]
mod windows {
    use std::env;
    use std::fs;
    use std::path::{Path, PathBuf};

    pub fn setup_tesseract_dlls() -> Result<(), Box<dyn std::error::Error>> {
        println!("cargo:rerun-if-env-changed=TESSDATA_PREFIX");
        println!("cargo:rerun-if-env-changed=PATH");
        println!("cargo:rerun-if-env-changed=VCPKG_ROOT");

        let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR")?);

        let dll_dir = match find_tesseract_dll_dir() {
            Some(dir) => dir,
            None => {
                clean_staged_artifacts(&manifest_dir);
                return Err("Tesseract DLL directory not found. Install Tesseract or set TESSDATA_PREFIX.".into());
            }
        };

        // Collect known Tesseract/Leptonica transitive dependencies.
        // This avoids pulling unrelated DLLs from vcpkg's bin/ directory.
        let dlls = collect_tesseract_dlls(&dll_dir)?;
        if dlls.is_empty() {
            clean_staged_artifacts(&manifest_dir);
            return Err("No required .dll files found in detected Tesseract directory.".into());
        }

        let target_dir = if let Ok(target_dir) = env::var("CARGO_TARGET_DIR") {
            let profile = env::var("PROFILE").unwrap_or_else(|_| "debug".to_string());
            PathBuf::from(target_dir).join(profile)
        } else {
            let profile = env::var("PROFILE").unwrap_or_else(|_| "debug".to_string());
            manifest_dir.join("target").join(profile)
        };

        // 1. Copy into target/{profile}/ so `cargo run` / `tauri dev` can find them.
        for dll in &dlls {
            let src = dll_dir.join(dll);
            let dst = target_dir.join(dll);
            match fs::copy(&src, &dst) {
                Ok(_) => println!("cargo:warning=Copied {} -> {}", dll, dst.display()),
                Err(e) => println!("cargo:warning=Failed to copy {}: {}", dll, e),
            }
            println!("cargo:rerun-if-changed={}", src.display());
        }

        // 2. Stage in src-tauri/tesseract-dlls/ for the Tauri bundler.
        let staging_dir = manifest_dir.join("tesseract-dlls");
        fs::create_dir_all(&staging_dir)?;

        let mut resources = serde_json::Map::new();
        for dll in &dlls {
            let src = dll_dir.join(dll);
            let dst = staging_dir.join(dll);
            match fs::copy(&src, &dst) {
                Ok(_) => {
                    // Map each staged DLL to the bundle root (next to the .exe).
                    resources.insert(
                        format!("tesseract-dlls/{}", dll),
                        serde_json::Value::String(".".into()),
                    );
                }
                Err(e) => println!("cargo:warning=Failed to stage {}: {}", dll, e),
            }
        }

        // 3. Generate tauri.windows.conf.json so the bundler knows to include them.
        let windows_config = serde_json::json!({
            "bundle": {
                "resources": resources
            }
        });

        let config_path = manifest_dir.join("tauri.windows.conf.json");
        let new_contents = serde_json::to_string_pretty(&windows_config)?;

        // Only write if changed to avoid touching the file timestamp unnecessarily.
        let should_write = match fs::read_to_string(&config_path) {
            Ok(existing) => existing != new_contents,
            Err(_) => true,
        };

        if should_write {
            fs::write(&config_path, new_contents)?;
        }

        Ok(())
    }

    fn clean_staged_artifacts(manifest_dir: &Path) {
        let _ = fs::remove_file(manifest_dir.join("tauri.windows.conf.json"));
        let _ = fs::remove_dir_all(manifest_dir.join("tesseract-dlls"));
    }

    fn find_tesseract_dll_dir() -> Option<PathBuf> {
        // 1. TESSDATA_PREFIX often points to .../tessdata; the parent usually holds the DLLs.
        if let Ok(tessdata) = env::var("TESSDATA_PREFIX") {
            let path = PathBuf::from(tessdata);
            if let Some(parent) = path.parent() {
                if has_tesseract_and_leptonica(parent) {
                    return Some(parent.to_path_buf());
                }
            }
        }

        // 2. Search PATH for tesseract.exe and inspect its directory.
        if let Ok(path_var) = env::var("PATH") {
            for dir in path_var.split(';') {
                let dir = PathBuf::from(dir.trim());
                if dir.join("tesseract.exe").exists() && has_tesseract_and_leptonica(&dir) {
                    return Some(dir);
                }
            }
        }

        // 3. Common manual installer paths (UB Mannheim builds, Chocolatey, etc.).
        for path in [
            r"C:\Program Files\Tesseract-OCR",
            r"C:\Program Files (x86)\Tesseract-OCR",
        ] {
            let p = PathBuf::from(path);
            if has_tesseract_and_leptonica(&p) {
                return Some(p);
            }
        }

        // 4. vcpkg dynamic triplet directories.
        if let Ok(vcpkg_root) = env::var("VCPKG_ROOT") {
            for triplet in ["x64-windows", "x86-windows"] {
                let p = PathBuf::from(&vcpkg_root)
                    .join("installed")
                    .join(triplet)
                    .join("bin");
                if has_tesseract_and_leptonica(&p) {
                    return Some(p);
                }
            }
        }

        None
    }

    fn has_tesseract_and_leptonica(dir: &Path) -> bool {
        let Ok(entries) = fs::read_dir(dir) else {
            return false;
        };

        let mut has_tesseract = false;
        let mut has_leptonica = false;

        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_lowercase();
            if name.starts_with("tesseract") && name.ends_with(".dll") {
                has_tesseract = true;
            }
            if name.starts_with("leptonica") && name.ends_with(".dll") {
                has_leptonica = true;
            }
        }

        has_tesseract && has_leptonica
    }

    fn collect_tesseract_dlls(dir: &Path) -> Result<Vec<String>, Box<dyn std::error::Error>> {
        // Known transitive dependencies of Tesseract/Leptonica. If vcpkg's bin/
        // directory is detected, this prevents unrelated DLLs from bloating the bundle.
        let allowed_prefixes = [
            "tesseract", "leptonica", "libpng", "zlib", "libjpeg", "libtiff", "gif", "webp",
            "openjp2",
        ];

        let mut dlls = Vec::new();
        for entry in fs::read_dir(dir)? {
            let entry = entry?;
            let name = entry.file_name().to_string_lossy().to_string();
            let name_lower = name.to_lowercase();
            if name_lower.ends_with(".dll")
                && allowed_prefixes.iter().any(|p| name_lower.starts_with(p))
            {
                dlls.push(name);
            }
        }
        Ok(dlls)
    }
}
