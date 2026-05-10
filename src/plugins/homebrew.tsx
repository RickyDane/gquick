import { invoke } from "@tauri-apps/api/core"
import { openUrl } from "@tauri-apps/plugin-opener"
import { Beer, Download, ArrowUpCircle, Trash2, Info, ExternalLink } from "lucide-react"
import { GQuickPlugin, SearchResultItem } from "./types"

interface BrewPackage {
  name: string
  version: string
  tap: string
  desc?: string
  homepage?: string
  is_cask: boolean
  outdated: boolean
  latest_version?: string
}

interface BrewSearchResult {
  name: string
  description?: string
  version?: string
  tap: string
  is_cask: boolean
}

export const BREW_SEARCH_DEBOUNCE_MS = 300

const BREW_PREFIX_PATTERN = /^brew\s*:/i

function confirmRisk(message: string): boolean {
  return window.confirm(message)
}

function openHomebrew(opts?: { pkg?: { name: string; isCask: boolean }; searchTerm?: string }) {
  window.dispatchEvent(new CustomEvent("gquick-open-homebrew", { detail: opts }))
}

function getOpenHomebrewItem(subtitle = "Manage Homebrew packages", searchTerm?: string): SearchResultItem {
  return {
    id: "homebrew-open-page",
    pluginId: "homebrew",
    title: "Open Homebrew",
    subtitle,
    icon: Beer,
    score: 120,
    onSelect: () => openHomebrew({ searchTerm }),
  }
}

export const homebrewPlugin: GQuickPlugin = {
  metadata: {
    id: "homebrew",
    title: "Homebrew",
    icon: Beer,
    keywords: ["brew", "homebrew", "package", "formula", "cask"],
    queryPrefixes: ["brew:"],
  },
  shouldSearch: (query: string) => {
    return BREW_PREFIX_PATTERN.test(query.trim())
  },
  searchDebounceMs: BREW_SEARCH_DEBOUNCE_MS,
  getItems: async (query: string): Promise<SearchResultItem[]> => {
    const trimmedQuery = query.trim()
    if (!BREW_PREFIX_PATTERN.test(trimmedQuery)) {
      return []
    }

    const searchTerm = trimmedQuery.replace(BREW_PREFIX_PATTERN, "").trim()
    const q = searchTerm.toLowerCase()

    if (!q) {
      return [getOpenHomebrewItem("Type brew: <package> to search installed and remote packages.", searchTerm)]
    }

    const items: SearchResultItem[] = []

    let installedNames = new Set<string>()

    try {
      const installed = await invoke<BrewPackage[]>("brew_list")
      installedNames = new Set(installed.map((p) => p.name.toLowerCase()))
      installed
        .filter((p) => p.name.toLowerCase().includes(q))
        .slice(0, 10)
        .forEach((p) => {
          const actions: NonNullable<SearchResultItem["actions"]> = [
            {
              id: "upgrade",
              label: "Upgrade",
              onRun: () => {
                if (confirmRisk(`Upgrade ${p.name}?`)) {
                  void invoke("brew_upgrade", { name: p.name, cask: p.is_cask })
                }
              },
            },
            {
              id: "uninstall",
              label: "Uninstall",
              onRun: () => {
                if (confirmRisk(`Uninstall ${p.name}?`)) {
                  void invoke("brew_uninstall", { name: p.name, cask: p.is_cask, confirmed: true })
                }
              },
            },
            {
              id: "info",
              label: "Info",
              onRun: () => {
                openHomebrew({ pkg: { name: p.name, isCask: p.is_cask }, searchTerm })
              },
            },
            {
              id: "homepage",
              label: "Open Homebrew Page",
              onRun: () => {
                if (p.homepage) {
                  void openUrl(p.homepage)
                }
              },
            },
          ]

          items.push({
            id: `brew-installed-${p.name}`,
            pluginId: "homebrew",
            title: p.name,
            subtitle: `${p.is_cask ? "Cask" : "Formula"}: ${p.version}${p.outdated ? ` • outdated${p.latest_version ? ` (${p.latest_version} available)` : ""}` : ""}`,
            icon: Beer,
            onSelect: () => openHomebrew({ pkg: { name: p.name, isCask: p.is_cask }, searchTerm }),
            actions,
            score: p.outdated ? 105 : 100,
            renderPreview: () => <ActionRow actions={actions} />,
          })
        })
    } catch {
      items.push({
        id: "brew-local-error",
        pluginId: "homebrew",
        title: "Homebrew unavailable",
        subtitle: "Open Homebrew page for status",
        icon: Beer,
        onSelect: () => openHomebrew({ searchTerm }),
        score: 90,
      })
    }

    if (q.length >= 2) {
      try {
        const remote = await invoke<BrewSearchResult[]>("brew_search", { query: searchTerm })
        remote
          .filter((r) => !installedNames.has(r.name.toLowerCase()))
          .slice(0, 10)
          .forEach((r) => {
            const actions: NonNullable<SearchResultItem["actions"]> = [
              {
                id: "install",
                label: "Install",
                onRun: () => {
                  if (confirmRisk(`Install ${r.name}? This may take several minutes.`)) {
                    void invoke("brew_install", { name: r.name, cask: r.is_cask })
                  }
                },
              },
              {
                id: "info",
                label: "Info",
                onRun: () => {
                  openHomebrew({ pkg: { name: r.name, isCask: r.is_cask }, searchTerm })
                },
              },
              {
                id: "homepage",
                label: "Open Homebrew Page",
                onRun: () => {
                  void openUrl(`https://formulae.brew.sh/${r.is_cask ? "cask" : "formula"}/${r.name}`)
                },
              },
            ]

            items.push({
              id: `brew-remote-${r.name}`,
              pluginId: "homebrew",
              title: r.name,
              subtitle: `${r.is_cask ? "Cask" : "Formula"}${r.description ? ` • ${r.description}` : ""}`,
              icon: Download,
              onSelect: () => openHomebrew({ pkg: { name: r.name, isCask: r.is_cask }, searchTerm }),
              actions,
              score: 80,
              renderPreview: () => <ActionRow actions={actions} />,
            })
          })
      } catch {
        items.push({
          id: "brew-search-error",
          pluginId: "homebrew",
          title: "Homebrew search failed",
          subtitle: "Local packages are still available",
          icon: Beer,
          onSelect: () => {},
          score: 20,
        })
      }
    }

    if (items.length === 0) {
      items.push(getOpenHomebrewItem("No results found for brew: <package>", searchTerm))
    }

    return items
  },
}

function ActionRow({ actions }: { actions: NonNullable<SearchResultItem["actions"]> }) {
  return (
    <div className="flex flex-wrap gap-2 p-2">
      {actions.map((action) => {
        const icon =
          action.id === "install" ? (
            <Download className="h-3 w-3" />
          ) : action.id === "upgrade" ? (
            <ArrowUpCircle className="h-3 w-3" />
          ) : action.id === "uninstall" ? (
            <Trash2 className="h-3 w-3" />
          ) : action.id === "info" ? (
            <Info className="h-3 w-3" />
          ) : action.id === "homepage" ? (
            <ExternalLink className="h-3 w-3" />
          ) : null
        return (
          <button
            type="button"
            key={action.id}
            onClick={(e) => {
              e.stopPropagation()
              action.onRun()
            }}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg cursor-pointer bg-white/10 hover:bg-white/20 text-[11px] text-zinc-200 transition-colors"
          >
            {icon}
            <span>{action.label}</span>
          </button>
        )
      })}
    </div>
  )
}
