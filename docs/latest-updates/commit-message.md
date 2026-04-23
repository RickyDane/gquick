feat(app): implement full productivity launcher with AI chat, OCR, and 6 plugins

Add complete desktop productivity launcher with Tauri v2 backend and React 19 frontend.

Features implemented:
- AI chat with real SSE streaming for OpenAI, Google Gemini, Kimi/Moonshot,
  and Anthropic Claude. Supports multi-turn conversation, up to 5 image
  attachments (paste/file dialog), and Markdown rendering via react-markdown.
- Local OCR using Tesseract Rust crate (0.15). Triggered by Alt+O global
  shortcut. Captures screen region, extracts text, copies to clipboard.
- Screenshot capture with Alt+S. Region selection overlay, Retina-aware
  coordinate mapping, saves to Desktop and copies image to clipboard.
- 6 plugins: appLauncher (cross-platform), calculator, docker, webSearch,
  fileSearch (fast + smart AI-powered with content reading), and translate
  (quick translate + full translation UI).
- Smart file search with natural language queries, time filters, and AI
  relevance ranking using configured provider.
- Settings with live API model fetching (24h cache), interactive shortcut
  recording for 3 global shortcuts, and provider selection.
- Cross-platform app launching: macOS (.app), Windows (.lnk), Linux (.desktop).

New components: MarkdownMessage, Tooltip, ShortcutRecorder, streaming utilities,
quickTranslate utility.

New Rust commands: search_files, smart_search_files, open_file, open_app,
update_main_shortcut, update_screenshot_shortcut, update_ocr_shortcut,
open_image_dialog, close_selector, capture_region with OCR integration.
