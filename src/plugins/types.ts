import React from "react";
import { LucideIcon } from "lucide-react";

export type ToolParameterType = "string" | "number" | "boolean" | "integer" | "array" | "object";

export interface ToolParameter {
  type: ToolParameterType;
  description?: string;
  enum?: (string | number)[];
  items?: ToolParameter;
  properties?: Record<string, ToolParameter>;
  required?: string[];
}

export interface PluginTool {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, ToolParameter>;
    required?: string[];
  };
}

export interface ToolResult {
  content: string;
  success: boolean;
  error?: string;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, any>;
}

export type QueryPrefixMatcher = string | RegExp;

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
  /**
   * Prefixes that explicitly route a launcher query to this plugin only.
   * String match is case-insensitive startsWith; RegExp match runs against trimmed query.
   */
  queryPrefixes?: QueryPrefixMatcher[];
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
  /** Optional tools this plugin exposes for AI chat */
  tools?: PluginTool[];
  /** Execute a tool by name with given arguments. Required if tools are defined. */
  executeTool?: (name: string, args: Record<string, any>) => Promise<ToolResult>;
}
