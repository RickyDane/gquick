import { invoke } from "@tauri-apps/api/core";
import { File, Folder, SearchX } from "lucide-react";
import { GQuickPlugin, SearchResultItem, ToolResult } from "./types";

interface FileInfo {
  name: string;
  path: string;
  is_dir: boolean;
}

interface SmartFileInfo {
  name: string;
  path: string;
  is_dir: boolean;
  created?: string;
  modified?: string;
  size: number;
  content_preview?: string;
  full_content?: string;
}

const SMART_SEARCH_KEYWORDS = [
  "find", "looking for", "files from", "about", "related to",
  "recent", "last week", "yesterday", "today", "last month",
  "content", "contains", "with text", "document about"
];

function isSmartSearchQuery(query: string): boolean {
  const lower = query.toLowerCase();
  return SMART_SEARCH_KEYWORDS.some(kw => lower.includes(kw));
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function formatDate(iso?: string): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return "";
  }
}

async function callAiRankFiles(query: string, files: SmartFileInfo[]): Promise<number[]> {
  const apiKey = localStorage.getItem("api-key");
  const provider = localStorage.getItem("api-provider") || "openai";
  const model = localStorage.getItem("selected-model");

  if (!apiKey || !model || files.length === 0) {
    return files.map((_, i) => i);
  }

  const fileDescriptions = files.map((f, i) => {
    const desc: any = {
      index: i,
      name: f.name,
      path: f.path,
      is_dir: f.is_dir,
      size: formatFileSize(f.size),
      modified: formatDate(f.modified),
    };
    // Include full content if available (up to 5000 chars to stay within token limits)
    if (f.full_content && f.full_content.length > 0) {
      desc.content = f.full_content.substring(0, 5000);
    } else if (f.content_preview && f.content_preview.length > 0) {
      desc.preview = f.content_preview.substring(0, 500);
    }
    return desc;
  });

  const prompt = `Given this search query: "${query}"

And these files with their FULL CONTENT where available:
${JSON.stringify(fileDescriptions, null, 2)}

Analyze the actual file contents to find the most relevant files.
Return ONLY the indices (0-based) of the most relevant files, ranked by relevance.
Consider: actual file contents, dates, file types, names, paths.
Return format: [5, 2, 8, 1] (most relevant first). If no files are relevant, return [].`;

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
          temperature: 0.1,
        }),
      });

      if (!res.ok) throw new Error(`API error: ${res.status}`);
      const data = await res.json();
      responseText = data.choices?.[0]?.message?.content || "[]";
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
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      const data = await res.json();
      responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
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
          max_tokens: 1024,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      const data = await res.json();
      responseText = data.content?.[0]?.text || "[]";
    }

    // Parse indices from response
    const match = responseText.match(/\[(.*?)\]/);
    if (match) {
      const indices = JSON.parse(`[${match[1]}]`) as number[];
      return indices.filter(i => i >= 0 && i < files.length);
    }
    return files.map((_, i) => i);
  } catch (e) {
    console.error("AI ranking failed:", e);
    return files.map((_, i) => i);
  }
}

export const fileSearchPlugin: GQuickPlugin = {
  metadata: {
    id: "file-search",
    title: "Files & Folders",
    icon: File,
    keywords: ["file", "folder", "open", "find"],
  },
  searchDebounceMs: 150,
  tools: [
    {
      name: "search_files",
      description: "Search the local filesystem for files and folders by name. Returns matching file paths with metadata.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search query for filenames or keywords",
          },
          max_results: {
            type: "integer",
            description: "Maximum number of results to return",
          },
        },
        required: ["query"],
      },
    },
  ],
  executeTool: async (_name: string, args: Record<string, any>): Promise<ToolResult> => {
    try {
      const files = await invoke<FileInfo[]>("search_files", { query: args.query });
      const maxResults = typeof args.max_results === "number" ? args.max_results : files.length;
      const sliced = files.slice(0, maxResults);
      return { content: JSON.stringify(sliced), success: true };
    } catch (err: any) {
      return { content: "", success: false, error: err.message || String(err) };
    }
  },
  getItems: async (query: string): Promise<SearchResultItem[]> => {
    if (!query || query.length < 2) {
      return [];
    }

    const smartMode = isSmartSearchQuery(query);

    const q = query.toLowerCase();
    const isFileQuery = q.includes("file") || q.includes("folder") || q.includes("open");

    if (!smartMode) {
      // Fast filename search (existing behavior)
      try {
        const files = await invoke<FileInfo[]>("search_files", { query });

        return files.map((file) => ({
          id: file.path,
          pluginId: "file-search",
          title: file.name,
          subtitle: file.path,
          icon: file.is_dir ? Folder : File,
          score: isFileQuery ? 100 : undefined,
          onSelect: async () => {
            try {
              await invoke("open_file", { path: file.path });
            } catch (e) {
              console.error("Failed to open file:", e);
            }
          },
        }));
      } catch (e) {
        console.error("File search error:", e);
        return [];
      }
    }

    // Smart search mode
    try {
      const smartFiles = await invoke<SmartFileInfo[]>("smart_search_files", { query });

      if (smartFiles.length === 0) {
        return [{
          id: "smart-search-empty",
          pluginId: "file-search",
          title: "Nothing found",
          subtitle: "No files match your smart search query",
          icon: SearchX,
          score: isFileQuery ? 90 : undefined,
          onSelect: () => {},
        }];
      }

      // Get AI-ranked indices
      const rankedIndices = await callAiRankFiles(query, smartFiles);

      // Reorder files based on AI ranking
      const orderedFiles = rankedIndices.map(i => smartFiles[i]);
      // Add any remaining files that weren't ranked
      const rankedSet = new Set(rankedIndices);
      smartFiles.forEach((file, i) => {
        if (!rankedSet.has(i)) orderedFiles.push(file);
      });

      return orderedFiles.map((file) => ({
        id: file.path,
        pluginId: "file-search",
        title: file.name,
        subtitle: `${file.path} · ${formatFileSize(file.size)}${file.modified ? " · " + formatDate(file.modified) : ""}`,
        icon: file.is_dir ? Folder : File,
        score: isFileQuery ? 90 : undefined,
        onSelect: async () => {
          try {
            await invoke("open_file", { path: file.path });
          } catch (e) {
            console.error("Failed to open file:", e);
          }
        },
      }));
    } catch (e) {
      console.error("Smart file search error:", e);
      return [];
    }
  },
};
