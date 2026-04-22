feat(auth,ocr): remove OAuth, add model fetching and local OCR

Remove OAuth authentication flow for AI providers (Google AI, OpenAI,
Kimi/Moonshot) in favor of simpler API Key-only authentication. Clean
up unused OAuth UI components and related imports from Settings.

Add automatic model fetching when API key is entered. Fetches available
models from OpenAI, Google Gemini, Kimi/Moonshot APIs with 24-hour
localStorage caching. Includes loading states, error handling, rate
limit detection, and AbortController for race condition prevention.
Anthropic Claude uses hardcoded model list (Claude 3.5 Sonnet, Opus,
Haiku). Selected model displayed in chat header.

Replace mocked AI OCR with real Tesseract OCR using tesseract Rust
crate (v0.15). Triggered via Alt+O global shortcut. Captures screen
region, runs OCR, copies extracted text to clipboard, and shows
notification with text preview. Graceful error handling when Tesseract
is not installed.

Files modified:
- src/Settings.tsx
- src/App.tsx
- src-tauri/src/lib.rs
- src-tauri/Cargo.toml
