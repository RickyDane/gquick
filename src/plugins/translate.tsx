import { useState } from "react";
import { Languages, Copy, Check, ArrowRight, Loader2 } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { GQuickPlugin, SearchResultItem } from "./types";

const LANGUAGES = [
  { code: "auto", name: "Auto-detect" },
  { code: "en", name: "English" },
  { code: "es", name: "Spanish" },
  { code: "fr", name: "French" },
  { code: "de", name: "German" },
  { code: "it", name: "Italian" },
  { code: "pt", name: "Portuguese" },
  { code: "ru", name: "Russian" },
  { code: "zh", name: "Chinese" },
  { code: "ja", name: "Japanese" },
  { code: "ko", name: "Korean" },
  { code: "ar", name: "Arabic" },
];

interface TranslateViewProps {
  initialText?: string;
}

function TranslateView({ initialText = "" }: TranslateViewProps) {
  const [text, setText] = useState(initialText);
  const [sourceLang, setSourceLang] = useState("auto");
  const [targetLang, setTargetLang] = useState("en");
  const [result, setResult] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  const handleTranslate = async () => {
    if (!text.trim()) return;

    const apiKey = localStorage.getItem("api-key");
    const provider = localStorage.getItem("api-provider") || "openai";
    const model = localStorage.getItem("selected-model");

    if (!apiKey || !model) {
      setError("Please configure your API key and model in Settings (⌘,) first.");
      return;
    }

    setIsLoading(true);
    setError("");
    setResult("");

    const sourceName = LANGUAGES.find(l => l.code === sourceLang)?.name || sourceLang;
    const targetName = LANGUAGES.find(l => l.code === targetLang)?.name || targetLang;

    const prompt = sourceLang === "auto"
      ? `Translate this text to ${targetName}:\n${text.trim()}\n\nReturn ONLY the translated text, no explanations.`
      : `Translate this text from ${sourceName} to ${targetName}:\n${text.trim()}\n\nReturn ONLY the translated text, no explanations.`;

    try {
      let responseText = "";

      if (provider === "openai" || provider === "kimi") {
        const baseUrl = provider === "kimi" ? "https://api.moonshot.ai" : "https://api.openai.com";
        const res = await fetch(`${baseUrl}/v1/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: model,
            messages: [{ role: "user", content: prompt }],
            temperature: 0.3,
          }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: { message: `HTTP ${res.status}` } }));
          throw new Error(err.error?.message || `API error: ${res.status}`);
        }

        const data = await res.json();
        responseText = data.choices?.[0]?.message?.content || "";
      } else if (provider === "google") {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ role: "user", parts: [{ text: prompt }] }],
            }),
          }
        );

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: { message: `HTTP ${res.status}` } }));
          throw new Error(err.error?.message || `API error: ${res.status}`);
        }

        const data = await res.json();
        responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
      } else if (provider === "anthropic") {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: model,
            max_tokens: 4096,
            messages: [{ role: "user", content: prompt }],
          }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: { message: `HTTP ${res.status}` } }));
          throw new Error(err.error?.message || `API error: ${res.status}`);
        }

        const data = await res.json();
        responseText = data.content?.[0]?.text || "";
      }

      setResult(responseText.trim());
    } catch (err: any) {
      setError(err.message || "Translation failed. Please check your API settings.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      await getCurrentWindow().hide();
    } catch {
      // ignore
    }
  };

  const handleSwapLanguages = () => {
    if (sourceLang === "auto") return;
    const temp = sourceLang;
    setSourceLang(targetLang);
    setTargetLang(temp);
  };

  return (
    <div className="flex flex-col gap-4 p-4 min-w-[500px]">
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <label className="text-[11px] text-zinc-500 font-bold uppercase mb-1 block">Source</label>
          <select
            value={sourceLang}
            onChange={(e) => setSourceLang(e.target.value)}
            className="w-full bg-zinc-800 border border-white/10 rounded-xl px-3 py-2 text-sm text-zinc-200 outline-none focus:border-blue-500/50 transition-all appearance-none cursor-pointer"
          >
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>{l.name}</option>
            ))}
          </select>
        </div>

        <button
          onClick={handleSwapLanguages}
          disabled={sourceLang === "auto"}
          className="mt-5 p-2 rounded-lg bg-zinc-800 border border-white/10 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
          title="Swap languages"
        >
          <ArrowRight className="h-4 w-4 rotate-90" />
        </button>

        <div className="flex-1">
          <label className="text-[11px] text-zinc-500 font-bold uppercase mb-1 block">Target</label>
          <select
            value={targetLang}
            onChange={(e) => setTargetLang(e.target.value)}
            className="w-full bg-zinc-800 border border-white/10 rounded-xl px-3 py-2 text-sm text-zinc-200 outline-none focus:border-blue-500/50 transition-all appearance-none cursor-pointer"
          >
            {LANGUAGES.filter(l => l.code !== "auto").map((l) => (
              <option key={l.code} value={l.code}>{l.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-[11px] text-zinc-500 font-bold uppercase">Text to translate</label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Enter text to translate..."
          rows={4}
          className="w-full bg-zinc-800 border border-white/10 rounded-xl px-3 py-2 text-sm text-zinc-200 placeholder-zinc-500 outline-none focus:border-blue-500/50 transition-all resize-none"
        />
      </div>

      <button
        onClick={handleTranslate}
        disabled={isLoading || !text.trim()}
        className="flex items-center justify-center gap-2 w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-sm font-semibold transition-all shadow-lg shadow-blue-900/30"
      >
        {isLoading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Translating...
          </>
        ) : (
          <>
            <Languages className="h-4 w-4" />
            Translate
          </>
        )}
      </button>

      {error && (
        <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
          {error}
        </div>
      )}

      {result && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <label className="text-[11px] text-zinc-500 font-bold uppercase">Translation</label>
            <button
              onClick={handleCopy}
              className="flex items-center gap-1 text-[11px] text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              {copied ? (
                <>
                  <Check className="h-3 w-3 text-green-400" />
                  <span className="text-green-400">Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3" />
                  Copy
                </>
              )}
            </button>
          </div>
          <textarea
            value={result}
            readOnly
            rows={4}
            className="w-full bg-zinc-900 border border-white/10 rounded-xl px-3 py-2 text-sm text-zinc-200 outline-none resize-none"
          />
        </div>
      )}
    </div>
  );
}

function isQuickTranslate(query: string): boolean {
  const trimmed = query.trim().toLowerCase();
  return trimmed.startsWith("t: ") || trimmed.startsWith("t:") ||
         trimmed.startsWith("tr: ") || trimmed.startsWith("tr:");
}

export const translatePlugin: GQuickPlugin = {
  metadata: {
    id: "translate",
    title: "Translate",
    subtitle: "AI-powered text translation",
    icon: Languages,
    keywords: ["translate", "translation", "language", "convert text"],
  },
  getItems: async (query: string): Promise<SearchResultItem[]> => {
    const trimmed = query.trim().toLowerCase();

    // Quick translate is handled directly in App.tsx for loading state control
    if (isQuickTranslate(query)) {
      return [];
    }

    // Full translate UI
    const isTranslateCommand = trimmed.startsWith("/translate") || trimmed.startsWith("translate:");
    const isTranslateKeyword = trimmed === "translate" || trimmed === "translation";
    const isTranslateQuery = isTranslateCommand || isTranslateKeyword;

    if (!isTranslateQuery) {
      return [];
    }

    // Extract initial text if provided after translate:
    let initialText = "";
    if (trimmed.startsWith("translate:")) {
      initialText = query.trim().substring("translate:".length).trim();
    } else if (trimmed.startsWith("/translate ")) {
      initialText = query.trim().substring("/translate ".length).trim();
    }

    return [{
      id: "translate-open",
      pluginId: "translate",
      title: "Translate Text",
      subtitle: "AI-powered translation",
      icon: Languages,
      score: isTranslateQuery ? 100 : undefined,
      onSelect: () => {
        // The plugin UI will be rendered inline when selected
      },
      renderPreview: () => {
        return <TranslateView initialText={initialText} />;
      },
    }];
  },
};
