import React, { useState, useEffect, useRef, useCallback } from "react";
import { Search, Command, Settings as SettingsIcon, MessageSquare, ChevronRight, Send, User, Bot, Loader2, Zap } from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { plugins } from "./plugins";
import { SearchResultItem } from "./plugins/types";
import Settings from "./Settings";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { MarkdownMessage } from "./components/MarkdownMessage";
import { isQuickTranslateQuery, performQuickTranslate } from "./utils/quickTranslate";
import { streamOpenAI, streamGemini, streamAnthropic } from "./utils/streaming";

const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
const modKey = isMac ? '⌘' : 'Ctrl';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
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

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

function App() {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [view, setView] = useState<"search" | "chat" | "settings" | "actions">("search");
  const [activeActionIndex, setActiveActionIndex] = useState(0);
  const [items, setItems] = useState<SearchResultItem[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const actionsScrollRef = useRef<HTMLDivElement>(null);

  // Chat State
  const [messages, setMessages] = useState<Message[]>([
    { id: "1", role: "assistant", content: "Hello! I'm GQuick. I'm ready to help you with anything." }
  ]);
  const [chatInput, setChatInput] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);

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
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Reset to idle search state when window is hidden (so it's ready when shown again)
  useEffect(() => {
    let unlisten: UnlistenFn | undefined;

    const setupListener = async () => {
      unlisten = await listen("window-hidden", () => {
        setView("search");
        setQuery("");
        setActiveIndex(0);
        setActiveActionIndex(0);
        setChatInput("");
        setItems([]);
        setIsTranslating(false);
        setIsSearching(false);
      });
    };

    setupListener();

    return () => {
      unlisten?.();
    };
  }, []);

  // Global Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setView(prev => prev === "actions" ? "search" : "actions");
      }

      if ((e.metaKey || e.ctrlKey) && e.key === "c" && view !== "actions") {
         e.preventDefault();
         setView("chat");
      }

      if ((e.metaKey || e.ctrlKey) && e.key === "," && view !== "actions") {
         e.preventDefault();
         setView("settings");
      }

      if (e.key === "Escape") {
        if (view === "actions") {
          setView("search");
        } else if (view !== "search") {
          setView("search");
          setQuery("");
        } else {
          // Blur input to trigger Focused(false) event which hides window
          inputRef.current?.blur();
          getCurrentWindow().hide();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [view]);

  // Fetch items from plugins
  useEffect(() => {
    if (view !== "search" || !query) {
      setItems([]);
      setIsTranslating(false);
      return;
    }

    const quick = isQuickTranslateQuery(query);

    if (quick.isQuick && quick.text.length > 0) {
      // Handle quick translate directly with loading state
      // Use 400ms debounce for API calls to reduce unnecessary requests
      setIsTranslating(true);
      setItems([]);

      const doTranslate = async () => {
        const result = await performQuickTranslate(quick.text);
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

      const timer = setTimeout(doTranslate, 400);
      return () => clearTimeout(timer);
    }

    // Normal search flow - 150ms debounce for better UX
    const fetchItems = async () => {
      setIsSearching(true);
      try {
        const allItemsLists = await Promise.all(
          plugins.map(p => p.getItems(query))
        );

        const allItems = allItemsLists.flat();
        // Sort by score descending (undefined/null treated as 0)
        allItems.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
        setItems(allItems);
      } finally {
        setIsSearching(false);
      }
    };

    const timer = setTimeout(fetchItems, 150);
    return () => clearTimeout(timer);
  }, [query, view]);

  const totalItems = items.length;

  const appActions = [
    { id: "chat", label: "Open Chat", icon: MessageSquare, shortcut: `${modKey} C`, onClick: () => setView("chat") },
    { id: "settings", label: "Settings", icon: SettingsIcon, shortcut: `${modKey},`, onClick: () => setView("settings") },
  ];

  const pluginActions = plugins.map(p => ({
    id: p.metadata.id,
    label: p.metadata.title,
    subtitle: p.metadata.subtitle,
    icon: p.metadata.icon,
    keywords: p.metadata.keywords,
  }));

  const totalActionItems = appActions.length + pluginActions.length;

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
          // Type the plugin's first keyword into search to trigger it
          const keyword = plugin.keywords[0] || plugin.label.toLowerCase();
          setView("search");
          setQuery(keyword + " ");
          inputRef.current?.focus();
        }
        return;
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex(prev => Math.min(prev + 1, totalItems - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === "Enter") {
      if (totalItems > 0 && items[activeIndex]) {
        items[activeIndex].onSelect();
      }
    }
  };

  const handleSendMessage = useCallback(async () => {
    if (!chatInput.trim() || isLoading) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: chatInput.trim()
    };

    const assistantId = (Date.now() + 1).toString();

    setMessages(prev => [...prev, userMsg, {
      id: assistantId,
      role: "assistant",
      content: ""
    }]);
    setChatInput("");
    setIsLoading(true);

    const apiKey = localStorage.getItem("api-key");
    const provider = localStorage.getItem("api-provider") || "openai";
    const model = localStorage.getItem("selected-model");

    if (!apiKey || !model) {
      setMessages(prev => prev.map(m =>
        m.id === assistantId
          ? { ...m, content: `Please configure your API key and select a model in Settings (${modKey},) first.` }
          : m
      ));
      setIsLoading(false);
      return;
    }

    const updateAssistantContent = (text: string) => {
      setMessages(prev => prev.map(m =>
        m.id === assistantId ? { ...m, content: text } : m
      ));
    };

    try {
      const history = messages.filter(m => m.role !== "assistant" || m.id !== "1");

      if (provider === "openai" || provider === "kimi") {
        const baseUrl = provider === "kimi" ? "https://api.moonshot.ai" : "https://api.openai.com";
        await streamOpenAI(
          `${baseUrl}/v1/chat/completions`,
          {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`
          },
          {
            model: model,
            messages: [
              { role: "system", content: "You are GQuick, a helpful AI assistant. Always format your responses using Markdown for better readability. Use code blocks for code, lists for enumerations, bold/italic for emphasis, and tables when appropriate." },
              ...history.map(m => ({ role: m.role, content: m.content })),
              { role: "user", content: userMsg.content }
            ]
          },
          {
            onContent: updateAssistantContent,
            onDone: () => setIsLoading(false),
            onError: (error) => {
              updateAssistantContent(`Error: ${error}. Please check your API key and model settings.`);
              setIsLoading(false);
            }
          }
        );
      } else if (provider === "google") {
        await streamGemini(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
          { "Content-Type": "application/json" },
          {
            systemInstruction: { role: "user", parts: [{ text: "You are GQuick, a helpful AI assistant. Always format your responses using Markdown for better readability. Use code blocks for code, lists for enumerations, bold/italic for emphasis, and tables when appropriate." }] },
            contents: [
              ...history.map(m => ({
                role: m.role === "assistant" ? "model" : "user",
                parts: [{ text: m.content }]
              })),
              { role: "user", parts: [{ text: userMsg.content }] }
            ]
          },
          {
            onContent: updateAssistantContent,
            onDone: () => setIsLoading(false),
            onError: (error) => {
              updateAssistantContent(`Error: ${error}. Please check your API key and model settings.`);
              setIsLoading(false);
            }
          }
        );
      } else if (provider === "anthropic") {
        await streamAnthropic(
          "https://api.anthropic.com/v1/messages",
          {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01"
          },
          {
            model: model,
            max_tokens: 4096,
            system: "You are GQuick, a helpful AI assistant. Always format your responses using Markdown for better readability. Use code blocks for code, lists for enumerations, bold/italic for emphasis, and tables when appropriate.",
            messages: [
              ...history.map(m => ({ role: m.role, content: m.content })),
              { role: "user", content: userMsg.content }
            ]
          },
          {
            onContent: updateAssistantContent,
            onDone: () => setIsLoading(false),
            onError: (error) => {
              updateAssistantContent(`Error: ${error}. Please check your API key and model settings.`);
              setIsLoading(false);
            }
          }
        );
      }
    } catch (err: any) {
      updateAssistantContent(`Error: ${err.message || "Failed to get response"}. Please check your API key and model settings.`);
      setIsLoading(false);
    }
  }, [chatInput, isLoading, messages]);

  return (
    <div className="w-[680px] rounded-2xl border border-white/10 bg-zinc-900/95 shadow-[0_0_50px_-12px_rgba(0,0,0,0.5)] backdrop-blur-3xl transition-all duration-200 ring-1 ring-white/10 flex flex-col relative overflow-hidden">
      <div className="flex items-center px-4 py-4 border-b border-white/5">
        {view === "settings" ? (
          <SettingsIcon className="mr-3 h-5 w-5 text-zinc-400" />
        ) : view === "actions" ? (
          <Command className="mr-3 h-5 w-5 text-blue-400" />
        ) : view === "search" ? (
          <Search className="mr-3 h-5 w-5 text-zinc-400" />
        ) : (
          <MessageSquare className="mr-3 h-5 w-5 text-blue-400" />
        )}
        {view === "chat" && selectedModel && (
          <div className="mr-2 flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-blue-500/10 border border-blue-500/20 text-[10px] text-blue-400 font-medium">
            <Bot className="h-3 w-3" />
            {selectedModel}
          </div>
        )}
        <input
          ref={inputRef}
          type="text"
          value={view === "chat" ? chatInput : query}
          onChange={(e) => {
            if (view === "chat") setChatInput(e.target.value);
            else {
              setQuery(e.target.value);
              setActiveIndex(0);
            }
          }}
          onKeyDown={(e) => {
            if (view === "chat" && e.key === "Enter") handleSendMessage();
            else handleKeyDown(e);
          }}
          disabled={view === "settings"}
          readOnly={view === "actions"}
          placeholder={view === "settings" ? "Settings" : view === "actions" ? "Actions" : view === "search" ? "Search for apps, files, or ask anything..." : "Ask GQuick anything..."}
          className="flex-1 bg-transparent text-lg text-zinc-100 placeholder-zinc-500 outline-none disabled:opacity-50 read-only:opacity-50"
          spellCheck={false}
        />
        {view === "chat" ? (
          <button
            onClick={handleSendMessage}
            disabled={isLoading}
            className="p-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-white transition-colors"
          >
            <Send className="h-4 w-4" />
          </button>
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

      <div className="flex-1 overflow-hidden min-h-[40px]">
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
                      <Icon className={cn("h-5 w-5", action.id === "chat" ? "text-blue-400" : "text-zinc-400")} />
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
                          const keyword = plugin.keywords[0] || plugin.label.toLowerCase();
                          setView("search");
                          setQuery(keyword + " ");
                          inputRef.current?.focus();
                        }}
                      >
                        <Icon className="h-5 w-5 text-zinc-400 shrink-0" />
                        <div className="flex flex-col min-w-0 flex-1">
                          <span className="text-sm truncate">{plugin.label}</span>
                          {plugin.subtitle && <span className="text-[11px] text-zinc-500 truncate">{plugin.subtitle}</span>}
                        </div>
                        <span className="text-xs text-zinc-600 font-mono shrink-0">{plugin.keywords.slice(0, 2).join(", ")}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        ) : view === "chat" ? (
          <div className="flex flex-col h-[300px]">
            <div className="flex-1 overflow-y-auto p-4 space-y-6">
              {messages.map(msg => (
                <div key={msg.id} className={cn("flex gap-3", msg.role === "user" ? "flex-row-reverse" : "")}>
                  <div className={cn(
                    "h-8 w-8 rounded-full flex items-center justify-center shrink-0 border",
                    msg.role === "assistant" ? "bg-blue-500/20 border-blue-500/30 text-blue-400" : "bg-zinc-800 border-white/10 text-zinc-400"
                  )}>
                    {msg.role === "assistant" ? "G" : <User className="h-4 w-4" />}
                  </div>
                  <div className={cn(
                    "rounded-2xl px-4 py-2 text-sm max-w-[85%] border",
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
                      msg.content
                    )}
                  </div>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
          </div>
        ) : query ? (
          <div className="max-h-[500px] overflow-y-auto p-2">
            {isTranslating && (
              <div className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-400 mb-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Translating...
              </div>
            )}
            {isSearching && isSmartSearchQuery(query) && (
              <div className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-400 mb-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Analyzing files with AI...
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
                        onClick={item.onSelect}
                      >
                        <div className={cn(
                          "flex h-9 w-9 items-center justify-center rounded-lg border transition-colors",
                          isActive ? "bg-zinc-800 border-white/20 text-white" : "bg-zinc-900 border-white/5 text-zinc-400"
                        )}>
                          {typeof Icon === 'string' ? (
                            Icon
                          ) : React.isValidElement(Icon) ? (
                            Icon
                          ) : (
                            // @ts-ignore - Icon is a LucideIcon component
                            <Icon className="h-5 w-5" />
                          )}
                        </div>
                        <div className="flex flex-col flex-1 min-w-0">
                          <span className="text-[14px] font-medium text-zinc-100 truncate">{item.title}</span>
                          {item.subtitle && <span className="text-[11px] text-zinc-500 truncate">{item.subtitle}</span>}
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
            ) : (
              <div className="p-6 text-center">
                <p className="text-sm text-zinc-400 italic font-medium">No results found for "{query}"</p>
              </div>
            )}
          </div>
        ) : (
          <div className="p-6 text-center">
            <p className="text-sm text-zinc-500 font-medium tracking-tight">Search for apps, files, or use {modKey}K for actions</p>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-white/5 bg-zinc-950/40 px-4 py-2 text-[11px] text-zinc-500 font-medium">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 group cursor-pointer hover:text-zinc-300 transition-colors">
            <span className="rounded bg-zinc-800 px-1.5 py-0.5 border border-white/5 font-mono group-hover:bg-zinc-700 transition-colors text-zinc-300">↵</span>
            <span>Open</span>
          </div>
          <div className="flex items-center gap-1.5 group cursor-pointer hover:text-zinc-300 transition-colors" onClick={() => setView(prev => prev === "actions" ? "search" : "actions")}>
            <span className="rounded bg-zinc-800 px-1.5 py-0.5 border border-white/5 font-mono group-hover:bg-zinc-700 transition-colors text-zinc-300">{modKey}</span>
            <span className="rounded bg-zinc-800 px-1.5 py-0.5 border border-white/5 font-mono group-hover:bg-zinc-700 transition-colors text-zinc-300">K</span>
            <span>Actions</span>
          </div>
        </div>
        <div
          className="flex items-center gap-2 cursor-pointer hover:text-zinc-300 transition-colors"
          onClick={() => setView(view === "settings" || view === "actions" ? "search" : "settings")}
        >
          <span>{view === "chat" ? "Search" : view === "settings" || view === "actions" ? "Back" : "GQuick"}</span>
          <SettingsIcon className="h-3.5 w-3.5" />
        </div>
      </div>
    </div>
  );
}

export default App;
