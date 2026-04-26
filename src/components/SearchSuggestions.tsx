import React, { forwardRef } from "react";
import { MessageSquare, StickyNote, Box, Settings as SettingsIcon, Command, FileText, Folder } from "lucide-react";
import { cn } from "../utils/cn";
import { plugins } from "../plugins";
import { getRecentItems, recordUsage, type UsageEntry } from "../utils/usageTracker";

interface SearchSuggestionsProps {
  activeIndex: number;
  onSelectQuery: (query: string) => void;
  onOpenView: (view: "chat" | "notes" | "docker" | "settings" | "actions") => void;
  onOpenApp: (path: string) => void;
  onOpenFile: (path: string) => void;
}

const quickActions = [
  { id: "chat", label: "Chat", icon: MessageSquare, view: "chat" as const },
  { id: "notes", label: "Notes", icon: StickyNote, view: "notes" as const },
  { id: "docker", label: "Docker", icon: Box, view: "docker" as const },
  { id: "settings", label: "Settings", icon: SettingsIcon, view: "settings" as const },
  { id: "actions", label: "Actions", icon: Command, view: "actions" as const },
];

function getPluginIcon(pluginId: string) {
  const plugin = plugins.find((p) => p.metadata.id === pluginId);
  return plugin?.metadata.icon ?? Command;
}

function RecentIcon({ entry }: { entry: UsageEntry }) {
  if (entry.icon) {
    return (
      <img
        src={entry.icon}
        alt=""
        className="h-5 w-5 shrink-0 object-contain"
        onError={(e) => {
          // Fallback to generic icon on load error
          (e.target as HTMLImageElement).style.display = "none";
        }}
      />
    );
  }
  if (entry.pluginId === "file-search") {
    return entry.id.endsWith("/") || !entry.id.includes(".")
      ? <Folder className="h-5 w-5 shrink-0 text-zinc-400" />
      : <FileText className="h-5 w-5 shrink-0 text-zinc-400" />;
  }
  const Icon = getPluginIcon(entry.pluginId);
  return <Icon className="h-5 w-5 shrink-0 text-zinc-400" />;
}

function SearchSuggestions(
  { activeIndex, onSelectQuery, onOpenView, onOpenApp, onOpenFile }: SearchSuggestionsProps,
  ref: React.ForwardedRef<HTMLDivElement>
) {
  const recentItems = getRecentItems(8);
  let runningIndex = 0;

  const handleRecentClick = (entry: UsageEntry) => {
    recordUsage({
      id: entry.id,
      pluginId: entry.pluginId,
      title: entry.title,
      subtitle: entry.subtitle,
      icon: entry.icon,
      query: entry.query,
    });

    if (entry.pluginId === "app-launcher") {
      onOpenApp(entry.id);
    } else if (entry.pluginId === "file-search") {
      onOpenFile(entry.id);
    } else {
      onSelectQuery(entry.query);
    }
  };

  const handlePluginClick = (pluginId: string, keyword: string) => {
    const plugin = plugins.find((p) => p.metadata.id === pluginId);
    if (plugin) {
      recordUsage({
        id: plugin.metadata.id,
        pluginId: "__plugin_activation__",
        title: plugin.metadata.title,
        subtitle: plugin.metadata.subtitle,
        query: keyword ? keyword + " " : "",
      });
    }
    onSelectQuery(keyword ? keyword + " " : "");
  };

  return (
    <div ref={ref} className="max-h-[500px] overflow-y-auto p-4 space-y-4">
      {/* Recent */}
      {recentItems.length > 0 && (
        <div>
          <h3 className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest mb-2 px-1">
            Recent
          </h3>
          <div className="grid grid-cols-1 min-[560px]:grid-cols-2 gap-2">
            {recentItems.map((entry) => {
              const idx = runningIndex++;
              const isActive = activeIndex === idx;
              return (
                <button
                  type="button"
                  key={`${entry.pluginId}-${entry.id}`}
                  data-suggestion-active={isActive}
                  onClick={() => handleRecentClick(entry)}
                  className={cn(
                    "flex items-center gap-3 p-3 rounded-xl cursor-pointer text-left transition-colors",
                    isActive ? "bg-white/10" : "hover:bg-white/10"
                  )}
                >
                  <RecentIcon entry={entry} />
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="text-sm font-medium text-zinc-200 truncate">
                      {entry.title}
                    </span>
                    {entry.subtitle && (
                      <span className="text-[11px] text-zinc-500 truncate">
                        {entry.subtitle}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div>
        <h3 className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest mb-2 px-1">
          Quick Actions
        </h3>
        <div className="grid grid-cols-1 gap-2">
          {quickActions.map((action) => {
            const idx = runningIndex++;
            const isActive = activeIndex === idx;
            const Icon = action.icon;
            return (
              <button
                type="button"
                key={action.id}
                data-suggestion-active={isActive}
                onClick={() => onOpenView(action.view)}
                className={cn(
                  "flex items-center gap-3 p-3 rounded-xl cursor-pointer text-left transition-colors",
                  isActive ? "bg-white/10" : "hover:bg-white/10"
                )}
              >
                <Icon className="h-5 w-5 shrink-0 text-zinc-400" />
                <span className="text-sm font-medium text-zinc-200">{action.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Plugins */}
      <div>
        <h3 className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest mb-2 px-1">
          Plugins
        </h3>
        <div className="grid grid-cols-1 min-[560px]:grid-cols-2 gap-2">
          {plugins.map((plugin) => {
            const idx = runningIndex++;
            const isActive = activeIndex === idx;
            const Icon = plugin.metadata.icon;
            const keyword = plugin.metadata.keywords[0] || "";
            return (
              <button
                type="button"
                key={plugin.metadata.id}
                data-suggestion-active={isActive}
                onClick={() => handlePluginClick(plugin.metadata.id, keyword)}
                className={cn(
                  "flex items-center gap-3 p-3 rounded-xl cursor-pointer text-left transition-colors",
                  isActive ? "bg-white/10" : "hover:bg-white/10"
                )}
              >
                <Icon className="h-5 w-5 shrink-0 text-zinc-400" />
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="text-sm font-medium text-zinc-200 truncate">
                    {plugin.metadata.title}
                  </span>
                  {plugin.metadata.subtitle && (
                    <span className="text-[11px] text-zinc-500 truncate">
                      {plugin.metadata.subtitle}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default forwardRef(SearchSuggestions);
