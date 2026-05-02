# GQuick

[![Tauri v2](https://img.shields.io/badge/Tauri-2.0-FFC131?logo=tauri)](https://tauri.app)
[![React 19](https://img.shields.io/badge/React-19-61DAFB?logo=react)](https://react.dev)
[![Rust](https://img.shields.io/badge/Rust-000000?logo=rust)](https://www.rust-lang.org)

> A cross-platform productivity launcher with AI-powered features. Built for speed, extensibility, and elegance.

GQuick is a Spotlight-like desktop launcher that helps you open apps, search files, manage Docker containers, calculate expressions, translate text, capture screenshots with OCR, and chat with AI — all from a single keyboard-driven interface.

**Supported Platforms:** macOS · Windows · Linux

---

## Table of Contents

- [Features](#features)
- [Screenshots](#screenshots)
- [Installation](#installation)
- [Usage](#usage)
- [Architecture](#architecture)
- [Plugin System](#plugin-system)
- [How to Build a Simple Plugin](docs/overall-functionalities-and-plugins/simple-plugin-guide.md)
- [Keyboard Shortcuts](#keyboard-shortcuts)
- [Development](#development)
- [Building from Source](#building-from-source)
- [CI/CD](#cicd)
- [Contributing](#contributing)
- [License](#license)

---

## Features

### Core Launchers
- **App Launcher** — Launch applications instantly
  - macOS: Scans `/Applications` and `/System/Applications`
  - Windows: Scans Start Menu `.lnk` files
  - Linux: Parses `.desktop` files
- **File Search** — Find files and folders by name across your home directory
- **Smart Search** — AI-powered file search that reads file contents to find the most relevant matches

### Tools & Utilities
- **Calculator** — Evaluate mathematical expressions directly in the search bar
- **Docker Manager** — List, start, stop, and remove Docker containers and images, search Docker Hub, manage Compose projects
- **Web Search** — Quick Google searches opened in your default browser
- **Quick Translate** — Instant text translation powered by AI. Type `t: <text>` or `tr: <text>` for instant translation without opening the full UI
- **Weather** — Current conditions and 7-day forecast powered by Open-Meteo. Type `/wt <city>` or `weather:` to search locations
- **Speedtest** — Measure latency, download, and upload speed via Cloudflare endpoints. Type `speedtest` or `/st`
- **Network Info** — View local IP, public IP, Wi-Fi SSID, and latency. Type `net:`, `network:`, or `wifi`
- **Notes** — Quick note capture with `note: <content>`, search notes with `search notes: <query>`, and browse all notes in a dedicated view
- **Terminal Commands** — Run shell commands directly from the launcher. Type `> <command>` to execute inline or in an external terminal
- **URL Recognition** — Type any URL (e.g., `example.com`, `localhost:3000`) to open it directly in your default browser

### Screen Capture & OCR
- **Screenshot Capture** — Select any screen region with `Alt+S`
- **OCR (Text Extraction)** — Extract text from any screen region with `Alt+O`
  - macOS: Powered by [Tesseract OCR](https://github.com/tesseract-ocr/tesseract)
  - Windows/Linux: Powered by AI vision models (OpenAI, Gemini, Anthropic)
  - Automatically copies extracted text to clipboard

### Chat & AI
- **Multi-Provider Support** — Connect to your preferred AI provider:
  - OpenAI (GPT-5.*, etc.)
  - Google Gemini
  - Anthropic Claude
- **Streaming Responses** — Real-time streaming for a smooth chat experience
- **Model Selection** — Fetch and select from available models per provider
- **Tool Use** — AI can invoke plugins as tools (weather, notes, network info, web search, calculations, file search)
- **Image Upload** — Paste or attach images in chat for vision model analysis (up to 5 images, 5 MB each)

### System Integration
- **Global Hotkeys** — Invoke from anywhere with system-wide shortcuts
- **System Tray** — Runs quietly in the background with tray icon access
- **Auto-Hide** — Window hides automatically when focus is lost
- **Cross-Platform Shortcuts** — Smart `Ctrl`/`⌘` key detection per platform

---

## Screenshots

*Screenshots coming soon*

---

## Installation

### Download Pre-built Binaries

Check the [Releases](https://github.com/rickyperlick/gquick/releases) page for the latest builds:

| Platform | Download |
|----------|----------|
| macOS (Apple Silicon) | `.dmg` |
| macOS (Intel) | `.dmg` |
| Windows | `.msi` installer |
| Linux | `.deb`, `.rpm`, or `.AppImage` |

### Build from Source

See [Building from Source](#building-from-source) below.

---

## Usage

### Getting Started

1. Launch GQuick — it will appear in your system tray
2. Press `Alt+Space` (macOS/Linux) or `Alt+Shift+Space` (Windows) to toggle the launcher
3. Type to search across all plugins
4. Use `↑` / `↓` to navigate results, `Enter` to select

### Terminal Commands

Type `> <command>` to run shell commands directly from the launcher:
- **Enter** — Opens the command in your default terminal
- **Left Shift + Enter** — Runs the command inline (non-interactive commands only)

### Quick Note & Note Search

- Type `note: <your note>` to quickly save a note
- Type `search notes: <query>` to search your saved notes
- Press `Ctrl/Cmd+N` to open the Notes view

### Quick Translate

Type `t: <text>` or `tr: <text>` for instant AI translation without opening the full translate UI. The language is auto-detected and translates English ↔ German by default.

### URL Recognition

Type any URL directly into the search bar to open it:
- `example.com` or `www.example.com`
- `https://example.com`
- `localhost:3000` or `127.0.0.1:8080`

### Actions Overlay

Press `Ctrl/Cmd+K` to open the actions overlay for quick access to:
- Chat mode
- Notes
- Docker view
- Settings
- Individual plugins

### Settings

Press `Ctrl/Cmd+,` to open settings where you can:
- Configure your global shortcut (toggle launcher, screenshot, OCR)
- Set up local shortcuts (quick note, search notes)
- Set up AI provider API keys
- Select your preferred AI model
- Choose UI layout (default or compact)
- Set your default location for weather forecasts

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                         FRONTEND (React 19)                  │
│  ┌─────────┐  ┌──────────┐  ┌─────────┐  ┌────────────────┐  │
│  │  App    │  │ Selector │  │Settings │  │ Plugin System  │  │
│  │(Search  │  │ (Region  │  │(Config) │  │ 10 Plugins     │  │
│  │ + Chat) │  │ Capture) │  │         │  │                │  │
│  └─────────┘  └──────────┘  └─────────┘  └────────────────┘  │
└────────────────────────────┬─────────────────────────────────┘
                             │ Tauri Commands / Events
┌────────────────────────────┴──────────────────────────────────┐
│                        BACKEND (Rust)                         │
│  ┌───────────┐  ┌─────────┐  ┌─────────────────────────────┐  │
│  │App Mgmt   │  │ Capture │  │   Global Shortcuts          │  │
│  │File Search│  │  OCR    │  │   Window / Tray / Clipboard │  │
│  └───────────┘  └─────────┘  └─────────────────────────────┘  │
└───────────────────────────────────────────────────────────────┘
```

GQuick uses **Tauri 2.0** architecture with a clear separation between:
- **Rust Backend** — System integration, screen capture, shortcuts, system tray, runtime file search, and terminal helpers
- **React Frontend** — UI rendering, plugin system, settings, chat interface

### Key Design Decisions

- **Rust handles screen capture** — Avoids CORS/security issues, provides native performance
- **Plugin architecture** — Decoupled search providers for easy extensibility
- **Single HTML entry with window routing** — `main.tsx` uses Tauri window labels to render App vs Selector
- **Local state only** — No external state library; React `useState`/`useEffect` with `localStorage` persistence

---

## Plugin System

GQuick features an extensible plugin architecture. Each plugin implements the `GQuickPlugin` interface:

```typescript
interface GQuickPlugin {
  metadata: PluginMetadata;
  getItems: (query: string) => Promise<SearchResultItem[]>;
}
```

### Built-in Plugins

| Plugin | ID | Description | Trigger Keywords / Prefixes |
|--------|-----|-------------|---------------------------|
| App Launcher | `app-launcher` | Launch applications | `open`, `launch`, `app` |
| File Search | `file-search` | Find files and folders | `file`, `folder`, `find` |
| Calculator | `calculator` | Math expression evaluator | N/A (auto-detected) |
| Docker | `docker` | Container/image management | `docker:` |
| Web Search | `web-search` | Google search | `search:`, `google`, `search`, `web` |
| Translate | `translate` | AI-powered translation | `translate:`, `/translate`, `t:`, `tr:` |
| Notes | `notes` | Quick notes and search | `note:`, `search notes:`, `notes:` |
| Weather | `weather` | Forecast and current conditions | `/wt`, `weather:`, `weather`, `forecast` |
| Speedtest | `speedtest` | Internet speed test | `speedtest`, `speed test`, `/st` |
| Network Info | `network-info` | IP, Wi-Fi, latency | `net:`, `network:`, `wifi` |

### Creating a Custom Plugin

1. Create a new file in `src/plugins/myPlugin.tsx`
2. Implement the `GQuickPlugin` interface
3. Register it in `src/plugins/index.ts`
4. See [How to Build a Simple Plugin](docs/overall-functionalities-and-plugins/simple-plugin-guide.md) for a fuller quick start and checklist

Example:

```typescript
import { GQuickPlugin } from "./types";

export const myPlugin: GQuickPlugin = {
  metadata: {
    id: "my-plugin",
    title: "My Plugin",
    icon: MyIcon,
    keywords: ["my", "custom"],
  },
  getItems: async (query: string) => {
    // Return search results based on query
    return [];
  },
};
```

---

## Keyboard Shortcuts

### Global Shortcuts (System-wide)

| Shortcut | macOS | Windows | Linux | Action |
|----------|-------|---------|-------|--------|
| Toggle Launcher | `Alt+Space` | `Alt+Shift+Space` | `Alt+Space` | Show/hide main window |
| Screenshot | `Alt+S` | `Alt+S` | `Alt+S` | Capture screen region |
| OCR | `Alt+O` | `Alt+O` | `Alt+O` | Extract text from region |

### In-App Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl/Cmd+K` | Toggle actions overlay |
| `Ctrl/Cmd+Shift+C` | Switch to chat view |
| `Ctrl/Cmd+N` | Open Notes view |
| `Ctrl/Cmd+Shift+D` | Open Docker view |
| `Ctrl/Cmd+Shift+N` | Quick Note (prefills `note:` in search) |
| `Ctrl/Cmd+Shift+S` | Search Notes (prefills `search notes:` in search) |
| `Ctrl/Cmd+,` | Open settings |
| `Ctrl/Cmd+R` | Reset chat (chat view only) |
| `↑` / `↓` | Navigate results |
| `Enter` | Select highlighted item |
| `Left Shift + Enter` | Run terminal command inline (when command is typed) |
| `Escape` | Hide window / go back |

---

## Development

### Prerequisites

- [Node.js](https://nodejs.org/) 20 or later
- [Rust](https://www.rust-lang.org/tools/install) toolchain
- Platform-specific dependencies (see below)

### macOS

```bash
# Install Tesseract (required for OCR)
brew install tesseract

# Install dependencies
npm install

# Start development server
npm run tauri dev
```

### Windows

```bash
# Install dependencies
npm install

# Start development server
npm run tauri dev
```

### Linux

```bash
# Install system dependencies (Ubuntu/Debian)
sudo apt-get update
sudo apt-get install -y \
  libwebkit2gtk-4.1-dev \
  libgtk-3-dev \
  libappindicator3-dev \
  librsvg2-dev \
  patchelf \
  libpipewire-0.3-dev \
  libclang-dev \
  clang

# Install dependencies
npm install

# Start development server
npm run tauri dev
```

---

## Building from Source

### Local Build

```bash
# Build for current platform
npm run tauri build
```

The built application will be in `src-tauri/target/release/bundle/`.

### macOS Code Signing (Optional)

For local testing without code signing:

```bash
CODESIGN_IDENTITY=- npm run tauri build
```

For distribution, you'll need an **Apple Developer ID** certificate. See [Code Signing Guide](docs/macos-code-signing/setup.md) for details.

---

## CI/CD

GQuick uses GitHub Actions for automated cross-platform builds.

### Automated Builds

The workflow (`.github/workflows/build.yml`) triggers on:
- Push to `main` branch
- Pull requests to `main`
- Tag pushes (`v*`)

### Build Matrix

| Runner | Target | Outputs |
|--------|--------|---------|
| `ubuntu-22.04` | `x86_64-unknown-linux-gnu` | `.deb`, `.rpm`, `.AppImage` |
| `windows-latest` | `x86_64-pc-windows-msvc` | `.msi`, `.exe` |
| `macos-latest` | `aarch64-apple-darwin` | `.dmg` (Apple Silicon) |

---

## Contributing

Contributions are welcome! Here's how to get started:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Tips

- Follow the existing code style
- Add comments for complex logic
- Test on multiple platforms when possible
- Update documentation for new features

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## Acknowledgments

- Built with [Tauri](https://tauri.app) — Rust-powered desktop framework
- UI powered by [React](https://react.dev) and [Tailwind CSS](https://tailwindcss.com)
- Icons by [Lucide](https://lucide.dev)
- OCR powered by [Tesseract](https://github.com/tesseract-ocr/tesseract) on macOS, AI vision models on Windows/Linux
- Screen capture by [xcap](https://github.com/nashaofu/xcap)

---

<p align="center">
  Made with ❤️ by Ricky Dane Perlick
</p>
