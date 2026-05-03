# GQuick v0.1.7 — Initial Release

GQuick is a fast, cross-platform desktop productivity launcher built with Tauri and React. This first public release brings search, AI assistance, screenshots/OCR, notes, Docker tools, and everyday utilities into one keyboard-driven app.

## Highlights

- **Spotlight-style launcher**: Quickly find and open apps, files, folders, recent items, notes, utilities, and plugin actions from one search box.
- **AI chat with tool calling**: Chat with OpenAI, Google Gemini, or Anthropic models, attach images, and let the assistant use supported GQuick tools such as calculator, file search, notes, network info, weather, and web search.
- **Screenshot and OCR workflows**: Capture selected screen regions, copy images, extract text where OCR is available, and send captures into AI vision workflows.
- **Notes built in**: Create, search, update, and manage local notes without leaving the launcher.
- **Docker management**: Inspect Docker status, containers, images, logs, exec sessions, Compose operations, Docker Hub search, and cleanup actions from GQuick.
- **Everyday utilities**: Calculator, web search, translation, weather, public/network info, speed testing, terminal helpers, and file/app opening are included.
- **Desktop behavior that stays out of the way**: Global shortcuts, tray integration, hidden-on-close behavior, and configurable settings make GQuick easy to keep available without cluttering the desktop.

## Features

### Search and Launcher

- Search installed applications, files, folders, and recently opened items.
- Use plugin prefixes for targeted actions, including Docker, notes, weather, translation, web search, and speed testing.
- Recent files and folders are surfaced quickly from local usage history.

### AI Assistant

- Configure supported providers and models in Settings.
- Stream chat responses in the app.
- Use AI tools for calculation, safe file search/read, notes, network info, weather, and web search.
- Attach screenshots or image input for vision-capable workflows.

### Productivity Tools

- Manage local notes in a dedicated notes view.
- Run Docker workflows without switching to a terminal.
- Capture regions of the screen and copy screenshots or OCR text.
- Check weather, network details, internet speed, translations, and search results from the launcher.

## Getting Started and Configuration

- Install and launch GQuick, then open Settings to configure your preferred global shortcut.
- Add API keys for any AI providers you want to use. AI calls are made directly from the app to the selected provider.
- Set a default location in Settings to improve weather results and weather-related AI tool calls.
- Install and run Docker if you want to use Docker management features.
- Grant any operating-system permissions requested for screenshots, accessibility-style window behavior, or OCR-related workflows.

## Safety and Privacy Notes

- GQuick stores settings such as provider configuration, saved location, and recent usage locally.
- AI provider API keys are used by the desktop app for direct provider requests; no separate GQuick backend proxy is included in this release.
- File-reading tools include backend safety checks for safe roots, hidden/secret paths, symlinks, text-only reads, and size limits.
- Destructive Docker operations require explicit confirmation in the app.

## Known Limitations and Requirements

- External features require internet access, including AI providers, weather, web search, speed testing, Docker Hub search, and public IP lookup.
- AI features require valid provider API keys and compatible models.
- Docker features require the Docker CLI and a running Docker daemon where applicable.
- File search uses runtime scanning rather than a persistent index, so very large directories may take longer to search.
- OCR availability depends on platform support and required local OCR dependencies; current OCR integration is strongest on macOS.
- Moonshot/Kimi support exists in code paths but is not exposed in Settings in this release.

## Closing

This initial release establishes GQuick as a local-first productivity hub for launching, searching, automating, and managing common desktop workflows from one place. Feedback and bug reports are welcome as the app moves toward broader platform polish and deeper plugin support.
