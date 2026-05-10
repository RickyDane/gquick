import { appLauncherPlugin } from "./appLauncher";
import { calculatorPlugin } from "./calculator";
import { dockerPlugin } from "./docker";
import { homebrewPlugin } from "./homebrew";
import { webSearchPlugin } from "./webSearch";
import { fileSearchPlugin } from "./fileSearch";
import { recentFilesPlugin } from "./recentFiles";
import { translatePlugin } from "./translate";
import { notesPlugin } from "./notes";
import { networkInfoPlugin } from "./networkInfo";
import { speedtestPlugin } from "./speedtest";
import { weatherPlugin } from "./weather";
import { GQuickPlugin, QueryPrefixMatcher } from "./types";

export const plugins: GQuickPlugin[] = [
  appLauncherPlugin,
  recentFilesPlugin,
  fileSearchPlugin,
  calculatorPlugin,
  dockerPlugin,
  homebrewPlugin,
  webSearchPlugin,
  translatePlugin,
  notesPlugin,
  networkInfoPlugin,
  speedtestPlugin,
  weatherPlugin,
];

export function getExplicitPluginPrefixMatch(query: string): GQuickPlugin[] | null {
  const trimmedQuery = query.trim();
  const normalizedQuery = trimmedQuery.toLowerCase();
  const matchedPlugins = plugins.filter(plugin =>
    plugin.metadata.queryPrefixes?.some(prefix => matchesQueryPrefix(trimmedQuery, normalizedQuery, prefix))
  );

  return matchedPlugins.length > 0 ? matchedPlugins : null;
}

function matchesQueryPrefix(trimmedQuery: string, normalizedQuery: string, prefix: QueryPrefixMatcher): boolean {
  return typeof prefix === "string"
    ? normalizedQuery.startsWith(prefix.toLowerCase())
    : prefix.test(trimmedQuery);
}

export function getPluginsForQuery(query: string): GQuickPlugin[] {
  return getExplicitPluginPrefixMatch(query) ?? plugins;
}

export * from "./types";
