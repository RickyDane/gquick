import { File, Folder } from "lucide-react";
import { GQuickPlugin, SearchResultItem } from "./types";
import { getRecentItemsByPlugin, recordUsage } from "../utils/usageTracker";
import { invoke } from "@tauri-apps/api/core";

function normalizeSearchText(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function matchesRecentFileQuery(entry: { id: string; title: string }, query: string): boolean {
  const normalizedQuery = normalizeSearchText(query);
  const normalizedTitle = normalizeSearchText(entry.title);
  const normalizedPath = normalizeSearchText(entry.id);
  return normalizedTitle.includes(normalizedQuery) || normalizedPath.includes(normalizedQuery);
}

export const recentFilesPlugin: GQuickPlugin = {
  metadata: {
    id: "recent-files",
    title: "Recent Files",
    icon: File,
    keywords: ["recent", "file", "folder"],
  },
  shouldSearch: (query: string) => query.trim().length >= 2,
  // NO searchDebounceMs or getSearchDebounceMs = immediate plugin
  getItems: async (query: string): Promise<SearchResultItem[]> => {
    if (!query || query.length < 2) return [];

    const recentFiles = getRecentItemsByPlugin("file-search", 5);
    const results: SearchResultItem[] = [];

    for (const entry of recentFiles) {
      if (!matchesRecentFileQuery(entry, query)) continue;

      const isDir = entry.id.endsWith("/");
      results.push({
        id: entry.id,
        pluginId: "recent-files",
        title: entry.title,
        subtitle: entry.subtitle || entry.id,
        icon: isDir ? Folder : File,
        score: 200, // Higher than file search exact match (115)
        onSelect: async () => {
          recordUsage({
            id: entry.id,
            pluginId: "file-search", // Record as file-search for continuity
            title: entry.title,
            subtitle: entry.subtitle,
            icon: entry.icon,
            query: query,
          });
          try {
            await invoke("open_file", { path: entry.id });
          } catch (e) {
            console.error("Failed to open file:", e);
          }
        },
      });
    }

    return results;
  },
};
