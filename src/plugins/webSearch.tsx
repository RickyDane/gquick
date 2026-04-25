import { Globe } from "lucide-react";
import { GQuickPlugin, SearchResultItem } from "./types";
import { openUrl } from "@tauri-apps/plugin-opener";

export const webSearchPlugin: GQuickPlugin = {
  metadata: {
    id: "web-search",
    title: "Web Search",
    icon: Globe,
    keywords: ["google", "search", "web", "find"],
    queryPrefixes: ["search:"],
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
