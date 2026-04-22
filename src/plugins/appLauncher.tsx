import { invoke } from "@tauri-apps/api/core";
import { AppWindow } from "lucide-react";
import { GQuickPlugin, SearchResultItem } from "./types";

interface AppInfo {
  name: string;
  path: string;
  icon?: string;
}

let appsCache: AppInfo[] = [];

export const appLauncherPlugin: GQuickPlugin = {
  metadata: {
    id: "app-launcher",
    title: "Applications",
    icon: AppWindow,
    keywords: ["open", "launch", "app"],
  },
  getItems: async (query: string): Promise<SearchResultItem[]> => {
    if (appsCache.length === 0) {
      appsCache = await invoke<AppInfo[]>("list_apps");
    }

    const queryLower = query.toLowerCase();
    const filtered = appsCache.filter((app) =>
      app.name.toLowerCase().includes(queryLower)
    );

    return filtered.map((app) => {
      const appNameLower = app.name.toLowerCase();
      let score: number | undefined;
      if (appNameLower.startsWith(queryLower)) {
        score = 100;
      } else if (appNameLower.includes(queryLower)) {
        score = 50;
      }

      return {
        id: app.path,
        pluginId: "app-launcher",
        title: app.name,
        subtitle: app.path,
        icon: AppWindow,
        score,
        onSelect: async () => {
          try {
            await invoke("open_app", { path: app.path });
          } catch (e) {
            console.error(e);
          }
        },
      };
    });
  },
};
