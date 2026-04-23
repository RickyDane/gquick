import React, { useState, useEffect, useRef, useCallback } from "react";
import { Search, Command, Settings as SettingsIcon, MessageSquare, ChevronRight, Send, User, Bot, Loader2, Zap, ImagePlus, X, RotateCcw, StickyNote } from "lucide-react";
import { cn } from "./utils/cn";
import { plugins } from "./plugins";
import { SearchResultItem } from "./plugins/types";
import Settings from "./Settings";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { MarkdownMessage } from "./components/MarkdownMessage";
import { Tooltip } from "./components/Tooltip";
import { NotesView } from "./components/NotesView";
import { isQuickTranslateQuery, performQuickTranslate } from "./utils/quickTranslate";
import { streamOpenAI, streamGemini, streamAnthropic } from "./utils/streaming";

const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
const modKey = isMac ? '⌘' : 'Ctrl';

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

interface ChatImage {
  dataUrl: string;
  mimeType: string;
  base64: string;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  images?: ChatImage[];
}

function App() {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [view, setView] = useState<"search" | "chat" | "settings" | "actions" | "notes">("search");
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
  const [attachedImages, setAttachedImages] = useState<ChatImage[]>([]);
  const [notesContext, setNotesContext] = useState<{ title: string; content: string }[] | null>(null);

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
    if (view !== "settings" && view !== "actions" && view !== "notes") {
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

  // Listen for notes plugin requesting to open notes view
  useEffect(() => {
    const handleOpenNotes = () => {
      setView("notes");
    };
    window.addEventListener("gquick-open-notes", handleOpenNotes);
    return () => window.removeEventListener("gquick-open-notes", handleOpenNotes);
  }, []);

  // Reset to idle search state when window is hidden
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
        setAttachedImages([]);
        setNotesContext(null);
      });
    };

    setupListener();

    return () => {
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
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setView(prev => prev === "actions" ? "search" : "actions");
      }

      if ((e.metaKey || e.ctrlKey) && e.key === "c" && view !== "actions") {
         e.preventDefault();
         setView("chat");
      }

      if ((e.metaKey || e.ctrlKey) && e.key === "n" && view !== "actions") {
        e.preventDefault();
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
          // Blur input to trigger Focused(false) event which hides window
          inputRef.current?.blur();
          getCurrentWindow().hide();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [view, attachedImages]);

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
    { id: "notes", label: "Notes", icon: StickyNote, shortcut: `${modKey} N`, onClick: () => setView("notes") },
    { id: "search-notes", label: "Search Notes", icon: Search, shortcut: `${modKey} ⇧ S`, onClick: () => { setView("search"); setQuery("search notes: "); inputRef.current?.focus(); } },
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
    // Only fetch notes context when the user is asking about notes
    const noteRelated = isNoteRelatedQuery(trimmedInput);
    const notesContextStr = noteRelated ? await fetchNotesContext(trimmedInput) : null;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: trimmedInput,
      images: attachedImages.length > 0 ? attachedImages : undefined
    };

    const assistantId = (Date.now() + 1).toString();

    setMessages(prev => [...prev, userMsg, {
      id: assistantId,
      role: "assistant",
      content: ""
    }]);
    setChatInput("");
    setAttachedImages([]);
    setNotesContext(notesContextStr ? notesContextStr.split("\n").filter(line => line.startsWith("  [")).map(line => {
      const match = line.match(/^\s*\[(.+?)\]: (.+)$/);
      return match ? { title: match[1], content: match[2] } : { title: "Note", content: line };
    }) : null);
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
      const systemContent = notesContextStr
        ? `You are GQuick, a helpful AI assistant. The user has shared their saved notes below. Use the notes to answer their question if relevant, but you can also draw on your general knowledge. If the notes contain the answer, reference them. If not, answer from your knowledge. Always format responses using Markdown.`
        : "You are GQuick, a helpful AI assistant. Always format your responses using Markdown for better readability. Use code blocks for code, lists for enumerations, bold/italic for emphasis, and tables when appropriate.";

      const userContentText = notesContextStr || trimmedInput;

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
              { role: "system", content: systemContent },
              ...history.map(m => ({
                role: m.role,
                content: m.images?.length
                  ? [
                      { type: "text", text: m.content },
                      ...m.images.map(img => ({
                        type: "image_url",
                        image_url: { url: img.dataUrl }
                      }))
                    ]
                  : m.content
              })),
              {
                role: "user",
                content: [
                  { type: "text", text: userContentText },
                  ...attachedImages.map(img => ({
                    type: "image_url",
                    image_url: { url: img.dataUrl }
                  }))
                ]
              }
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
            systemInstruction: { role: "user", parts: [{ text: systemContent }] },
            contents: [
              ...history.map(m => ({
                role: m.role === "assistant" ? "model" : "user",
                parts: [
                  { text: m.content },
                  ...(m.images?.map(img => ({
                      inlineData: {
                        mimeType: img.mimeType,
                        data: img.base64
                      }
                    })) || [])
                ]
              })),
              {
                role: "user",
                parts: [
                  { text: userContentText },
                  ...attachedImages.map(img => ({
                    inlineData: {
                      mimeType: img.mimeType,
                      data: img.base64
                    }
                  }))
                ]
              }
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
            system: systemContent,
            messages: [
              ...history.map(m => ({
                role: m.role,
                content: m.images?.length
                  ? [
                      { type: "text", text: m.content },
                      ...m.images.map(img => ({
                        type: "image",
                        source: {
                          type: "base64",
                          media_type: img.mimeType,
                          data: img.base64
                        }
                      }))
                    ]
                  : m.content
              })),
              {
                role: "user",
                content: [
                  { type: "text", text: userContentText },
                  ...attachedImages.map(img => ({
                    type: "image",
                    source: {
                      type: "base64",
                      media_type: img.mimeType,
                      data: img.base64
                    }
                  }))
                ]
              }
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
  }, [chatInput, isLoading, messages, attachedImages, isNoteRelatedQuery, fetchNotesContext]);

  return (
    <div className="w-[680px] rounded-2xl border border-white/10 bg-zinc-900/95 shadow-[0_0_50px_-12px_rgba(0,0,0,0.5)] backdrop-blur-3xl transition-all duration-200 ring-1 ring-white/10 flex flex-col relative overflow-hidden">
      <div className="flex items-center px-4 py-4 border-b border-white/5">
        {view === "settings" ? (
          <SettingsIcon className="mr-3 h-5 w-5 text-zinc-400" />
        ) : view === "actions" ? (
          <Command className="mr-3 h-5 w-5 text-blue-400" />
        ) : view === "search" ? (
          <Search className="mr-3 h-5 w-5 text-zinc-400" />
        ) : view === "notes" ? (
          <StickyNote className="mr-3 h-5 w-5 text-amber-400" />
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
              className="mr-2 p-1.5 hover:bg-white/5 rounded-lg text-zinc-400 hover:text-zinc-200 transition-colors"
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
          disabled={view === "settings" || view === "notes"}
          readOnly={view === "actions"}
          placeholder={view === "settings" ? "Settings" : view === "actions" ? "Actions" : view === "notes" ? "Notes" : view === "search" ? "Search for apps, files, or ask anything..." : "Ask GQuick anything..."}
          className="flex-1 bg-transparent text-lg text-zinc-100 placeholder-zinc-500 outline-none disabled:opacity-50 read-only:opacity-50"
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
              className="p-1.5 hover:bg-white/5 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-zinc-400 hover:text-zinc-200 transition-colors mr-1"
              aria-label="Attach image"
            >
              <ImagePlus className="h-4 w-4" />
            </button>
            <button
              onClick={handleSendMessage}
              disabled={isLoading || (!chatInput.trim() && attachedImages.length === 0)}
              className="p-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-white transition-colors"
            >
              <Send className="h-4 w-4" />
            </button>
          </>
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
                className="absolute -top-1.5 -right-1.5 h-4 w-4 flex items-center justify-center bg-zinc-900 border border-white/20 rounded-full hover:bg-zinc-800 hover:border-white/40 transition-colors"
                aria-label="Remove image"
              >
                <X className="h-2.5 w-2.5 text-zinc-400" />
              </button>
            </div>
          ))}
        </div>
      )}

      {(view !== "search" || query) && (
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
                      <Icon className={cn("h-5 w-5", action.id === "chat" ? "text-blue-400" : action.id === "notes" ? "text-amber-400" : "text-zinc-400")} />
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
        ) : view === "notes" ? (
          <NotesView onClose={() => setView("search")} />
        ) : view === "chat" ? (
          <div className="flex flex-col h-[300px]">
            <div className="flex-1 overflow-y-auto p-4 space-y-6">
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
        ) : null}
      </div>
      )}

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
          onClick={() => setView(view === "settings" || view === "actions" || view === "notes" ? "search" : "settings")}
        >
          <span>{view === "chat" ? "Search" : view === "settings" || view === "actions" || view === "notes" ? "Back" : "GQuick"}</span>
          <SettingsIcon className="h-3.5 w-3.5" />
        </div>
      </div>
    </div>
  );
}

export default App;
