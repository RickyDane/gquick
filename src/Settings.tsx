import { useState, useEffect } from "react";
import { Key, Eye, EyeOff, Loader2, Command } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";

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
  { id: "kimi", name: "Kimi / Moonshot" },
  { id: "anthropic", name: "Anthropic Claude" },
];

const SHORTCUT_OPTIONS = [
  { value: "Alt+Space", label: "Alt + Space" },
  { value: "CmdOrCtrl+Space", label: "Cmd/Ctrl + Space" },
  { value: "Alt+Shift+Space", label: "Alt + Shift + Space" },
  { value: "CmdOrCtrl+Shift+Space", label: "Cmd/Ctrl + Shift + Space" },
  { value: "Alt+Enter", label: "Alt + Enter" },
  { value: "CmdOrCtrl+Enter", label: "Cmd/Ctrl + Enter" },
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

  useEffect(() => {
    const savedKey = localStorage.getItem("api-key");
    if (savedKey) setApiKey(savedKey);

    const savedProvider = localStorage.getItem("api-provider");
    if (savedProvider) setApiProvider(savedProvider);

    const savedModel = localStorage.getItem("selected-model");
    if (savedModel) setSelectedModel(savedModel);

    const savedShortcut = localStorage.getItem("main-shortcut");
    if (savedShortcut) setMainShortcut(savedShortcut);

    // Load cached models if available
    const cachedModels = localStorage.getItem(`models-${savedProvider || "openai"}`);
    if (cachedModels) {
      try {
        setModels(JSON.parse(cachedModels));
      } catch {
        // ignore parse error
      }
    }
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
          const res = await fetch("https://api.moonshot.cn/v1/models", {
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

  const saveSettings = () => {
    localStorage.setItem("api-key", apiKey);
    localStorage.setItem("api-provider", apiProvider);
    if (selectedModel) localStorage.setItem("selected-model", selectedModel);
    onClose();
  };

  return (
    <div className="flex flex-col min-h-[350px] p-6 text-zinc-200">
      <div className="space-y-6 flex-1 overflow-y-auto pr-2 custom-scrollbar">
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
            <select
              value={mainShortcut}
              onChange={async (e) => {
                const value = e.target.value;
                setMainShortcut(value);
                localStorage.setItem("main-shortcut", value);
                try {
                  await invoke("update_main_shortcut", { shortcut: value });
                } catch (err) {
                  console.error("Failed to update shortcut:", err);
                }
              }}
              className="w-full bg-zinc-800 border border-white/10 rounded-xl px-3 py-2 text-sm outline-none focus:border-blue-500/50 transition-all appearance-none cursor-pointer"
            >
              {SHORTCUT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <p className="text-[11px] text-zinc-500 ml-1">
              Shortcut to open/close the GQuick launcher window
            </p>
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
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
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
      </div>

      <div className="pt-6 flex justify-end border-t border-white/5 mt-4">
        <button
          onClick={saveSettings}
          className="px-5 py-2 text-sm font-semibold bg-blue-600 hover:bg-blue-500 text-white rounded-xl transition-all"
        >
          Save
        </button>
      </div>
    </div>
  );
}
