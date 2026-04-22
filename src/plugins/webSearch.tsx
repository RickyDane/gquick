import { Globe } from "lucide-react";
import { GQuickPlugin, SearchResultItem } from "./types";
import { openUrl } from "@tauri-apps/plugin-opener";

export const webSearchPlugin: GQuickPlugin = {
  metadata: {
    id: "web-search",
    title: "Web Search",
    icon: Globe,
    keywords: ["google", "search", "web", "find"],
  },
  getItems: async (query: string): Promise<SearchResultItem[]> => {
    if (!query) return [];

    const q = query.toLowerCase();
    const isWebSearchQuery = q.includes("google") || q.includes("search") || q.includes("web");

    return [{
      id: "web-search-google",
      pluginId: "web-search",
      title: `Search Google for "${query}"`,
      subtitle: "Opens in your default browser",
      icon: Globe,
      score: isWebSearchQuery ? 100 : undefined,
      onSelect: async () => {
        try {
          await openUrl(`https://www.google.com/search?q=${encodeURIComponent(query)}`);
        } catch (e) {
          console.error("Failed to open URL", e);
        }
      },
    }];
  },
};
