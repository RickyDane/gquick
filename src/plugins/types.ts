import React from "react";
import { LucideIcon } from "lucide-react";

export interface PluginAction {
  id: string;
  label: string;
  shortcut?: string;
  onRun: () => void;
}

export interface PluginMetadata {
  id: string;
  title: string;
  subtitle?: string;
  icon: LucideIcon;
  keywords: string[];
}

export interface SearchResultItem {
  id: string;
  pluginId: string;
  title: string;
  subtitle?: string;
  icon: LucideIcon | string | React.ReactNode;
  onSelect: () => void;
  actions?: PluginAction[];
  // Optional: allows a plugin to render a custom preview or details for this item
  renderPreview?: () => React.ReactNode;
  score?: number; // higher = more relevant, appears first
}

export interface GQuickPlugin {
  metadata: PluginMetadata;
  // Optional search debounce for plugins that perform expensive work or API calls.
  searchDebounceMs?: number;
  // Returns items based on query
  getItems: (query: string) => Promise<SearchResultItem[]>;
}
