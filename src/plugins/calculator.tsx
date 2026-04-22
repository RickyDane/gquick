import { Calculator } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { GQuickPlugin, SearchResultItem } from "./types";

export const calculatorPlugin: GQuickPlugin = {
  metadata: {
    id: "calculator",
    title: "Calculator",
    subtitle: "Simple math expressions",
    icon: Calculator,
    keywords: ["calc", "math", "add", "subtract", "multiply", "divide"],
  },
  getItems: async (query: string): Promise<SearchResultItem[]> => {
    if (!/^[-+*/.()0-9\s]+$/.test(query) || !/[0-9]/.test(query)) return [];

    try {
      const result = new Function(`return (${query})`)();

      if (typeof result !== "number" || isNaN(result) || !isFinite(result)) return [];

      return [{
        id: "calculator-result",
        pluginId: "calculator",
        title: `= ${result}`,
        subtitle: `Calculation: ${query}`,
        icon: Calculator,
        score: 100,
        onSelect: async () => {
          await navigator.clipboard.writeText(result.toString());
          await getCurrentWindow().hide();
        },
      }];
    } catch {
      return [];
    }
  },
};
