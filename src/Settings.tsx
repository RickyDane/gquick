import { useState, useEffect, useRef, useCallback } from "react";
import { Key, Eye, EyeOff, Loader2, Command, Save, Power, AlertTriangle, MapPin, X, Download, RefreshCw } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import ShortcutRecorder from "./components/ShortcutRecorder";
import { getSavedLocation, saveLocation, clearSavedLocation, SavedLocation, searchLocations } from "./utils/location";
import UpdateModal from "./components/UpdateModal";

interface Model {
  id: string;
  name: string;
}

const ANTHROPIC_MODELS: Model[] = [
  { id: "claude-3-5-sonnet-20241022", name: "Claude 3.5 Sonnet" },
  { id: "claude-3-opus-20240229", name: "Claude 3 Opus" },
  { id: "claude-3-haiku-20240307", name: "Claude 3 Haiku" },
];

const PROVIDERS = [
  { id: "openai", name: "OpenAI" },
  { id: "google", name: "Google Gemini" },
  // { id: "kimi", name: "Kimi / Moonshot" },
  { id: "anthropic", name: "Anthropic Claude" },
];

export default function Settings({ onClose }: { onClose: () => void }) {
  const [apiKey, setApiKey] = useState("");
  const [apiProvider, setApiProvider] = useState("openai");
  const [showKey, setShowKey] = useState(false);
  const [selectedModel, setSelectedModel] = useState("");
  const [models, setModels] = useState<Model[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [modelError, setModelError] = useState("");
  const [mainShortcut, setMainShortcut] = useState("Alt+Space");
  const [screenshotShortcut, setScreenshotShortcut] = useState("Alt+S");
  const [ocrShortcut, setOcrShortcut] = useState("Alt+O");
  const [quickNoteShortcut, setQuickNoteShortcut] = useState("CmdOrCtrl+Shift+N");
  const [searchNotesShortcut, setSearchNotesShortcut] = useState("CmdOrCtrl+Shift+S");
  const [uiLayout, setUiLayout] = useState<"default" | "compact">("default");
  const [ocrEngine, setOcrEngine] = useState<"tesseract" | "ai">("tesseract");
  const [isMacOs, setIsMacOs] = useState(false);
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);
  const [appVersion, setAppVersion] = useState("0.1.0");
  const [isQuitDialogOpen, setIsQuitDialogOpen] = useState(false);
  const [isQuitting, setIsQuitting] = useState(false);
  const [quitError, setQuitError] = useState("");
  const quitButtonRef = useRef<HTMLButtonElement>(null);
  const cancelQuitRef = useRef<HTMLButtonElement>(null);
  const confirmQuitRef = useRef<HTMLButtonElement>(null);

  // Location state
  const [savedLocation, setSavedLocation] = useState<SavedLocation | null>(null);
  const [locationQuery, setLocationQuery] = useState("");
  const [locationResults, setLocationResults] = useState<SavedLocation[]>([]);
  const [isSearchingLocation, setIsSearchingLocation] = useState(false);
  const [locationError, setLocationError] = useState("");
  const locationAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const savedKey = localStorage.getItem("api-key");
    if (savedKey) setApiKey(savedKey);

    const savedProvider = localStorage.getItem("api-provider");
    if (savedProvider) setApiProvider(savedProvider);

    const savedModel = localStorage.getItem("selected-model");
    if (savedModel) setSelectedModel(savedModel);

    const savedShortcut = localStorage.getItem("main-shortcut");
    if (savedShortcut) setMainShortcut(savedShortcut);

    const savedScreenshotShortcut = localStorage.getItem("screenshot-shortcut");
    if (savedScreenshotShortcut) setScreenshotShortcut(savedScreenshotShortcut);

    const savedOcrShortcut = localStorage.getItem("ocr-shortcut");
    if (savedOcrShortcut) setOcrShortcut(savedOcrShortcut);

    const savedQuickNoteShortcut = localStorage.getItem("quick-note-shortcut");
    if (savedQuickNoteShortcut) setQuickNoteShortcut(savedQuickNoteShortcut);

    const savedSearchNotesShortcut = localStorage.getItem("search-notes-shortcut");
    if (savedSearchNotesShortcut) setSearchNotesShortcut(savedSearchNotesShortcut);

    const savedUiLayout = localStorage.getItem("ui-layout");
    if (savedUiLayout === "default" || savedUiLayout === "compact") {
      setUiLayout(savedUiLayout);
    }

    const savedOcrEngine = localStorage.getItem("ocr-engine");
    if (savedOcrEngine === "tesseract" || savedOcrEngine === "ai") {
      setOcrEngine(savedOcrEngine);
    } else {
      localStorage.setItem("ocr-engine", "tesseract");
    }

    invoke<string>("get_platform")
      .then((platform) => setIsMacOs(platform === "macos"))
      .catch(() => setIsMacOs(navigator.platform.toUpperCase().includes("MAC")));

    // Fetch app version
    getVersion()
      .then((version) => setAppVersion(version))
      .catch(() => {});

    // Load cached models if available
    const cachedModels = localStorage.getItem(`models-${savedProvider || "openai"}`);
    if (cachedModels) {
      try {
        setModels(JSON.parse(cachedModels));
      } catch {
        // ignore parse error
      }
    }

    // Load saved location
    setSavedLocation(getSavedLocation());
  }, []);

  // Fetch models when provider or api key changes
  useEffect(() => {
    let ignore = false;
    const controller = new AbortController();

    const fetchModels = async () => {
      if (!apiKey) {
        setModels([]);
        setSelectedModel("");
        return;
      }

      // Check cache first
      const cacheKey = `models-${apiProvider}`;
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          if (parsed.timestamp && Date.now() - parsed.timestamp < 86400000) {
            if (!ignore) {
              setModels(parsed.data);
              if (!selectedModel && parsed.data.length > 0) {
                setSelectedModel(parsed.data[0].id);
              }
            }
            return;
          }
        } catch {
          // ignore parse error, fetch fresh
        }
      }

      setIsLoadingModels(true);
      setModelError("");

      try {
        let fetchedModels: Model[] = [];

        if (apiProvider === "openai") {
          const res = await fetch("https://api.openai.com/v1/models", {
            headers: { Authorization: `Bearer ${apiKey}` },
            signal: controller.signal,
          });
          if (res.status === 429) throw new Error("Rate limited. Please wait a moment and try again.");
          if (!res.ok) throw new Error(`OpenAI API error: ${res.status}`);
          const data = await res.json();
          fetchedModels = data.data
            .filter((m: any) => m.id.startsWith("gpt-"))
            .map((m: any) => ({ id: m.id, name: m.id }))
            .sort((a: Model, b: Model) => a.id.localeCompare(b.id));
        } else if (apiProvider === "google") {
          const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
            { signal: controller.signal }
          );
          if (res.status === 429) throw new Error("Rate limited. Please wait a moment and try again.");
          if (!res.ok) throw new Error(`Google API error: ${res.status}`);
          const data = await res.json();
          fetchedModels = data.models
            .filter((m: any) => m.name.startsWith("models/gemini-"))
            .map((m: any) => ({ id: m.name.replace("models/", ""), name: m.displayName || m.name }))
            .sort((a: Model, b: Model) => a.id.localeCompare(b.id));
        } else if (apiProvider === "anthropic") {
          fetchedModels = ANTHROPIC_MODELS;
        } else if (apiProvider === "kimi") {
          const res = await fetch("https://api.moonshot.ai/v1/models", {
            headers: { Authorization: `Bearer ${apiKey}` },
            signal: controller.signal,
          });
          if (res.status === 429) throw new Error("Rate limited. Please wait a moment and try again.");
          if (!res.ok) throw new Error(`Kimi API error: ${res.status}`);
          const data = await res.json();
          fetchedModels = data.data
            .map((m: any) => ({ id: m.id, name: m.id }))
            .sort((a: Model, b: Model) => a.id.localeCompare(b.id));
        }

        if (!ignore) {
          setModels(fetchedModels);
          localStorage.setItem(cacheKey, JSON.stringify({ data: fetchedModels, timestamp: Date.now() }));

          if (fetchedModels.length > 0 && !selectedModel) {
            setSelectedModel(fetchedModels[0].id);
          }
        }
      } catch (err: any) {
        if (!ignore) {
          setModelError(err.message || "Failed to fetch models");
          setModels([]);
        }
      } finally {
        if (!ignore) {
          setIsLoadingModels(false);
        }
      }
    };

    const debounce = setTimeout(fetchModels, 500);
    return () => {
      ignore = true;
      controller.abort();
      clearTimeout(debounce);
    };
  }, [apiProvider, apiKey]);

  const handleLocationSearch = async () => {
    const query = locationQuery.trim();
    if (!query) return;

    if (locationAbortRef.current) {
      locationAbortRef.current.abort();
    }
    const controller = new AbortController();
    locationAbortRef.current = controller;

    setIsSearchingLocation(true);
    setLocationError("");
    setLocationResults([]);

    try {
      const results = await searchLocations(query, controller.signal);
      if (!controller.signal.aborted) {
        setLocationResults(results);
        if (results.length === 0) {
          setLocationError("No locations found");
        }
      }
    } catch (err: any) {
      if (err.name !== "AbortError") {
        setLocationError(err.message || "Search failed");
      }
    } finally {
      if (!controller.signal.aborted) {
        setIsSearchingLocation(false);
      }
    }
  };

  const handleSelectLocation = (loc: SavedLocation) => {
    saveLocation(loc);
    setSavedLocation(loc);
    setLocationResults([]);
    setLocationQuery("");
    window.dispatchEvent(new CustomEvent("gquick-weather-saved", { detail: loc.name }));
  };

  const handleClearLocation = () => {
    clearSavedLocation();
    setSavedLocation(null);
    setLocationResults([]);
    setLocationQuery("");
  };

  const saveSettings = () => {
    localStorage.setItem("api-key", apiKey);
    localStorage.setItem("api-provider", apiProvider);
    if (selectedModel) localStorage.setItem("selected-model", selectedModel);
    onClose();
  };

  const openQuitDialog = () => {
    setQuitError("");
    setIsQuitDialogOpen(true);
  };

  const closeQuitDialog = useCallback(() => {
    if (isQuitting) return;
    setIsQuitDialogOpen(false);
    setQuitError("");
    requestAnimationFrame(() => quitButtonRef.current?.focus());
  }, [isQuitting]);

  useEffect(() => {
    if (!isQuitDialogOpen) return;

    cancelQuitRef.current?.focus();

    const stopGlobalKeyHandlers = (event: KeyboardEvent) => {
      event.stopPropagation();
      event.stopImmediatePropagation();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        stopGlobalKeyHandlers(event);
        closeQuitDialog();
        return;
      }

      if (event.key === "Tab") {
        stopGlobalKeyHandlers(event);

        const focusableButtons = [cancelQuitRef.current, confirmQuitRef.current].filter(
          (button): button is HTMLButtonElement => button !== null && !button.disabled
        );

        if (focusableButtons.length === 0) {
          event.preventDefault();
          return;
        }

        const firstButton = focusableButtons[0];
        const lastButton = focusableButtons[focusableButtons.length - 1];
        const activeIndex = focusableButtons.findIndex((button) => button === document.activeElement);

        if (activeIndex === -1) {
          event.preventDefault();
          (event.shiftKey ? lastButton : firstButton).focus();
        } else if (event.shiftKey && document.activeElement === firstButton) {
          event.preventDefault();
          lastButton.focus();
        } else if (!event.shiftKey && document.activeElement === lastButton) {
          event.preventDefault();
          firstButton.focus();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [closeQuitDialog, isQuitDialogOpen]);

  const confirmQuit = async () => {
    setIsQuitting(true);
    setQuitError("");

    try {
      await invoke("quit_app");
    } catch (err) {
      setQuitError(err instanceof Error ? err.message : String(err));
      setIsQuitting(false);
    }
  };

  return (
    <div className="flex flex-col h-125 px-3 text-zinc-200">
      <div className="space-y-3 flex-1 overflow-y-auto py-3 pb-0 mb-2 custom-scrollbar">
        {/* Global Shortcut Configuration */}
        <div className="space-y-4 p-4 bg-white/5 border border-white/10 rounded-xl">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-zinc-300 flex items-center gap-2">
              <Command className="h-4 w-4 text-zinc-400" />
              Global Shortcut
            </label>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] text-zinc-500 font-bold uppercase ml-1">Open Window</span>
            <ShortcutRecorder
              value={mainShortcut}
              onChange={async (value) => {
                setMainShortcut(value);
                localStorage.setItem("main-shortcut", value);
                try {
                  await invoke("update_main_shortcut", { shortcut: value });
                } catch (err) {
                  console.error("Failed to update shortcut:", err);
                }
              }}
            />
            <p className="text-[11px] text-zinc-500 ml-1">
              Shortcut to open/close the GQuick launcher window
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] text-zinc-500 font-bold uppercase ml-1">Screenshot</span>
            <ShortcutRecorder
              value={screenshotShortcut}
              onChange={async (value) => {
                setScreenshotShortcut(value);
                localStorage.setItem("screenshot-shortcut", value);
                try {
                  await invoke("update_screenshot_shortcut", { shortcut: value });
                } catch (err) {
                  console.error("Failed to update screenshot shortcut:", err);
                }
              }}
            />
            <p className="text-[11px] text-zinc-500 ml-1">
              Shortcut to capture a screenshot of a selected region
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] text-zinc-500 font-bold uppercase ml-1">OCR</span>
            <ShortcutRecorder
              value={ocrShortcut}
              onChange={async (value) => {
                setOcrShortcut(value);
                localStorage.setItem("ocr-shortcut", value);
                try {
                  await invoke("update_ocr_shortcut", { shortcut: value });
                } catch (err) {
                  console.error("Failed to update OCR shortcut:", err);
                }
              }}
            />
            <p className="text-[11px] text-zinc-500 ml-1">
              Shortcut to extract text from a selected region
            </p>
          </div>
          {isMacOs && (
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] text-zinc-500 font-bold uppercase ml-1">OCR Engine</span>
              <select
                value={ocrEngine}
                onChange={(e) => {
                  const value = e.target.value as "tesseract" | "ai";
                  setOcrEngine(value);
                  localStorage.setItem("ocr-engine", value);
                }}
                className="w-full bg-zinc-800 border border-white/10 rounded-xl px-3 py-2 text-sm outline-none focus:border-blue-500/50 transition-all appearance-none cursor-pointer"
              >
                <option value="tesseract">Tesseract OCR (faster)</option>
                <option value="ai">AI OCR (better)</option>
              </select>
              <p className="text-[11px] text-zinc-500 ml-1">
                macOS only. Windows/Linux always use AI OCR.
              </p>
            </div>
          )}
          <div className="border-t border-white/5 pt-4 mt-2">
            <p className="text-[11px] text-zinc-500 font-bold uppercase ml-1 mb-3">Local Shortcuts (window focused)</p>
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] text-zinc-500 font-bold uppercase ml-1">Quick Note</span>
              <ShortcutRecorder
                value={quickNoteShortcut}
                onChange={(value) => {
                  setQuickNoteShortcut(value);
                  localStorage.setItem("quick-note-shortcut", value);
                }}
              />
              <p className="text-[11px] text-zinc-500 ml-1">
                Shortcut to start a quick note (prefills note: in search)
              </p>
            </div>
            <div className="flex flex-col gap-1.5 mt-3">
              <span className="text-[11px] text-zinc-500 font-bold uppercase ml-1">Search Notes</span>
              <ShortcutRecorder
                value={searchNotesShortcut}
                onChange={(value) => {
                  setSearchNotesShortcut(value);
                  localStorage.setItem("search-notes-shortcut", value);
                }}
              />
              <p className="text-[11px] text-zinc-500 ml-1">
                Shortcut to search your notes (prefills search notes: in search)
              </p>
            </div>
          </div>
          <div className="border-t border-white/5 pt-4 mt-2">
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] text-zinc-500 font-bold uppercase ml-1">UI Layout</span>
              <select
                value={uiLayout}
                onChange={(e) => {
                  const value = e.target.value as "default" | "compact";
                  setUiLayout(value);
                  localStorage.setItem("ui-layout", value);
                }}
                className="w-full bg-zinc-800 border border-white/10 rounded-xl px-3 py-2 text-sm outline-none focus:border-blue-500/50 transition-all appearance-none cursor-pointer"
              >
                <option value="default">Default</option>
                <option value="compact">Compact</option>
              </select>
              <p className="text-[11px] text-zinc-500 ml-1">
                Default shows suggestions when search is empty. Compact hides them.
              </p>
            </div>
          </div>
        </div>

        {/* API Key Configuration */}
        <div className="space-y-4 p-4 bg-white/5 border border-white/10 rounded-xl">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-zinc-300 flex items-center gap-2">
              <Key className="h-4 w-4 text-zinc-400" />
              API Configuration
            </label>
          </div>

          <div className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-100/90">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300" />
            <p>AI features are provided for your convenience and are used at your own discretion. Please review and verify outputs before relying on them.</p>
          </div>

          <div className="space-y-3">
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] text-zinc-500 font-bold uppercase ml-1">Provider</span>
              <select
                value={apiProvider}
                onChange={(e) => {
                  setApiProvider(e.target.value);
                  setSelectedModel("");
                  setModels([]);
                }}
                className="w-full bg-zinc-800 border border-white/10 rounded-xl px-3 py-2 text-sm outline-none focus:border-blue-500/50 transition-all appearance-none cursor-pointer"
              >
                {PROVIDERS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] text-zinc-500 font-bold uppercase ml-1">API Key</span>
              <div className="relative">
                <input
                  type={showKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Enter your API key..."
                  className="w-full bg-zinc-800 border border-white/10 rounded-xl px-3 py-2 text-sm outline-none focus:border-blue-500/50 transition-all"
                />
                <button
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 cursor-pointer"
                >
                  {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Model Selection */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] text-zinc-500 font-bold uppercase ml-1">Model</span>
              <div className="relative">
                {isLoadingModels ? (
                  <div className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-400 bg-zinc-800 border border-white/10 rounded-xl">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Fetching models...
                  </div>
                ) : modelError ? (
                  <div className="px-3 py-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl">
                    {modelError}
                  </div>
                ) : models.length > 0 ? (
                  <select
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    className="w-full bg-zinc-800 border border-white/10 rounded-xl px-3 py-2 text-sm outline-none focus:border-blue-500/50 transition-all appearance-none cursor-pointer"
                  >
                    {models.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="px-3 py-2 text-sm text-zinc-500 bg-zinc-800 border border-white/10 rounded-xl">
                    {apiKey ? "No models available" : "Enter an API key to fetch models"}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Location Configuration */}
        <div className="space-y-4 p-4 bg-white/5 border border-white/10 rounded-xl">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-zinc-300 flex items-center gap-2">
              <MapPin className="h-4 w-4 text-zinc-400" />
              Location
            </label>
          </div>

          {savedLocation ? (
            <div className="flex items-center justify-between bg-zinc-800/50 border border-white/10 rounded-xl px-3 py-2">
              <div className="flex items-center gap-2 text-sm text-zinc-200">
                <span>📍</span>
                <span>{savedLocation.name}{savedLocation.country ? `, ${savedLocation.country}` : ""}</span>
              </div>
              <button
                onClick={handleClearLocation}
                className="p-1 hover:bg-white/10 rounded-lg text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
                aria-label="Clear location"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <p className="text-xs text-zinc-500">No location set. Search for a city to set your default location.</p>
          )}

          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <input
                type="text"
                value={locationQuery}
                onChange={(e) => setLocationQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void handleLocationSearch();
                  }
                }}
                placeholder="Search for a city..."
                className="flex-1 bg-zinc-800 border border-white/10 rounded-xl px-3 py-2 text-sm outline-none focus:border-blue-500/50 transition-all"
              />
              <button
                onClick={() => void handleLocationSearch()}
                disabled={isSearchingLocation || !locationQuery.trim()}
                className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-xs font-medium transition-colors cursor-pointer"
              >
                {isSearchingLocation ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Searching...</span>
                  </>
                ) : (
                  <span>Search</span>
                )}
              </button>
            </div>

            {locationError && (
              <div className="px-3 py-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl">
                {locationError}
              </div>
            )}

            {locationResults.length > 0 && (
              <div className="flex flex-col gap-1">
                {locationResults.map((result, idx) => (
                  <button
                    key={`${result.name}-${result.latitude}-${idx}`}
                    onClick={() => handleSelectLocation(result)}
                    className="flex items-center gap-2 px-3 py-2 text-left text-sm text-zinc-200 hover:bg-white/5 rounded-lg transition-colors cursor-pointer border border-transparent hover:border-white/10"
                  >
                    <MapPin className="h-4 w-4 text-zinc-500 shrink-0" />
                    <div className="flex flex-col min-w-0">
                      <span className="truncate">{result.name}</span>
                      {[result.admin1, result.country].filter(Boolean).join(", ") && (
                        <span className="text-xs text-zinc-500 truncate">{[result.admin1, result.country].filter(Boolean).join(", ")}</span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Updates */}
        <div className="space-y-4 p-4 bg-white/5 border border-white/10 rounded-xl">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-zinc-300 flex items-center gap-2">
              <Download className="h-4 w-4 text-zinc-400" />
              Updates
            </label>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-500">Current version: v{appVersion}</span>
            <button
              onClick={() => setIsUpdateModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 border border-white/10 rounded-lg text-xs font-medium text-zinc-300 transition-colors cursor-pointer"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Check for Updates
            </button>
          </div>
        </div>
      </div>

      <div className="py-3 border-t border-white/5 flex items-center justify-between gap-3">
        <button
          ref={quitButtonRef}
          type="button"
          aria-label="Quit GQuick"
          onClick={openQuitDialog}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer bg-red-500/10 text-red-300 border border-red-500/20 hover:bg-red-500/15 hover:text-red-200 hover:border-red-400/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40"
        >
          <Power className="h-4 w-4 text-red-400" />
          Quit GQuick
        </button>
        <button
          type="button"
          onClick={saveSettings}
          className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-xs font-medium transition-colors cursor-pointer"
        >
          <Save className="h-4 w-4" />
          Save
        </button>
      </div>

      {isUpdateModalOpen && (
        <UpdateModal
          isOpen={isUpdateModalOpen}
          onClose={() => setIsUpdateModalOpen(false)}
        />
      )}

      {isQuitDialogOpen && (
        <div className="fixed inset-0 z-50 bg-black/45 backdrop-blur-sm flex items-center justify-center p-4">
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="quit-dialog-title"
            aria-describedby="quit-dialog-description"
            className="w-full max-w-sm rounded-2xl bg-zinc-950/95 border border-white/10 shadow-2xl shadow-black/40 p-4"
          >
            <div className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
              <span className="h-7 w-7 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center">
                <AlertTriangle className="h-4 w-4" />
              </span>
              <h2 id="quit-dialog-title">Quit GQuick?</h2>
            </div>

            <p id="quit-dialog-description" className="mt-3 text-xs leading-5 text-zinc-400">
              This closes all GQuick windows and stops background shortcuts until you open the app again.
            </p>

            {quitError && (
              <div className="mt-3 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                Failed to quit GQuick: {quitError}
              </div>
            )}

            <div className="mt-4 flex justify-end gap-2">
              <button
                ref={cancelQuitRef}
                type="button"
                onClick={closeQuitDialog}
                disabled={isQuitting}
                className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-300 cursor-pointer border border-white/10 text-xs font-medium disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
              >
                Cancel
              </button>
              <button
                ref={confirmQuitRef}
                type="button"
                onClick={confirmQuit}
                disabled={isQuitting}
                aria-label="Quit GQuick"
                className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs cursor-pointer font-medium disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40 flex items-center gap-1.5"
              >
                {isQuitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {isQuitting ? "Quitting…" : "Quit"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
