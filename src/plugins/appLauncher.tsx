import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { AppWindow } from "lucide-react";
import { GQuickPlugin, SearchResultItem } from "./types";

interface AppInfo {
  name: string;
  path: string;
  icon?: string;
}

let appLaunchInFlight = false;

export const appLauncherPlugin: GQuickPlugin = {
  metadata: {
    id: "app-launcher",
    title: "Applications",
    icon: AppWindow,
    keywords: ["open", "launch", "app"],
  },
  getItems: async (query: string): Promise<SearchResultItem[]> => {
    const apps = await invoke<AppInfo[]>("list_apps");

    const queryLower = query.toLowerCase();
    const filtered = apps.filter((app) =>
      app.name.toLowerCase().includes(queryLower)
    );

    return filtered.map((app) => {
      const appNameLower = app.name.toLowerCase();
      let score: number | undefined;
      if (appNameLower === queryLower) {
        score = 120;
      } else if (appNameLower.startsWith(queryLower)) {
        score = 100;
      } else if (appNameLower.includes(queryLower)) {
        score = 50;
      }

      return {
        id: app.path,
        pluginId: "app-launcher",
        title: app.name,
        subtitle: app.path,
        icon: app.icon ? convertFileSrc(app.icon) : AppWindow,
        score,
        onSelect: async () => {
          if (appLaunchInFlight) {
            return;
          }

          appLaunchInFlight = true;
          const window = getCurrentWindow();
          const hidePromise = window.hide();
          const launchPromise = invoke("open_app", { path: app.path });

          void Promise.allSettled([hidePromise, launchPromise]).then(() => {
            appLaunchInFlight = false;
          });

          try {
            await launchPromise;
          } catch (e) {
            console.error(e);

            try {
              await hidePromise;
            } catch (hideError) {
              console.error(hideError);
            }

            try {
              await window.show();
              await window.setFocus();
            } catch (showError) {
              console.error(showError);
            }
          }
        },
      };
    });
  },
};
