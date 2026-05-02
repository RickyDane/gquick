import React, { useState, useEffect, useRef, useCallback } from "react";
import { Search, Command, Settings as SettingsIcon, MessageSquare, ChevronRight, ChevronDown, Send, User, Bot, Loader2, Zap, ImagePlus, X, RotateCcw, StickyNote, Box, Terminal, Plus, RefreshCw } from "lucide-react";
import { cn } from "./utils/cn";
import { getPluginsForQuery, plugins } from "./plugins";
import { SearchResultItem } from "./plugins/types";
import Settings from "./Settings";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { MarkdownMessage } from "./components/MarkdownMessage";
import { Tooltip } from "./components/Tooltip";
import { NotesView } from "./components/NotesView";
import { DockerView, type DockerInitialImage } from "./components/DockerView";
import SearchSuggestions from "./components/SearchSuggestions";
import { isQuickTranslateQuery, performQuickTranslate } from "./utils/quickTranslate";
import { streamOpenAITools, streamOpenAIResponsesTools, streamGeminiTools, streamAnthropicTools } from "./utils/streaming";
import { getAllTools, executeTool, convertToolsForProvider, convertToolsForOpenAIResponses, convertMessagesToOpenAI, convertMessagesToOpenAIResponsesInput, convertMessagesToGemini, convertMessagesToAnthropic } from "./utils/toolManager";
import { ToolCall } from "./plugins/types";
import { getSavedLocation } from "./utils/location";
import { recordUsage, getRecentItems } from "./utils/usageTracker";
import UpdateModal from "./components/UpdateModal";

const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
const modKey = isMac ? '⌘' : 'Ctrl';
const LEFT_KEY_LOCATION = 1;
const LAUNCHER_WINDOW_SIZE = { width: 760, height: 800 };
const LAUNCHER_MIN_WINDOW_HEIGHT = 140;
const WINDOW_RESIZE_DEBOUNCE_MS = 80;

/** Views that open in the expanded (larger) window. Add new views here. */
const EXPANDED_WINDOW_VIEWS: Record<string, { width: number; height: number }> = {
  docker: { width: 1200, height: 860 },
  chat: { width: 1200, height: 860 },
};

function isExpandedView(view: string): boolean {
  return view in EXPANDED_WINDOW_VIEWS;
}

function getExpandedWindowSize(view: string): { width: number; height: number } | null {
  return EXPANDED_WINDOW_VIEWS[view] ?? null;
}

function isLeftShiftKeyEvent(e: KeyboardEvent): boolean {
  return e.key === "Shift" && (e.code === "ShiftLeft" || e.location === LEFT_KEY_LOCATION);
}

function isChatShortcut(e: KeyboardEvent, isLeftShiftPressed: boolean): boolean {
  const isCKey = e.code === "KeyC" || e.key.toLowerCase() === "c";
  return (e.metaKey || e.ctrlKey) && e.shiftKey && isLeftShiftPressed && isCKey;
}

function isDockerShortcut(e: KeyboardEvent, isLeftShiftPressed: boolean): boolean {
  const isDKey = e.code === "KeyD" || e.key.toLowerCase() === "d";
  return (e.metaKey || e.ctrlKey) && e.shiftKey && isLeftShiftPressed && isDKey;
}

function matchesShortcut(e: KeyboardEvent, shortcut: string): boolean {
  const parts = shortcut.split("+");
  const keyPart = parts[parts.length - 1];
  const modifiers = parts.slice(0, -1);

  const hasCmdOrCtrl = modifiers.includes("CmdOrCtrl");
  const hasAlt = modifiers.includes("Alt");
  const hasShift = modifiers.includes("Shift");

  if (hasCmdOrCtrl && !(e.metaKey || e.ctrlKey)) return false;
  if (!hasCmdOrCtrl && (e.metaKey || e.ctrlKey)) return false;
  if (hasAlt && !e.altKey) return false;
  if (!hasAlt && e.altKey) return false;
  if (hasShift && !e.shiftKey) return false;
  if (!hasShift && e.shiftKey) return false;

  const expectedKey = keyPart === "Space" ? " " : keyPart;
  return e.key === expectedKey || e.key.toUpperCase() === keyPart;
}

function isSmartSearchQuery(query: string): boolean {
  const SMART_SEARCH_KEYWORDS = [
    "find", "looking for", "files from", "about", "related to",
    "recent", "last week", "yesterday", "today", "last month",
    "content", "contains", "with text", "document about"
  ];
  const lower = query.toLowerCase();
  return SMART_SEARCH_KEYWORDS.some(kw => lower.includes(kw));
}

function supportsOpenAIHostedWebSearch(modelId: string): boolean {
  const normalized = modelId.toLowerCase();
  // OpenAI rejects hosted web_search for unsupported Responses models.
  // Keep plugin function tools available, but only send hosted search to known-capable families.
  return [
    "gpt-5.5",
    "gpt-5.5-nano",
    "gpt-5.4",
    "gpt-5.4-nano",
    "gpt-4o-search-preview",
    "gpt-4o-mini-search-preview",
    "gpt-4o",
    "gpt-4.1",
    "o3",
    "o4-mini",
  ].some((prefix) => normalized.startsWith(prefix));
}

interface ChatImage {
  dataUrl: string;
  mimeType: string;
  base64: string;
}

interface Message {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  images?: ChatImage[];
  toolCalls?: ToolCall[]; // for assistant messages that initiated tool calls
  toolCallId?: string; // for tool result messages
}

interface InlineTerminalResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  canceled: boolean;
}

interface InlineCommandState {
  id: string;
  command: string;
  status: "idle" | "running" | "finished" | "failed" | "canceled" | "blocked";
  stdout: string;
  stderr: string;
  exitCode: number | null;
  error?: string;
}

interface SearchPluginResult {
  requestId: number;
  query: string;
  pluginId: string;
  items: SearchResultItem[];
}

function sortSearchResults(searchItems: SearchResultItem[]): SearchResultItem[] {
  return [...searchItems].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
}

const INTERACTIVE_TERMINAL_COMMANDS = new Set([
  "ssh", "sudo", "su", "vim", "vi", "nvim", "nano", "emacs", "less", "more",
  "top", "htop", "watch", "passwd", "mysql", "psql", "sqlite3", "ftp", "sftp",
  "telnet", "screen", "tmux", "irb", "pry", "rails", "iex", "erl",
]);

const REPL_COMMANDS = new Set(["python", "python3", "node", "ruby", "php", "R"]);

interface InlineTerminalOutputEvent {
  id: string;
  stream: "stdout" | "stderr";
  chunk: string;
}

function getTerminalCommand(query: string): string | null {
  const trimmed = query.trim();
  if (!trimmed.startsWith(">")) return null;
  return trimmed.substring(1).trim();
}

function tokenizeCommand(command: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quote: "'" | '"' | null = null;
  let escaping = false;

  for (const char of command.trim()) {
    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }
    if (char === "\\" && quote !== "'") {
      escaping = true;
      continue;
    }
    if ((char === "'" || char === '"') && !quote) {
      quote = char;
      continue;
    }
    if (char === quote) {
      quote = null;
      continue;
    }
    if (/\s/.test(char) && !quote) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }

  if (current) tokens.push(current);
  return tokens;
}

function getExecutableName(token: string): string {
  return token.split("/").pop() ?? token;
}

function isEnvAssignment(token: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*=.*/.test(token);
}

function isLikelyInteractiveCommand(command: string): boolean {
  const tokens = tokenizeCommand(command);
  if (tokens.length === 0) return false;

  let index = 0;
  while (isEnvAssignment(tokens[index])) index += 1;

  const wrapper = getExecutableName(tokens[index] ?? "");
  if (["env", "command", "exec"].includes(wrapper)) {
    index += 1;
    while (isEnvAssignment(tokens[index])) index += 1;
  }

  const executable = getExecutableName(tokens[index] ?? "");
  if (!executable) return false;
  if (INTERACTIVE_TERMINAL_COMMANDS.has(executable)) return true;

  return REPL_COMMANDS.has(executable) && tokens.length === index + 1;
}

function App() {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [view, setView] = useState<"search" | "chat" | "settings" | "actions" | "notes" | "docker">("search");
  const [activeActionIndex, setActiveActionIndex] = useState(0);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0);
  const [items, setItems] = useState<SearchResultItem[]>([]);

  const trackAndSelect = useCallback((item: SearchResultItem, currentQuery: string) => {
    if (item.pluginId !== "terminal-command") {
      recordUsage({
        id: item.id,
        pluginId: item.pluginId,
        title: item.title,
        subtitle: item.subtitle,
        icon: typeof item.icon === "string" ? item.icon : undefined,
        query: currentQuery,
      });
    }
    item.onSelect();
  }, []);

  const inputRef = useRef<HTMLInputElement>(null);
  const actionsScrollRef = useRef<HTMLDivElement>(null);
  const isLeftShiftPressedRef = useRef(false);
  const itemsRef = useRef<SearchResultItem[]>([]);
  const activeIndexRef = useRef(0);
  const searchListRef = useRef<HTMLDivElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const launcherFrameRef = useRef<HTMLDivElement>(null);
  const launcherResizeTimerRef = useRef<number | null>(null);
  const pendingLauncherHeightRef = useRef<number | null>(null);
  const appliedLauncherHeightRef = useRef(LAUNCHER_WINDOW_SIZE.height);

  // Chat State
  const [messages, setMessages] = useState<Message[]>([
    { id: "1", role: "assistant", content: "Hello! I'm GQuick. I'm ready to help you with anything." }
  ]);
  const [chatInput, setChatInput] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [searchStatus, setSearchStatus] = useState<string | null>(null);
  const [isTranslating, setIsTranslating] = useState(false);
  const [inlineCommand, setInlineCommand] = useState<InlineCommandState | null>(null);
  const [attachedImages, setAttachedImages] = useState<ChatImage[]>([]);
  const [notesContext, setNotesContext] = useState<{ title: string; content: string }[] | null>(null);
  const [dockerInitialImage, setDockerInitialImage] = useState<DockerInitialImage | null>(null);
  const [initialNoteId, setInitialNoteId] = useState<number | null>(null);
  const [notesSearchQuery, setNotesSearchQuery] = useState("");
  const [dockerSearchQuery, setDockerSearchQuery] = useState("");
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);
  const [autoCheckUpdateInfo, setAutoCheckUpdateInfo] = useState<{ version: string; body: string | null } | null>(null);
  const [autoCheckUpdateObj, setAutoCheckUpdateObj] = useState<any>(null);
  const appliedWindowModeRef = useRef<"launcher" | "expanded" | null>(null);
  const inlineCommandRef = useRef<InlineCommandState | null>(null);
  const searchRequestIdRef = useRef(0);
  const latestSearchQueryRef = useRef(query);
  const latestSearchViewRef = useRef(view);

  latestSearchQueryRef.current = query;
  latestSearchViewRef.current = view;

  useEffect(() => {
    inlineCommandRef.current = inlineCommand;
  }, [inlineCommand]);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    activeIndexRef.current = activeIndex;
  }, [activeIndex]);

  useEffect(() => {
    if (view === "search" && !query) {
      setActiveSuggestionIndex(0);
    }
  }, [view, query]);

  useEffect(() => {
    if (view === "search" && query && items.length > 0) {
      searchListRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [items, view, query]);

  useEffect(() => {
    if (view !== "search" || query) return;
    const container = suggestionsRef.current;
    if (!container) return;
    const activeEl = container.querySelector('[data-suggestion-active="true"]') as HTMLElement;
    if (!activeEl) return;
    activeEl.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [activeSuggestionIndex, view, query]);

  useEffect(() => {
    const model = localStorage.getItem("selected-model");
    if (model) setSelectedModel(model);
  }, [view]);

  // Sync saved shortcuts with Rust backend on mount
  useEffect(() => {
    const syncShortcuts = async () => {
      const savedMain = localStorage.getItem("main-shortcut");
      if (savedMain) {
        try {
          await invoke("update_main_shortcut", { shortcut: savedMain });
        } catch (err) {
          console.error("Failed to sync main shortcut:", err);
        }
      }
      const savedScreenshot = localStorage.getItem("screenshot-shortcut");
      if (savedScreenshot) {
        try {
          await invoke("update_screenshot_shortcut", { shortcut: savedScreenshot });
        } catch (err) {
          console.error("Failed to sync screenshot shortcut:", err);
        }
      }
      const savedOcr = localStorage.getItem("ocr-shortcut");
      if (savedOcr) {
        try {
          await invoke("update_ocr_shortcut", { shortcut: savedOcr });
        } catch (err) {
          console.error("Failed to sync OCR shortcut:", err);
        }
      }
    };
    syncShortcuts();
  }, []);

  // Auto-check for updates on startup (delayed to not slow down app launch)
  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        const { checkForUpdates } = await import("./utils/updater");
        const result = await checkForUpdates();
        if (result.available && result.info && result.update) {
          setAutoCheckUpdateInfo(result.info);
          setAutoCheckUpdateObj(result.update);
          setIsUpdateModalOpen(true);
        }
      } catch {
        // silently fail - don't bother user if check fails
      }
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (view !== "settings" && view !== "actions") {
      inputRef.current?.focus();
    }
  }, [view]);

  useEffect(() => {
    if (view === "actions") {
      setActiveActionIndex(0);
    }
  }, [view]);

  // Scroll active action into view
  useEffect(() => {
    if (view !== "actions" || !actionsScrollRef.current) return;

    const container = actionsScrollRef.current;
    const activeEl = container.querySelector('[data-action-active="true"]') as HTMLElement;
    if (!activeEl) return;

    const isFirst = activeActionIndex === 0;
    const isLast = activeActionIndex === appActions.length + pluginActions.length - 1;

    if (isFirst) {
      container.scrollTo({ top: 0, behavior: "smooth" });
    } else if (isLast) {
      container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
    } else {
      activeEl.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [activeActionIndex, view]);

  useEffect(() => {
    if (isAtBottom) {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isAtBottom]);

  const handleChatScroll = useCallback(() => {
    const el = chatScrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50;
    setIsAtBottom(atBottom);
    setShowScrollButton(!atBottom);
  }, []);

  const scrollToBottom = () => {
    setIsAtBottom(true);
    setShowScrollButton(false);
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Listen for notes plugin requesting to open notes view
  useEffect(() => {
    const handleOpenNotes = () => {
      setInitialNoteId(null);
      setView("notes");
    };
    window.addEventListener("gquick-open-notes", handleOpenNotes);
    return () => window.removeEventListener("gquick-open-notes", handleOpenNotes);
  }, []);

  useEffect(() => {
    const handleOpenNote = (event: Event) => {
      const noteId = (event as CustomEvent<number>).detail;
      setInitialNoteId(noteId);
      setView("notes");
    };
    window.addEventListener("gquick-open-note", handleOpenNote);
    return () => window.removeEventListener("gquick-open-note", handleOpenNote);
  }, []);

  useEffect(() => {
    const handleOpenDocker = (event: Event) => {
      const detail = (event as CustomEvent<DockerInitialImage | undefined>).detail;
      setDockerInitialImage(detail ?? null);
      setView("docker");
    };
    window.addEventListener("gquick-open-docker", handleOpenDocker);
    return () => window.removeEventListener("gquick-open-docker", handleOpenDocker);
  }, []);

  useEffect(() => {
    const handleFocus = () => {
      inputRef.current?.focus();
    };
    window.addEventListener("gquick-focus-docker-search", handleFocus);
    return () => window.removeEventListener("gquick-focus-docker-search", handleFocus);
  }, []);

  useEffect(() => {
    const expandedSize = getExpandedWindowSize(view);
    const mode = expandedSize ? "expanded" : "launcher";
    if (appliedWindowModeRef.current === mode) return;
    appliedWindowModeRef.current = mode;

    const resizeWindow = async () => {
      const size = expandedSize ?? LAUNCHER_WINDOW_SIZE;
      const appWindow = getCurrentWindow();
      try {
        const launcherHeight = mode === "launcher"
          ? appliedLauncherHeightRef.current
          : size.height;
        await appWindow.setSize(new LogicalSize(size.width, launcherHeight));
        await appWindow.center();
      } catch (error) {
        console.error("Failed to resize window:", error);
      }
    };

    void resizeWindow();
  }, [view]);

  useEffect(() => {
    const root = document.getElementById("root");
    root?.classList.toggle("gquick-expanded-root", isExpandedView(view));
    return () => root?.classList.remove("gquick-expanded-root");
  }, [view]);

  const scheduleLauncherResize = useCallback((nextHeight: number) => {
    const clampedHeight = Math.max(
      LAUNCHER_MIN_WINDOW_HEIGHT,
      Math.min(LAUNCHER_WINDOW_SIZE.height, Math.ceil(nextHeight))
    );

    pendingLauncherHeightRef.current = clampedHeight;

    if (launcherResizeTimerRef.current !== null) {
      window.clearTimeout(launcherResizeTimerRef.current);
    }

    launcherResizeTimerRef.current = window.setTimeout(async () => {
      launcherResizeTimerRef.current = null;

      if (appliedWindowModeRef.current !== "launcher") return;

      const targetHeight = pendingLauncherHeightRef.current;
      if (targetHeight == null) return;
      if (targetHeight === appliedLauncherHeightRef.current) return;

      try {
        await getCurrentWindow().setSize(new LogicalSize(LAUNCHER_WINDOW_SIZE.width, targetHeight));
        appliedLauncherHeightRef.current = targetHeight;
      } catch (error) {
        console.error("Failed to resize launcher window:", error);
      }
    }, WINDOW_RESIZE_DEBOUNCE_MS);
  }, []);

  useEffect(() => {
    if (isExpandedView(view)) {
      if (launcherResizeTimerRef.current !== null) {
        window.clearTimeout(launcherResizeTimerRef.current);
        launcherResizeTimerRef.current = null;
      }
      pendingLauncherHeightRef.current = null;
      return;
    }

    const frame = launcherFrameRef.current;
    if (!frame) return;

    const measureAndResize = () => {
      const naturalHeight = Math.max(frame.scrollHeight, frame.getBoundingClientRect().height);
      scheduleLauncherResize(naturalHeight);
    };

    measureAndResize();

    const observer = new ResizeObserver(() => {
      measureAndResize();
    });

    observer.observe(frame);

    return () => {
      observer.disconnect();
    };
  }, [scheduleLauncherResize, view]);

  useEffect(() => {
    return () => {
      if (launcherResizeTimerRef.current !== null) {
        window.clearTimeout(launcherResizeTimerRef.current);
        launcherResizeTimerRef.current = null;
      }
    };
  }, []);

  // Reset to idle search state when window is hidden
  useEffect(() => {
    let unlisten: UnlistenFn | undefined;
    let disposed = false;

    const setupListener = async () => {
      const cleanup = await listen("window-hidden", () => {
        setView("search");
        setQuery("");
        setActiveIndex(0);
        setActiveActionIndex(0);
        setChatInput("");
        setItems([]);
        setDockerInitialImage(null);
        setIsTranslating(false);
        setIsSearching(false);
        setSearchStatus(null);
        setInlineCommand(null);
        setAttachedImages([]);
        setNotesContext(null);
        setInitialNoteId(null);
        setNotesSearchQuery("");
        setDockerSearchQuery("");
      });
      if (disposed) cleanup();
      else unlisten = cleanup;
    };

    setupListener();

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  // Focus search input when window is shown and on initial mount
  useEffect(() => {
    let unlisten: UnlistenFn | undefined;
    let disposed = false;

    const focusInput = () => {
      // Small delay to ensure the webview is ready to receive focus
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    };

    const setupListener = async () => {
      const cleanup = await listen("window-shown", focusInput);
      if (disposed) cleanup();
      else unlisten = cleanup;
    };

    setupListener();
    focusInput(); // Also focus on initial mount

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    let unlisten: UnlistenFn | undefined;
    let disposed = false;

    const setupListener = async () => {
      const cleanup = await listen("open-settings", () => {
        setView("settings");
      });
      if (disposed) cleanup();
      else unlisten = cleanup;
    };

    setupListener();

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  const processImageFiles = useCallback(async (files: File[]) => {
    const imageFiles = files.filter(f =>
      f.type.startsWith("image/") &&
      f.type !== "image/svg+xml" &&
      f.size <= 5 * 1024 * 1024
    );
    if (imageFiles.length === 0) return;

    const readPromises = imageFiles.map(file =>
      new Promise<ChatImage>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const dataUrl = e.target?.result as string;
          const base64 = dataUrl.split(',')[1];
          if (!base64) {
            reject(new Error(`Invalid image data for ${file.name}`));
            return;
          }
          resolve({ dataUrl, mimeType: file.type, base64 });
        };
        reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
        reader.onabort = () => reject(new Error(`Read aborted for ${file.name}`));
        reader.readAsDataURL(file);
      })
    );

    try {
      const newImages = await Promise.all(readPromises);
      setAttachedImages(prev => {
        const remaining = 5 - prev.length;
        if (remaining <= 0) return prev;
        return [...prev, ...newImages.slice(0, remaining)];
      });
    } catch (err) {
      console.error("Failed to process images:", err);
    }
  }, []);

  const removeAttachedImage = (index: number) => {
    setAttachedImages(prev => prev.filter((_, i) => i !== index));
  };

  const addImages = useCallback((newImages: ChatImage[]) => {
    setAttachedImages(prev => {
      const remaining = 5 - prev.length;
      if (remaining <= 0) return prev;
      return [...prev, ...newImages.slice(0, remaining)];
    });
  }, []);

  const cancelInlineCommand = useCallback(async () => {
    const current = inlineCommandRef.current;
    if (!current || current.status !== "running") return;
    try {
      await invoke("cancel_terminal_command", { id: current.id });
    } catch (error) {
      console.error("Failed to cancel terminal command:", error);
    }
    setInlineCommand(prev => {
      if (!prev || prev.id !== current.id) return prev;
      const next: InlineCommandState = { ...prev, status: "canceled" };
      inlineCommandRef.current = next;
      return next;
    });
  }, []);

  const confirmCancelInlineCommand = useCallback(async (forcePrompt = false): Promise<boolean> => {
    const current = inlineCommandRef.current;
    if (!forcePrompt && (!current || current.status !== "running")) return true;

    const shouldCancel = window.confirm(
      current?.status === "running"
        ? `Inline command is still running:\n\n${current.command}\n\nClosing GQuick will cancel it. Continue?`
        : "An inline command is still running. Closing GQuick will cancel it. Continue?"
    );
    if (!shouldCancel) return false;
    await invoke("cancel_all_terminal_commands");
    if (current?.status === "running") {
      setInlineCommand(prev => {
        if (!prev) return prev;
        const next: InlineCommandState = { ...prev, status: "canceled" };
        inlineCommandRef.current = next;
        return next;
      });
    }
    return true;
  }, []);

  const hideWindowSafely = useCallback(async () => {
    const canHide = await confirmCancelInlineCommand();
    if (!canHide) return;
    await invoke("hide_main_window");
  }, [confirmCancelInlineCommand]);

  const runExternalTerminalCommand = useCallback(async (command: string) => {
    try {
      await invoke("open_terminal_command", { command });
      await hideWindowSafely();
    } catch (error) {
      setInlineCommand({
        id: `external-${Date.now()}`,
        command,
        status: "failed",
        stdout: "",
        stderr: "",
        exitCode: null,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }, [hideWindowSafely]);

  const runInlineTerminalCommand = useCallback(async (command: string) => {
    if (inlineCommandRef.current?.status === "running") {
      setInlineCommand(prev => prev ? { ...prev, error: "Another inline command is already running. Cancel it or wait for it to finish." } : prev);
      return;
    }

    if (isLikelyInteractiveCommand(command)) {
      const blockedCommand: InlineCommandState = {
        id: `blocked-${Date.now()}`,
        command,
        status: "blocked",
        stdout: "",
        stderr: "",
        exitCode: null,
        error: "This command needs an interactive terminal. Press Enter to open it in Terminal.",
      };
      inlineCommandRef.current = blockedCommand;
      setInlineCommand(blockedCommand);
      return;
    }

    const id = `terminal-${Date.now()}`;
    const runningCommand: InlineCommandState = { id, command, status: "running", stdout: "", stderr: "", exitCode: null };
    inlineCommandRef.current = runningCommand;
    setInlineCommand(runningCommand);

    try {
      const result = await invoke<InlineTerminalResult>("run_terminal_command_inline", { id, command });
      setInlineCommand(prev => {
        if (!prev || prev.id !== id) return prev;
        const next: InlineCommandState = {
          ...prev,
          status: result.canceled ? "canceled" : "finished",
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: result.exitCode,
        };
        inlineCommandRef.current = next;
        return next;
      });
    } catch (error) {
      setInlineCommand(prev => {
        if (!prev || prev.id !== id) return prev;
        const next: InlineCommandState = {
          ...prev,
          status: prev.status === "canceled" ? "canceled" : "failed",
          error: error instanceof Error ? error.message : String(error),
        };
        inlineCommandRef.current = next;
        return next;
      });
    }
  }, []);

  useEffect(() => {
    let unlistenClose: UnlistenFn | undefined;
    let unlistenOutput: UnlistenFn | undefined;
    let disposed = false;
    const setupListener = async () => {
      const cleanupClose = await listen("terminal-close-requested", async () => {
        const canHide = await confirmCancelInlineCommand(true);
        if (canHide) {
          await invoke("hide_main_window").catch((error) => {
            console.error("Failed to hide window after terminal confirmation:", error);
          });
        } else {
          await getCurrentWindow().show().catch(() => {});
          await getCurrentWindow().setFocus().catch(() => {});
        }
      });
      if (disposed) cleanupClose();
      else unlistenClose = cleanupClose;

      const cleanupOutput = await listen<InlineTerminalOutputEvent>("terminal-command-output", (event) => {
        const { id, stream, chunk } = event.payload;
        setInlineCommand(prev => {
          if (!prev || prev.id !== id || prev.status !== "running") return prev;
          const next: InlineCommandState = {
            ...prev,
            [stream]: prev[stream] + chunk,
          };
          inlineCommandRef.current = next;
          return next;
        });
      });
      if (disposed) cleanupOutput();
      else unlistenOutput = cleanupOutput;
    };
    setupListener();
    return () => {
      disposed = true;
      unlistenClose?.();
      unlistenOutput?.();
    };
  }, [confirmCancelInlineCommand]);

  // Paste handler for images
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (view !== "chat") return;
      const files = Array.from(e.clipboardData?.files || []);
      const imageFiles = files.filter(f => f.type.startsWith("image/"));
      if (imageFiles.length === 0) return;

      const hasText = (e.clipboardData?.getData("text") || "").length > 0;
      if (!hasText) {
        e.preventDefault();
      }
      processImageFiles(imageFiles);
    };
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [view, processImageFiles]);

  // Global Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isLeftShiftKeyEvent(e)) {
        isLeftShiftPressedRef.current = true;
      }

      if (e.defaultPrevented) return;

      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setView(prev => prev === "actions" ? "search" : "actions");
      }

      if (isChatShortcut(e, isLeftShiftPressedRef.current) && view !== "actions") {
         e.preventDefault();
         setView("chat");
      }

      if (isDockerShortcut(e, isLeftShiftPressedRef.current) && view !== "actions") {
        e.preventDefault();
        setDockerInitialImage(null);
        setView(prev => prev === "docker" ? "search" : "docker");
        setQuery("");
        setChatInput("");
        setNotesContext(null);
        setDockerSearchQuery("");
      }

      if ((e.metaKey || e.ctrlKey) && e.key === "n" && view !== "actions") {
        e.preventDefault();
        setInitialNoteId(null);
        setView("notes");
      }

      // Local shortcut: Quick Note (configurable)
      const quickNoteShortcut = localStorage.getItem("quick-note-shortcut") || "CmdOrCtrl+Shift+N";
      if (matchesShortcut(e, quickNoteShortcut) && view !== "actions") {
        e.preventDefault();
        setView("search");
        setQuery("note: ");
        setChatInput("");
        setNotesContext(null);
        inputRef.current?.focus();
      }

      // Local shortcut: Search Notes (configurable)
      const searchNotesShortcut = localStorage.getItem("search-notes-shortcut") || "CmdOrCtrl+Shift+S";
      if (matchesShortcut(e, searchNotesShortcut) && view !== "actions") {
        e.preventDefault();
        setView("search");
        setQuery("search notes: ");
        setChatInput("");
        setNotesContext(null);
        inputRef.current?.focus();
      }

      if ((e.metaKey || e.ctrlKey) && e.key === "r" && view === "chat") {
        e.preventDefault();
        setMessages([
          { id: Date.now().toString(), role: "assistant", content: "Hello! I'm GQuick. I'm ready to help you with anything." }
        ]);
        setAttachedImages([]);
        setChatInput("");
        setNotesContext(null);
      }

      if ((e.metaKey || e.ctrlKey) && e.key === "," && view !== "actions") {
         e.preventDefault();
         setView("settings");
      }

      if (e.key === "Escape") {
        if (view === "actions") {
          setView("search");
        } else if (view !== "search") {
          if (attachedImages.length > 0) {
            setAttachedImages([]);
          } else {
            setView("search");
            setQuery("");
          }
        } else {
          void hideWindowSafely();
        }
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (isLeftShiftKeyEvent(e)) {
        isLeftShiftPressedRef.current = false;
      }
    };
    const resetLeftShift = () => {
      isLeftShiftPressedRef.current = false;
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", resetLeftShift);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", resetLeftShift);
    };
  }, [view, attachedImages, hideWindowSafely]);

  // Fetch items from plugins
  useEffect(() => {
    if (view !== "search" || !query) {
      searchRequestIdRef.current += 1;
      setItems([]);
      setIsTranslating(false);
      setIsSearching(false);
      setSearchStatus(null);
      return;
    }

    const quick = isQuickTranslateQuery(query);
    const terminalCommand = getTerminalCommand(query);

    if (quick.isQuick) {
      searchRequestIdRef.current += 1;
      setIsSearching(false);
      setSearchStatus(null);
      setItems([]);

      if (quick.text.length === 0) {
        setIsTranslating(false);
        return;
      }

      // Handle quick translate directly with loading state
      // Use 500ms debounce for API calls to reduce unnecessary requests
      const requestId = searchRequestIdRef.current;
      setIsTranslating(true);

      const doTranslate = async () => {
        const latestQuick = isQuickTranslateQuery(latestSearchQueryRef.current);
        if (latestSearchViewRef.current !== "search" || !latestQuick.isQuick || latestQuick.text.length === 0) {
          setIsTranslating(false);
          return;
        }

        const result = await performQuickTranslate(latestQuick.text);
        if (requestId !== searchRequestIdRef.current) return;

        setIsTranslating(false);

        if (result.error) {
          setItems([{
            id: "quick-translate-error",
            pluginId: "translate",
            title: "Quick Translate",
            subtitle: result.error,
            icon: Zap,
            score: 100,
            onSelect: () => {},
          }]);
          return;
        }

        setItems([{
          id: "quick-translate-result",
          pluginId: "translate",
          title: result.result,
          subtitle: `Quick translate: ${result.detectedLang} → ${result.targetLang} (press Enter to copy)`,
          icon: Zap,
          score: 100,
          onSelect: async () => {
            try {
              await navigator.clipboard.writeText(result.result);
            } catch {
              // ignore
            }
            await getCurrentWindow().hide();
          },
        }]);
      };

      const timer = setTimeout(doTranslate, 500);
      return () => clearTimeout(timer);
    }

    setIsTranslating(false);

    if (terminalCommand !== null) {
      searchRequestIdRef.current += 1;
      setIsSearching(false);
      setSearchStatus(null);

      if (terminalCommand.length === 0) {
        setItems([{
          id: "terminal-empty",
          pluginId: "terminal-command",
          title: "Run terminal command",
          subtitle: "Type a command after >",
          icon: Terminal,
          score: 100,
          onSelect: () => {},
        }]);
        return;
      }

      setItems([{
        id: "terminal-run",
        pluginId: "terminal-command",
        title: terminalCommand,
        subtitle: isLikelyInteractiveCommand(terminalCommand)
          ? "Interactive command: Enter opens Terminal • inline disabled"
          : inlineCommand?.status === "running"
            ? `Inline command already running: ${inlineCommand.command}`
            : "Enter: open in terminal • Left Shift + Enter: run inline",
        icon: Terminal,
        score: 100,
        onSelect: () => void runExternalTerminalCommand(terminalCommand),
      }]);
      return;
    }

    // Application launcher and lightweight plugins use raw input immediately.
    // Expensive plugins opt into debounce via metadata.
    let cancelled = false;
    const requestQuery = query;
    const requestId = ++searchRequestIdRef.current;
    const isCurrentRequest = () =>
      !cancelled &&
      searchRequestIdRef.current === requestId &&
      latestSearchQueryRef.current === requestQuery &&
      latestSearchViewRef.current === "search";
    const immediateItemsByPlugin = new Map<string, SearchResultItem[]>();
    let pendingSearches = 0;
    const debouncedItemsByPlugin = new Map<string, SearchResultItem[]>();

    const startPluginSearch = (pluginId: string) => {
      pendingSearches += 1;
      setIsSearching(true);
      setSearchStatus(statusForPlugin(pluginId));
    };

    const endPluginSearch = () => {
      pendingSearches = Math.max(pendingSearches - 1, 0);
      if (isCurrentRequest()) {
        const stillSearching = pendingSearches > 0;
        setIsSearching(stillSearching);
        if (!stillSearching) setSearchStatus(null);
      }
    };

    const publishItems = () => {
      if (!isCurrentRequest()) return;
      const immediateItems = Array.from(immediateItemsByPlugin.values()).flat();
      const debouncedItems = Array.from(debouncedItemsByPlugin.values()).flat();

      // Deduplicate by id, keeping first occurrence (immediate plugins win)
      const seen = new Set<string>();
      const deduped = [...immediateItems, ...debouncedItems].filter(item => {
        if (seen.has(item.id)) return false;
        seen.add(item.id);
        return true;
      });

      const nextItems = sortSearchResults(deduped);

      itemsRef.current = nextItems;
      setItems(nextItems);
      setActiveIndex(0);
    };

    const queryPlugins = getPluginsForQuery(query).filter(plugin => plugin.shouldSearch?.(query) ?? true);
    const getPluginDebounceMs = (plugin: (typeof queryPlugins)[number]) =>
      plugin.getSearchDebounceMs?.(query) ?? plugin.searchDebounceMs;
    const immediatePlugins = queryPlugins.filter(plugin => getPluginDebounceMs(plugin) === undefined);
    const debouncedPlugins = queryPlugins.filter(plugin => getPluginDebounceMs(plugin) !== undefined);

    itemsRef.current = [];
    setItems([]);

    const statusForPlugin = (pluginId: string) => {
      if (pluginId === "file-search") {
        if (isSmartSearchQuery(query)) return "Searching files…";
        return "Searching files…";
      }
      if (pluginId === "docker") return "Searching Docker Hub and local images…";
      return "Searching…";
    };

    const fetchPluginItems = async (plugin: (typeof queryPlugins)[number]): Promise<SearchPluginResult> => ({
      requestId,
      query: requestQuery,
      pluginId: plugin.metadata.id,
      items: await plugin.getItems(requestQuery),
    });

    const applyPluginResult = (result: SearchPluginResult, target: Map<string, SearchResultItem[]>) => {
      if (
        result.requestId !== requestId ||
        result.query !== requestQuery ||
        !isCurrentRequest()
      ) return false;

      target.set(result.pluginId, result.items);
      publishItems();
      return true;
    };

    const fetchImmediateItems = async (plugin: (typeof queryPlugins)[number]) => {
      try {
        const result = await fetchPluginItems(plugin);
        applyPluginResult(result, immediateItemsByPlugin);
      } catch (error) {
        console.error(`Immediate search error (${plugin.metadata.id}):`, error);
      }
    };

    // Immediate plugins run silently without triggering the searching indicator.
    // Only debounced (expensive) plugins show loading state.
    immediatePlugins.forEach(plugin => {
      void fetchImmediateItems(plugin);
    });

    const timers = debouncedPlugins.map(plugin => {
      const debounceMs = getPluginDebounceMs(plugin) ?? 0;
      return window.setTimeout(async () => {
        if (!isCurrentRequest()) return;

        startPluginSearch(plugin.metadata.id);
        try {
          const result = await fetchPluginItems(plugin);
          applyPluginResult(result, debouncedItemsByPlugin);
        } catch (error) {
          console.error(`Debounced search error (${plugin.metadata.id}):`, error);
        } finally {
          endPluginSearch();
        }
      }, debounceMs);
    });

    return () => {
      cancelled = true;
      timers.forEach(window.clearTimeout);
      setIsSearching(false);
      setSearchStatus(null);
    };
  }, [query, view, runExternalTerminalCommand, inlineCommand?.status, inlineCommand?.command]);

  const totalItems = items.length;

  const handleSelectQuery = useCallback((q: string) => {
    setQuery(q);
    inputRef.current?.focus();
  }, []);

  const handleOpenView = useCallback((v: "chat" | "notes" | "docker" | "settings" | "actions") => {
    if (v === "notes") setInitialNoteId(null);
    if (v === "docker") setDockerInitialImage(null);
    setView(v);
  }, []);

  const handleOpenApp = useCallback(async (path: string) => {
    try {
      await invoke("open_app", { path });
    } catch (e) {
      console.error(e);
    }
  }, []);

  const handleOpenFile = useCallback(async (path: string) => {
    try {
      await invoke("open_file", { path });
    } catch (e) {
      console.error("Failed to open file:", e);
    }
  }, []);

  /** Format a queryPrefix into a human-readable trigger hint. */
  const formatQueryPrefix = (prefix: string | RegExp): string => {
    if (typeof prefix === "string") return prefix;
    // Extract readable alternatives from regex like /^(speedtest|speed test|\/st)$/i
    const src = prefix.source;
    const altMatch = src.match(/\(([^)]+)\)/);
    if (altMatch) {
      return altMatch[1].split("|").map(s => s.replace(/^\\\//, "/").replace(/\\/g, "")).join(", ");
    }
    // Strip anchors/flags for simple patterns
    return src.replace(/^\^/, "").replace(/\$$/, "").replace(/\\\//g, "/");
  };

  const appActions = [
    { id: "chat", label: "Open Chat", icon: MessageSquare, shortcut: `${modKey} L⇧ C`, onClick: () => setView("chat") },
    { id: "notes", label: "Notes", icon: StickyNote, shortcut: `${modKey} N`, onClick: () => { setInitialNoteId(null); setView("notes"); } },
    { id: "docker", label: "Docker", icon: Box, shortcut: `${modKey} L⇧ D`, onClick: () => { setDockerInitialImage(null); setView("docker"); } },
    { id: "search-notes", label: "Search Notes", icon: Search, shortcut: `${modKey} ⇧ S`, onClick: () => { setView("search"); setQuery("search notes: "); inputRef.current?.focus(); } },
    { id: "settings", label: "Settings", icon: SettingsIcon, shortcut: `${modKey},`, onClick: () => setView("settings") },
  ];

  const pluginActions = plugins.map(p => ({
    id: p.metadata.id,
    label: p.metadata.title,
    subtitle: p.metadata.subtitle,
    icon: p.metadata.icon,
    keywords: p.metadata.keywords,
    queryPrefixes: p.metadata.queryPrefixes,
  }));

  const totalActionItems = appActions.length + pluginActions.length;

  // Suggestion items for keyboard navigation
  const recentSuggestions = getRecentItems(8);
  const suggestionQuickActions = [
    { id: "chat", view: "chat" as const },
    { id: "notes", view: "notes" as const },
    { id: "docker", view: "docker" as const },
    { id: "settings", view: "settings" as const },
    { id: "actions", view: "actions" as const },
  ];
  const suggestionPlugins = plugins;
  const totalSuggestions = recentSuggestions.length + suggestionQuickActions.length + suggestionPlugins.length;

  const activateSuggestion = useCallback((index: number) => {
    if (index < recentSuggestions.length) {
      const entry = recentSuggestions[index];
      if (entry.pluginId === "app-launcher") {
        void handleOpenApp(entry.id);
      } else if (entry.pluginId === "file-search") {
        void handleOpenFile(entry.id);
      } else {
        handleSelectQuery(entry.query);
      }
    } else if (index < recentSuggestions.length + suggestionQuickActions.length) {
      const action = suggestionQuickActions[index - recentSuggestions.length];
      handleOpenView(action.view);
    } else {
      const plugin = suggestionPlugins[index - recentSuggestions.length - suggestionQuickActions.length];
      const keyword = plugin.metadata.keywords[0] || "";
      handleSelectQuery(keyword ? keyword + " " : "");
    }
  }, [recentSuggestions, handleOpenApp, handleOpenFile, handleSelectQuery, handleOpenView]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (view === "actions") {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveActionIndex(prev => Math.min(prev + 1, totalActionItems - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveActionIndex(prev => Math.max(prev - 1, 0));
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        if (activeActionIndex < appActions.length) {
          appActions[activeActionIndex].onClick();
        } else {
          const plugin = pluginActions[activeActionIndex - appActions.length];
          // Use first queryPrefix if available, otherwise first keyword
          const trigger = plugin.queryPrefixes && plugin.queryPrefixes.length > 0
            ? formatQueryPrefix(plugin.queryPrefixes[0])
            : plugin.keywords[0] || plugin.label.toLowerCase();
          setView("search");
          setQuery(trigger + " ");
          inputRef.current?.focus();
        }
        return;
      }
      return;
    }

    const isSuggestionsVisible = view === "search" && !query && totalSuggestions > 0;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (isSuggestionsVisible) {
        setActiveSuggestionIndex(prev => Math.min(prev + 1, totalSuggestions - 1));
      } else {
        setActiveIndex(prev => Math.min(prev + 1, totalItems - 1));
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (isSuggestionsVisible) {
        setActiveSuggestionIndex(prev => Math.max(prev - 1, 0));
      } else {
        setActiveIndex(prev => Math.max(prev - 1, 0));
      }
    } else if (e.key === "Enter") {
      if (isSuggestionsVisible) {
        e.preventDefault();
        activateSuggestion(activeSuggestionIndex);
        return;
      }
      const terminalCommand = getTerminalCommand(query);
      if (terminalCommand !== null && terminalCommand.length > 0 && isLeftShiftPressedRef.current) {
        e.preventDefault();
        void runInlineTerminalCommand(terminalCommand);
        return;
      }
      if (terminalCommand !== null && terminalCommand.length > 0) {
        e.preventDefault();
        void runExternalTerminalCommand(terminalCommand);
        return;
      }
      if (totalItems > 0 && items[activeIndex]) {
        e.preventDefault();
        trackAndSelect(items[activeIndex], query);
      }
    }
  };

  const isNoteRelatedQuery = useCallback((query: string): boolean => {
    const noteKeywords = ["note", "notes", "remember", "remind", "saved", "memo", "wrote down"];
    const lower = query.toLowerCase();
    return noteKeywords.some(kw => lower.includes(kw));
  }, []);

  const fetchNotesContext = useCallback(async (query: string): Promise<string | null> => {
    try {
      const notes = await invoke<{ id: number; title: string; content: string }[]>("get_notes");

      if (notes.length === 0) return null;

      const allNotes = notes.map(n => {
        const content = n.content.length > 500 ? n.content.substring(0, 500) + "..." : n.content;
        return `  [${n.title}]: ${content}`;
      }).join("\n");

      return `The user's saved notes:\n${allNotes}\n\nUser's question: ${query}`;
    } catch (e) {
      console.error("Failed to fetch notes context:", e);
      return null;
    }
  }, []);

  const handleSendMessage = useCallback(async () => {
    if ((!chatInput.trim() && attachedImages.length === 0) || isLoading) return;

    const trimmedInput = chatInput.trim();
    const noteRelated = isNoteRelatedQuery(trimmedInput);
    const notesContextStr = noteRelated ? await fetchNotesContext(trimmedInput) : null;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: trimmedInput,
      images: attachedImages.length > 0 ? attachedImages : undefined
    };

    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setChatInput("");
    setAttachedImages([]);
    setNotesContext(notesContextStr ? notesContextStr.split("\n").filter(line => line.startsWith("  [")).map(line => {
      const match = line.match(/^\s*\[(.+?)\]: (.+)$/);
      return match ? { title: match[1], content: match[2] } : { title: "Note", content: line };
    }) : null);
    setIsLoading(true);

    const apiKey = localStorage.getItem("api-key") ?? "";
    const provider = localStorage.getItem("api-provider") || "openai";
    const model = localStorage.getItem("selected-model") ?? "";

    if (!apiKey || !model) {
      const assistantId = (Date.now() + 1).toString();
      setMessages(prev => [...prev, {
        id: assistantId,
        role: "assistant",
        content: `Please configure your API key and select a model in Settings (${modKey},) first.`
      }]);
      setIsLoading(false);
      return;
    }

    const tools = getAllTools();
    const providerTools = tools.length > 0 ? convertToolsForProvider(tools, provider as "openai" | "kimi" | "google" | "anthropic") : undefined;

    const savedLocation = getSavedLocation();
    const locationContext = savedLocation
      ? `The user's current location is ${savedLocation.name}${savedLocation.country ? `, ${savedLocation.country}` : ""} (lat: ${savedLocation.latitude}, lon: ${savedLocation.longitude}). Use this location by default for weather and location-related queries unless the user specifies a different location.`
      : "";

    const baseSystemContent = "You are GQuick, a helpful AI assistant. You have access to tools that can help you perform actions like calculations, file searches, note management, network queries, and web search. Use them when helpful. Always format your responses using Markdown for better readability. Use code blocks for code, lists for enumerations, bold/italic for emphasis, and tables when appropriate." + (locationContext ? "\n\n" + locationContext : "");
    const systemContent = notesContextStr
      ? `You are GQuick, a helpful AI assistant. You have access to tools that can help you perform actions like calculations, file searches, note management, network queries, and web search. Use them when helpful.\n\nThe user has shared their saved notes below. Use the notes to answer their question if relevant, but you can also draw on your general knowledge. If the notes contain the answer, reference them. If not, answer from your knowledge. Always format responses using Markdown.` + (locationContext ? "\n\n" + locationContext : "")
      : baseSystemContent;

    async function streamWithTools(msgs: Message[], notesContext: string | null, depth = 0) {
      if (depth > 5) {
        const assistantId = (Date.now() + Math.random()).toString();
        setMessages(prev => [...prev, { id: assistantId, role: "assistant", content: "Too many tool call rounds. Stopping to prevent infinite loop." }]);
        setIsLoading(false);
        return;
      }

      const assistantId = (Date.now() + Math.random()).toString();
      setMessages(prev => [...prev, { id: assistantId, role: "assistant", content: "" }]);

      const updateAssistantContent = (text: string) => {
        setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: text } : m));
      };

      const history = msgs.filter(m => m.role !== "assistant" || m.id !== "1");
      const lastUserIndex = history.map(m => m.role).lastIndexOf("user");
      const processedHistory = history.map((m, idx) =>
        idx === lastUserIndex && notesContext
          ? { ...m, content: notesContext }
          : m
      );

      let apiMessages: any[] = [];
      if (provider === "openai") {
        apiMessages = convertMessagesToOpenAIResponsesInput(processedHistory);
      } else if (provider === "kimi") {
        apiMessages = [
          { role: "system", content: systemContent },
          ...convertMessagesToOpenAI(processedHistory)
        ];
      } else if (provider === "google") {
        apiMessages = convertMessagesToGemini(processedHistory);
      } else if (provider === "anthropic") {
        apiMessages = convertMessagesToAnthropic(processedHistory);
      }

      const callbacks = {
        onContent: updateAssistantContent,
        onDone: async (toolCalls?: ToolCall[]) => {
          try {
            if (toolCalls && toolCalls.length > 0) {
              setMessages(prev => prev.map(m =>
                m.id === assistantId ? { ...m, toolCalls, content: "Using tools..." } : m
              ));

              const results = await Promise.all(toolCalls.map(async tc => {
                const result = await executeTool(tc.name, tc.arguments);
                return { ...tc, result };
              }));

              const toolResultMessages: Message[] = results.map(r => ({
                id: `tool-${Date.now()}-${Math.random()}`,
                role: "tool",
                content: r.result.content,
                toolCallId: r.id,
              }));

              const afterToolMessages = [...msgs,
                { id: assistantId, role: "assistant", content: "Using tools...", toolCalls: toolCalls } as Message,
                ...toolResultMessages
              ];
              setMessages(afterToolMessages);

              await streamWithTools(afterToolMessages, null, depth + 1);
            } else {
              setIsLoading(false);
            }
          } catch (err: any) {
            updateAssistantContent(`Error: ${err.message || "Tool execution failed"}. Please try again.`);
            setIsLoading(false);
          }
        },
        onError: (error: string) => {
          updateAssistantContent(`Error: ${error}. Please check your API key and model settings.`);
          setIsLoading(false);
        }
      };

      try {
        if (provider === "openai") {
          const responseTools = [
            ...(supportsOpenAIHostedWebSearch(model) ? [{ type: "web_search_preview" }] : []),
            ...convertToolsForOpenAIResponses(tools),
          ];
          const body: any = {
            model: model,
            instructions: systemContent,
            input: apiMessages,
            stream: true,
          };
          if (responseTools.length > 0) {
            body.tools = responseTools;
            body.tool_choice = "auto";
          }
          await streamOpenAIResponsesTools(
            "https://api.openai.com/v1/responses",
            {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${apiKey}`
            },
            body,
            callbacks
          );
        } else if (provider === "kimi") {
          const baseUrl = "https://api.moonshot.ai";
          const body: any = {
            model: model,
            messages: apiMessages,
            stream: true,
          };
          if (providerTools) {
            body.tools = providerTools;
            body.tool_choice = "auto";
          }
          await streamOpenAITools(
            `${baseUrl}/v1/chat/completions`,
            {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${apiKey}`
            },
            body,
            callbacks
          );
        } else if (provider === "google") {
          const body: any = {
            systemInstruction: { role: "user", parts: [{ text: systemContent }] },
            contents: apiMessages,
          };
          if (providerTools) {
            body.tools = [providerTools];
            body.toolConfig = { functionCallingConfig: { mode: "AUTO" } };
          }
          await streamGeminiTools(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
            { "Content-Type": "application/json" },
            body,
            callbacks
          );
        } else if (provider === "anthropic") {
          const body: any = {
            model: model,
            max_tokens: 4096,
            system: systemContent,
            messages: apiMessages,
            stream: true,
          };
          if (providerTools) {
            body.tools = providerTools;
          }
          await streamAnthropicTools(
            "https://api.anthropic.com/v1/messages",
            {
              "Content-Type": "application/json",
              "x-api-key": apiKey,
              "anthropic-version": "2023-06-01"
            },
            body,
            callbacks
          );
        }
      } catch (err: any) {
        updateAssistantContent(`Error: ${err.message || "Failed to get response"}. Please check your API key and model settings.`);
        setIsLoading(false);
      }
    }

    await streamWithTools(nextMessages, notesContextStr);
  }, [chatInput, isLoading, messages, attachedImages, isNoteRelatedQuery, fetchNotesContext]);

  return (
    <div
      ref={launcherFrameRef}
      className={cn(
      "flex max-w-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-zinc-900/95 ring-1 ring-white/10 backdrop-blur-3xl transition-all duration-200 relative",
      isExpandedView(view)
        ? "h-[calc(100vh-24px)] max-h-[calc(100vh-24px)] w-300 shadow-none"
        : "w-[min(680px,calc(100vw-24px))] shadow-[0_0_50px_-12px_rgba(0,0,0,0.5)]"
      )}
    >
      <div className="flex items-center px-4 py-4 border-b border-white/5">
        {view === "settings" ? (
          <SettingsIcon className="mr-3 h-5 w-5 text-zinc-400" />
        ) : view === "actions" ? (
          <Command className="mr-3 h-5 w-5 text-blue-400" />
        ) : view === "search" ? (
          <Search className="mr-3 h-5 w-5 text-zinc-400" />
        ) : view === "notes" ? (
          <StickyNote className="mr-3 h-5 w-5 text-amber-400" />
        ) : view === "docker" ? (
          <Box className="mr-3 h-5 w-5 text-cyan-400" />
        ) : (
          <MessageSquare className="mr-3 h-5 w-5 text-blue-400" />
        )}
        {view === "chat" && (
          <Tooltip content="Clear chat (Ctrl+R)">
            <button
              onClick={() => {
                setMessages([
                  { id: Date.now().toString(), role: "assistant", content: "Hello! I'm GQuick. I'm ready to help you with anything." }
                ]);
                setAttachedImages([]);
                setChatInput("");
              }}
              className="mr-2 p-1.5 hover:bg-white/5 rounded-lg text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
              aria-label="Clear chat"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          </Tooltip>
        )}
        {view === "chat" && selectedModel && (
          <Tooltip content={selectedModel} className="mr-2">
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-blue-500/10 border border-blue-500/20 text-[10px] text-blue-400 font-medium">
              <Bot className="h-3 w-3" />
            </div>
          </Tooltip>
        )}
        <input
          ref={inputRef}
          type="text"
          value={view === "chat" ? chatInput : view === "notes" ? notesSearchQuery : view === "docker" ? dockerSearchQuery : query}
          onChange={(e) => {
            if (view === "chat") setChatInput(e.target.value);
            else if (view === "notes") setNotesSearchQuery(e.target.value);
            else if (view === "docker") setDockerSearchQuery(e.target.value);
            else {
              const nextQuery = e.target.value;
              if (nextQuery === query) return;
              latestSearchQueryRef.current = nextQuery;
              searchRequestIdRef.current += 1;
              itemsRef.current = [];
              setItems([]);
              setQuery(nextQuery);
              setActiveIndex(0);
            }
          }}
          onKeyDown={(e) => {
            if (view === "chat" && e.key === "Enter") handleSendMessage();
            else handleKeyDown(e);
          }}
          disabled={view === "settings"}
          readOnly={view === "actions"}
          placeholder={view === "settings" ? "Settings" : view === "actions" ? "Actions" : view === "notes" ? "Search notes..." : view === "docker" ? "Search Docker Hub, images, containers..." : view === "search" ? "Search for apps, files, or ask anything..." : "Ask GQuick anything..."}
          className="min-w-0 flex-1 bg-transparent text-lg text-zinc-100 placeholder-zinc-500 outline-none disabled:opacity-50 read-only:opacity-50"
          spellCheck={false}
        />
        {view === "chat" ? (
          <>
            <button
              onClick={async () => {
                if (isLoading || attachedImages.length >= 5) return;
                try {
                  const images = await invoke<{ data_url: string; mime_type: string; base64: string }[]>("open_image_dialog");
                  if (images && images.length > 0) {
                    addImages(images.map(img => ({
                      dataUrl: img.data_url,
                      mimeType: img.mime_type,
                      base64: img.base64
                    })));
                  }
                } catch (err) {
                  console.error("Failed to open image dialog:", err);
                }
              }}
              disabled={isLoading || attachedImages.length >= 5}
              className="p-1.5 hover:bg-white/5 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-zinc-400 hover:text-zinc-200 transition-colors mr-1 cursor-pointer"
              aria-label="Attach image"
            >
              <ImagePlus className="h-4 w-4" />
            </button>
            <button
              onClick={handleSendMessage}
              disabled={isLoading || (!chatInput.trim() && attachedImages.length === 0)}
              className="p-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-white transition-colors cursor-pointer"
            >
              <Send className="h-4 w-4" />
            </button>
          </>
        ) : view === "notes" ? (
          <div className="flex items-center gap-2">
            <button
              onClick={() => window.dispatchEvent(new CustomEvent("gquick-notes-create"))}
              className="flex items-center gap-1 px-2.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-medium transition-colors cursor-pointer"
            >
              <Plus className="h-3 w-3" />
              New
            </button>
            <div
              className="flex items-center gap-2 rounded-md px-2 py-1 text-xs font-medium border transition-colors cursor-pointer bg-zinc-800 border-white/5 text-zinc-400 hover:bg-zinc-700"
              onClick={() => setView("actions")}
            >
              <Command className="h-3 w-3" />
              <span>K</span>
            </div>
          </div>
        ) : view === "docker" ? (
          <div className="flex items-center gap-2">
            <button
              onClick={() => window.dispatchEvent(new CustomEvent("gquick-docker-refresh"))}
              className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs hover:bg-white/10 cursor-pointer text-zinc-200"
            >
              <RefreshCw className="h-3 w-3" />
              <span className="hidden min-[520px]:inline">Refresh</span>
            </button>
            <div
              className="flex items-center gap-2 rounded-md px-2 py-1 text-xs font-medium border transition-colors cursor-pointer bg-zinc-800 border-white/5 text-zinc-400 hover:bg-zinc-700"
              onClick={() => setView("actions")}
            >
              <Command className="h-3 w-3" />
              <span>K</span>
            </div>
          </div>
        ) : (
          <div
            className={cn(
              "flex items-center gap-2 rounded-md px-2 py-1 text-xs font-medium border transition-colors cursor-pointer",
              view === "actions" ? "bg-blue-500/20 border-blue-500/50 text-blue-400" : "bg-zinc-800 border-white/5 text-zinc-400 hover:bg-zinc-700"
            )}
            onClick={() => setView(prev => prev === "actions" ? "search" : "actions")}
          >
            <Command className="h-3 w-3" />
            <span>K</span>
          </div>
        )}
      </div>

      {view === "chat" && attachedImages.length > 0 && (
        <div className="flex flex-row gap-2 overflow-x-auto px-4 py-2 bg-zinc-950/30 border-b border-white/5" aria-label="Attached images" role="region">
          {attachedImages.map((img, idx) => (
            <div key={idx} className="relative shrink-0 group">
              <img
                src={img.dataUrl}
                alt={`Attached image ${idx + 1}`}
                className="h-12 w-12 rounded-lg border border-white/10 object-cover bg-zinc-800"
              />
              <button
                onClick={() => removeAttachedImage(idx)}
                className="absolute -top-1.5 -right-1.5 h-4 w-4 flex items-center justify-center bg-zinc-900 border border-white/20 rounded-full hover:bg-zinc-800 hover:border-white/40 transition-colors cursor-pointer"
                aria-label="Remove image"
              >
                <X className="h-2.5 w-2.5 text-zinc-400" />
              </button>
            </div>
          ))}
        </div>
      )}

      {view === "search" && !query && (localStorage.getItem("ui-layout") ?? "default") === "compact" ? null : (
        <div className={cn("min-h-[40px] flex-1 overflow-hidden flex flex-col", isExpandedView(view) && "min-h-0")}>
          {view === "settings" ? (
              <Settings onClose={() => setView("search")} />
            ) : view === "actions" ? (
            <div ref={actionsScrollRef} className="h-[300px] overflow-y-auto p-4"
            >
              <div className="space-y-2">
                {/* App Actions */}
                {appActions.map((action, idx) => {
                  const Icon = action.icon;
                  const isActive = activeActionIndex === idx;
                  return (
                    <div
                      key={action.id}
                      data-action-active={isActive}
                      className={cn(
                        "flex items-center justify-between p-3 rounded-xl cursor-pointer text-zinc-200 transition-colors",
                        isActive ? "bg-white/10" : "hover:bg-white/10"
                      )}
                      onClick={action.onClick}
                    >
                      <div className="flex items-center gap-3">
                        <Icon className={cn("h-5 w-5", action.id === "chat" ? "text-blue-400" : action.id === "notes" ? "text-amber-400" : action.id === "docker" ? "text-cyan-400" : "text-zinc-400")} />
                        <span>{action.label}</span>
                      </div>
                      <span className="text-xs text-zinc-500">{action.shortcut}</span>
                    </div>
                  );
                })}

                {/* Plugins Section */}
                <div className="pt-4 mt-2 border-t border-white/10">
                  <h4 className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest mb-2 px-1">Plugins</h4>
                  <div className="space-y-1">
                    {pluginActions.map((plugin, idx) => {
                      const Icon = plugin.icon;
                      const actionIdx = appActions.length + idx;
                      const isActive = activeActionIndex === actionIdx;
                      return (
                        <div
                          key={plugin.id}
                          data-action-active={isActive}
                          className={cn(
                            "flex items-center gap-3 p-3 rounded-xl cursor-pointer text-zinc-200 transition-colors",
                            isActive ? "bg-white/10" : "hover:bg-white/10"
                          )}
                          onClick={() => {
                            const trigger = plugin.queryPrefixes && plugin.queryPrefixes.length > 0
                              ? formatQueryPrefix(plugin.queryPrefixes[0])
                              : plugin.keywords[0] || plugin.label.toLowerCase();
                            setView("search");
                            setQuery(trigger + " ");
                            inputRef.current?.focus();
                          }}
                        >
                          <Icon className="h-5 w-5 text-zinc-400 shrink-0" />
                          <div className="flex flex-col min-w-0 flex-1">
                            <span className="text-sm truncate">{plugin.label}</span>
                            {plugin.subtitle && <span className="text-[11px] text-zinc-500 truncate">{plugin.subtitle}</span>}
                          </div>
                          <span className="text-xs text-zinc-600 font-mono shrink-0">
                            {plugin.queryPrefixes && plugin.queryPrefixes.length > 0
                              ? plugin.queryPrefixes.map(formatQueryPrefix).join(", ")
                              : plugin.keywords.slice(0, 2).join(", ")}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          ) : view === "notes" ? (
            <NotesView initialNoteId={initialNoteId ?? undefined} searchQuery={notesSearchQuery} />
          ) : view === "docker" ? (
            <DockerView initialImage={dockerInitialImage} searchQuery={dockerSearchQuery} onSearchQueryChange={setDockerSearchQuery} />
          ) : view === "chat" ? (
            <div className={cn("flex flex-col", isExpandedView(view) ? "flex-1 overflow-hidden min-h-0" : "h-[300px]")}>
              <div ref={chatScrollRef} onScroll={handleChatScroll} className="flex-1 overflow-y-auto p-4 space-y-6 relative">
                {notesContext && (
                  <div className="flex flex-col gap-1.5 px-3 py-2 rounded-xl bg-amber-500/5 border border-amber-500/10">
                    <div className="flex items-center gap-1.5 text-[11px] text-amber-400 font-medium">
                      <StickyNote className="h-3 w-3" />
                      <span>Notes used as context</span>
                    </div>
                    <div className="space-y-1">
                      {notesContext.map((note, idx) => (
                        <div key={idx} className="text-[11px] text-zinc-400 truncate">
                          <span className="text-zinc-300 font-medium">{note.title}:</span> {note.content.substring(0, 100)}{note.content.length > 100 ? "..." : ""}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {messages.filter(msg => msg.role !== "tool").map(msg => (
                  <div key={msg.id} className={cn("flex gap-3", msg.role === "user" ? "flex-row-reverse" : "")}>
                    <div className={cn(
                      "h-8 w-8 rounded-full flex items-center justify-center shrink-0 border",
                      msg.role === "assistant" ? "bg-blue-500/20 border-blue-500/30 text-blue-400" : "bg-zinc-800 border-white/10 text-zinc-400"
                    )}>
                      {msg.role === "assistant" ? "G" : <User className="h-4 w-4" />}
                    </div>
                    <div className={cn(
                      "rounded-2xl px-4 py-2 text-sm max-w-[85%] border break-words overflow-hidden",
                      msg.role === "assistant" ? "bg-white/5 text-zinc-200 border-white/5" : "bg-blue-600/10 text-blue-100 border-blue-500/20"
                    )}>
                      {msg.role === "assistant" ? (
                        msg.content ? (
                          <MarkdownMessage content={msg.content} />
                        ) : (
                          <div className="flex items-center gap-2 text-zinc-400">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            <span>Thinking...</span>
                          </div>
                        )
                      ) : (
                        msg.content && <p>{msg.content}</p>
                      )}
                      {msg.images && msg.images.length > 0 && (
                        <div className={cn("grid gap-2 mt-2", msg.images.length === 1 ? "grid-cols-1" : "grid-cols-2")}>
                          {msg.images.map((img, idx) => (
                            <img
                              key={idx}
                              src={img.dataUrl}
                              alt={`Attached image ${idx + 1}`}
                              className={cn(
                                "rounded-lg border object-cover",
                                msg.images?.length === 1 ? "max-w-[280px] max-h-[200px]" : "max-h-[130px]",
                                msg.role === "assistant" ? "border-white/10" : "border-blue-500/20"
                              )}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                <div ref={chatEndRef} />
                {showScrollButton && (
                  <button
                    onClick={scrollToBottom}
                    className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-blue-500/20 border border-blue-500/30 text-blue-400 hover:bg-blue-500/30 rounded-full p-1.5 backdrop-blur transition-colors cursor-pointer z-10"
                    aria-label="Scroll to bottom"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          ) : query ? (
            <div ref={searchListRef} className="max-h-[500px] overflow-y-auto p-2">
              {isTranslating && (
                <div className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-400 mb-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Translating...
                </div>
              )}
              {inlineCommand && getTerminalCommand(query) !== null && (
                <div className="mb-2 rounded-xl border border-white/10 bg-zinc-950/70 overflow-hidden">
                  <div className="flex items-center justify-between gap-3 border-b border-white/5 px-3 py-2">
                    <div className="flex min-w-0 items-center gap-2">
                      {inlineCommand.status === "running" ? (
                        <Loader2 className="h-4 w-4 animate-spin text-emerald-400" />
                      ) : (
                        <Terminal className="h-4 w-4 text-emerald-400" />
                      )}
                      <div className="min-w-0">
                        <div className="truncate text-xs font-medium text-zinc-200">{inlineCommand.command}</div>
                        <div className="text-[10px] text-zinc-500">
                          {inlineCommand.status === "running"
                            ? "Running inline..."
                            : inlineCommand.status === "canceled"
                              ? "Canceled"
                              : inlineCommand.status === "blocked"
                                ? "Needs interactive terminal"
                                : inlineCommand.status === "failed"
                                  ? "Failed"
                                  : `Exited with code ${inlineCommand.exitCode ?? "unknown"}`}
                        </div>
                      </div>
                    </div>
                    {inlineCommand.status === "running" && (
                      <button
                        onClick={() => void cancelInlineCommand()}
                        className="rounded-lg border border-red-500/20 bg-red-500/10 px-2 py-1 text-[11px] font-medium text-red-300 hover:bg-red-500/20"
                      >
                        Cancel
                      </button>
                    )}
                    {inlineCommand.status === "blocked" && (
                      <button
                        onClick={() => void runExternalTerminalCommand(inlineCommand.command)}
                        className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-[11px] font-medium text-emerald-300 hover:bg-emerald-500/20"
                      >
                        Open Terminal
                      </button>
                    )}
                  </div>
                  <div className="max-h-64 overflow-auto p-3 font-mono text-[11px] leading-relaxed">
                    {inlineCommand.error && <pre className={cn("whitespace-pre-wrap break-words", inlineCommand.status === "blocked" ? "text-amber-300" : "text-red-300")}>{inlineCommand.error}</pre>}
                    {inlineCommand.stdout && (
                      <pre className="whitespace-pre-wrap break-words text-zinc-200">{inlineCommand.stdout}</pre>
                    )}
                    {inlineCommand.stderr && (
                      <pre className="mt-2 whitespace-pre-wrap break-words text-amber-300">{inlineCommand.stderr}</pre>
                    )}
                    {!inlineCommand.error && !inlineCommand.stdout && !inlineCommand.stderr && (
                      <div className="text-zinc-500">{inlineCommand.status === "running" ? "Waiting for output..." : "No output"}</div>
                    )}
                  </div>
                </div>
              )}
              {items.length > 0 ? (
                <div className="space-y-0.5">
                  {items.map((item, idx) => {
                    const Icon = item.icon;
                    const isActive = activeIndex === idx;
                    return (
                      <div key={item.id}>
                        <div
                          ref={(el) => {
                            if (isActive && el) {
                              el.scrollIntoView({
                                block: "nearest",
                                behavior: "smooth"
                              });
                            }
                          }}
                          className={cn(
                            "group flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-all duration-75",
                            isActive ? "bg-white/10 ring-1 ring-white/10 shadow-lg" : "hover:bg-white/5"
                          )}
                          onClick={() => trackAndSelect(item, query)}
                        >
                          <div className={cn(
                            "flex h-9 w-9 items-center justify-center rounded-lg border transition-colors",
                            isActive ? "bg-zinc-800 border-white/20 text-white" : "bg-zinc-900 border-white/5 text-zinc-400"
                          )}>
                            {typeof Icon === 'string' ? (
                              Icon.match(/^(\/|https?:\/\/|asset:\/\/|data:)/) ? (
                                <img src={Icon} alt="" className="h-8 w-8 object-contain" />
                              ) : (
                                Icon
                              )
                            ) : React.isValidElement(Icon) ? (
                              Icon
                            ) : (
                              // @ts-ignore - Icon is a LucideIcon component
                              <Icon className="h-6 w-6" />
                            )}
                          </div>
                          <div className="flex flex-col flex-1 min-w-0">
                            <span className="text-[14px] font-medium text-zinc-100 truncate">{item.titleNode ?? item.title}</span>
                            {(item.subtitleNode ?? item.subtitle) && <span className="text-[11px] text-zinc-500 truncate">{item.subtitleNode ?? item.subtitle}</span>}
                          </div>
                          <div className={cn(
                            "flex items-center transition-opacity duration-200 gap-2",
                            isActive ? "opacity-100" : "opacity-0"
                          )}>
                            {item.pluginId === "file-search" && isSmartSearchQuery(query) && (
                              <span className="px-1.5 py-0.5 rounded bg-purple-500/20 border border-purple-500/30 text-[10px] text-purple-400 font-medium">
                                Smart
                              </span>
                            )}
                            <ChevronRight className="h-4 w-4 text-zinc-600" />
                          </div>
                        </div>
                        {isActive && item.renderPreview && (
                          <div className="mx-2 mb-2 rounded-xl border border-white/5 bg-zinc-950/50 overflow-hidden">
                            {item.renderPreview()}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : isSearching || isTranslating ? (
                <div className="p-6 text-center">
                  <p className="text-sm text-zinc-500 italic font-medium">Waiting for results…</p>
                </div>
              ) : (
                <div className="p-6 text-center">
                  <p className="text-sm text-zinc-400 italic font-medium">No results found for "{query}"</p>
                </div>
              )}
              {isSearching && searchStatus && (
                <div className="mt-2 flex items-center gap-2 px-3 py-2 text-sm text-zinc-400">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {searchStatus}
                </div>
              )}
            </div>
          ) : view === "search" && !query ? (
            <SearchSuggestions ref={suggestionsRef} activeIndex={activeSuggestionIndex} onSelectQuery={handleSelectQuery} onOpenView={handleOpenView} onOpenApp={handleOpenApp} onOpenFile={handleOpenFile} />
          ) : null}
        </div>
      )}

      {isUpdateModalOpen && (
        <UpdateModal
          isOpen={isUpdateModalOpen}
          onClose={() => {
            setIsUpdateModalOpen(false);
            setAutoCheckUpdateInfo(null);
            setAutoCheckUpdateObj(null);
          }}
          autoCheck
          initialInfo={autoCheckUpdateInfo ?? undefined}
          initialUpdate={autoCheckUpdateObj ?? undefined}
        />
      )}

      <div className="flex shrink-0 items-center justify-between gap-3 border-t border-white/5 bg-zinc-950/40 px-4 py-2 text-[11px] font-medium text-zinc-500">
        <div className="flex min-w-0 items-center gap-3 overflow-hidden min-[560px]:gap-4">
          <div className="flex items-center gap-1.5 group cursor-pointer hover:text-zinc-300 transition-colors">
            <span className="rounded bg-zinc-800 px-1.5 py-0.5 border border-white/5 font-mono group-hover:bg-zinc-700 transition-colors text-zinc-300">↵</span>
            <span>Open</span>
          </div>
          <div className="flex min-w-0 items-center gap-1.5 group cursor-pointer hover:text-zinc-300 transition-colors" onClick={() => setView(prev => prev === "actions" ? "search" : "actions")}>
            <span className="rounded bg-zinc-800 px-1.5 py-0.5 border border-white/5 font-mono group-hover:bg-zinc-700 transition-colors text-zinc-300">{modKey}</span>
            <span className="rounded bg-zinc-800 px-1.5 py-0.5 border border-white/5 font-mono group-hover:bg-zinc-700 transition-colors text-zinc-300">K</span>
            <span className="truncate">Actions</span>
          </div>
        </div>
        <div
          className="flex shrink-0 items-center gap-2 cursor-pointer hover:text-zinc-300 transition-colors"
          onClick={() => setView(view === "search" ? "settings" : "search")}
        >
          <span>{view === "chat" ? "Search" : view === "search" ? "GQuick" : "Back"}</span>
          <SettingsIcon className="h-3.5 w-3.5" />
        </div>
      </div>
    </div>
  );
}

export default App;
