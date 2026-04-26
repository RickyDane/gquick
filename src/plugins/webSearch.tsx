import { Globe } from "lucide-react";
import { GQuickPlugin, SearchResultItem, ToolResult } from "./types";
import { openUrl } from "@tauri-apps/plugin-opener";
import { invoke } from "@tauri-apps/api/core";

export const webSearchPlugin: GQuickPlugin = {
  metadata: {
    id: "web-search",
    title: "Web Search",
    icon: Globe,
    keywords: ["google", "search", "web", "find"],
    queryPrefixes: ["search:"],
  },
  tools: [
    {
      name: "web_search",
      description: "Search the web for current information. Use this when you need up-to-date facts, news, or information that may not be in your training data.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The search query to look up",
          },
        },
        required: ["query"],
      },
    },
  ],
  executeTool: async (name: string, args: Record<string, any>): Promise<ToolResult> => {
    if (name !== "web_search") {
      return { content: "", success: false, error: `Unknown tool: ${name}` };
    }
    const query = args.query;
    if (typeof query !== "string" || !query.trim()) {
      return { content: "", success: false, error: "Missing query parameter" };
    }
    try {
      const results = await invoke<{ title: string; url: string; snippet: string }[]>("web_search", { query: query.trim() });
      if (results.length === 0) {
        return { content: "No results found.", success: true };
      }
      const formatted = results.map((r, i) => `${i + 1}. ${r.title}\n   URL: ${r.url}\n   ${r.snippet}`).join("\n\n");
      return { content: formatted, success: true };
    } catch (err: any) {
      return { content: "", success: false, error: err.message || String(err) };
    }
  },
  getItems: async (query: string): Promise<SearchResultItem[]> => {
    if (!query) return [];

    const searchPrefixMatch = query.trim().match(/^search:\s*/i);
    const searchQuery = searchPrefixMatch
      ? query.trim().substring(searchPrefixMatch[0].length).trim()
      : query;
    const q = query.toLowerCase();
    const isWebSearchQuery = q.includes("google") || q.includes("search") || q.includes("web");

    if (searchPrefixMatch && !searchQuery) {
      return [{
        id: "web-search-empty",
        pluginId: "web-search",
        title: "Search Google",
        subtitle: "Type a search query after 'search:'",
        icon: Globe,
        score: 100,
        onSelect: () => {},
      }];
    }

    return [{
      id: "web-search-google",
      pluginId: "web-search",
      title: searchQuery ? `Search Google for "${searchQuery}"` : "Search Google",
      subtitle: "Opens in your default browser",
      icon: Globe,
      score: isWebSearchQuery ? 100 : undefined,
      onSelect: async () => {
        try {
          await openUrl(`https://www.google.com/search?q=${encodeURIComponent(searchQuery)}`);
        } catch (e) {
          console.error("Failed to open URL", e);
        }
      },
    }];
  },
};
