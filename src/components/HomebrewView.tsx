import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { KeyboardEvent, PointerEvent as ReactPointerEvent } from "react"
import type { LucideIcon } from "lucide-react"
import { invoke } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"
import { openUrl } from "@tauri-apps/plugin-opener"
import { Loader2, Trash2, ArrowUpCircle, Download, X, ExternalLink, Info, Package, Monitor, Search, CheckCircle2, AlertTriangle } from "lucide-react"
import { cn } from "../utils/cn"
import { BREW_SEARCH_DEBOUNCE_MS } from "../plugins/homebrew"

type Tab = "installed" | "search" | "outdated"

type ConfirmDialogType =
  | { type: "uninstall"; name: string; cask: boolean }
  | { type: "upgrade"; name: string; cask: boolean }
  | { type: "upgrade-all"; count: number }
  | null

interface BrewStatus {
  installed: boolean
  version?: string
  prefix?: string
  error?: string
}

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

interface BrewInfo {
  name: string
  description?: string
  homepage?: string
  versions: { stable?: string; head?: string }
  installed: { version: string; installed_as_dependency: boolean; installed_on_request: boolean }[]
  caveats?: string
  dependencies: string[]
  tap: string
  is_cask: boolean
}

interface BrewOutdatedPackage {
  name: string
  installed_version: string
  current_version: string
  is_cask: boolean
}

interface BrewOperationStatus {
  running: boolean
  command?: string
  output: string
}

interface HomebrewViewProps {
  searchQuery: string
  onSearchQueryChange?: (q: string) => void
  initialPackage?: { name: string; isCask: boolean }
}

const detailPanelWidthKey = "homebrew-detail-panel-width"
const defaultDetailPanelWidth = 320
const minDetailPanelWidth = 240
const maxDetailPanelWidth = 640

function clampDetailPanelWidth(width: number, viewportWidth = window.innerWidth): number {
  return Math.round(
    Math.min(
      Math.max(width, minDetailPanelWidth),
      Math.min(maxDetailPanelWidth, Math.max(minDetailPanelWidth, viewportWidth - 180))
    )
  )
}

function initialDetailPanelWidth(): number {
  const savedWidth = Number(localStorage.getItem(detailPanelWidthKey))
  return clampDetailPanelWidth(
    Number.isFinite(savedWidth) && savedWidth > 0 ? savedWidth : defaultDetailPanelWidth
  )
}

function shortError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function formatTimeAgo(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffSec = Math.floor(diffMs / 1000)
  if (diffSec < 10) return "just now"
  if (diffSec < 60) return `${diffSec}s ago`
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin} min ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDay = Math.floor(diffHr / 24)
  return `${diffDay}d ago`
}

function EmptyState({ icon: Icon, title, subtitle, action }: { icon: LucideIcon; title: string; subtitle?: string; action?: { label: string; onClick: () => void } }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center p-6 text-center">
      <Icon className="h-8 w-8 text-zinc-600 mb-3" />
      <div className="text-sm text-zinc-400">{title}</div>
      {subtitle && <div className="text-[11px] text-zinc-600 mt-1">{subtitle}</div>}
      {action && (
        <button type="button" onClick={action.onClick} className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-xs text-amber-100 hover:bg-amber-500/20 cursor-pointer">
          {action.label}
        </button>
      )}
    </div>
  )
}

function SkeletonRows({ count = 5 }: { count?: number }) {
  return (
    <div className="min-h-0 flex-1 space-y-1 overflow-hidden pr-1">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2.5">
          <div className="w-32 h-4 bg-white/5 rounded animate-pulse" />
          <div className="w-48 h-3 bg-white/5 rounded mt-1.5 animate-pulse" />
        </div>
      ))}
    </div>
  )
}

export function HomebrewView({ searchQuery, onSearchQueryChange, initialPackage }: HomebrewViewProps) {
  const [tab, setTab] = useState<Tab>("installed")
  const [status, setStatus] = useState<BrewStatus | null>(null)
  const [installed, setInstalled] = useState<BrewPackage[]>([])
  const [searchResults, setSearchResults] = useState<BrewSearchResult[]>([])
  const [outdated, setOutdated] = useState<BrewOutdatedPackage[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [selected, setSelected] = useState<BrewInfo | null>(null)
  const [detailPanelWidth, setDetailPanelWidth] = useState(initialDetailPanelWidth)
  const [error, setError] = useState<string | null>(null)
  const [output, setOutput] = useState("Ready")
  const [isPanelLoading, setIsPanelLoading] = useState(false)
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null)
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogType>(null)
  const [pendingAction, setPendingAction] = useState<string | null>(null)
  const [searching, setSearching] = useState(false)
  const [showLogPopup, setShowLogPopup] = useState(false)
  const refreshSeq = useRef(0)
  const mountedRef = useRef(false)
  const searchSeq = useRef(0)
  const selectedRef = useRef<BrewInfo | null>(null)
  const selectSeq = useRef(0)

  useEffect(() => {
    selectedRef.current = selected
  }, [selected])

  const refresh = useCallback(async () => {
    const seq = ++refreshSeq.current
    setLoading(true)
    setError(null)
    try {
      const currentStatus = await invoke<BrewStatus>("brew_status")
      if (!mountedRef.current || seq !== refreshSeq.current) return
      setStatus(currentStatus)
      if (currentStatus.installed) {
        const nextInstalled = await invoke<BrewPackage[]>("brew_list")
        if (!mountedRef.current || seq !== refreshSeq.current) return
        setInstalled(nextInstalled)
        const nextOutdated = await invoke<BrewOutdatedPackage[]>("brew_outdated")
        if (!mountedRef.current || seq !== refreshSeq.current) return
        setOutdated(nextOutdated)
      }
      if (mountedRef.current && seq === refreshSeq.current) {
        setLastRefreshed(new Date())
      }
    } catch (err) {
      if (mountedRef.current && seq === refreshSeq.current) {
        setError(shortError(err))
      }
    } finally {
      if (mountedRef.current && seq === refreshSeq.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true

    const checkExisting = async () => {
      try {
        const status = await invoke<BrewOperationStatus>("brew_operation_status")
        if (status.running && mountedRef.current) {
          setBusy(true)
          setOutput(status.output || "Operation in progress...")
        }
      } catch {
        // Ignore
      }
    }
    checkExisting()

    let timeoutId: number | undefined
    const rafId = window.requestAnimationFrame(() => {
      timeoutId = window.setTimeout(() => void refresh(), 0)
    })
    return () => {
      mountedRef.current = false
      refreshSeq.current += 1
      window.cancelAnimationFrame(rafId)
      if (timeoutId !== undefined) window.clearTimeout(timeoutId)
    }
  }, [refresh])

  useEffect(() => {
    localStorage.setItem(detailPanelWidthKey, String(detailPanelWidth))
  }, [detailPanelWidth])

  useEffect(() => {
    let cancelled = false
    let unlisten: (() => void) | undefined
    const seenSeq = new Set<number>()

    const setup = async () => {
      const cleanup = await listen<{ chunk: string; seq: number; done: boolean; success: boolean }>(
        "brew-operation-output",
        (event) => {
          if (!mountedRef.current) return
          const { chunk, seq, done, success } = event.payload
          if (seenSeq.has(seq)) return
          seenSeq.add(seq)
          setOutput((prev) => prev + chunk)
          if (done) {
            setBusy(false)
            setPendingAction(null)
            if (success) {
              refresh()
              if (selectedRef.current && selectedRef.current.name) {
                invoke<BrewInfo>("brew_info", { name: selectedRef.current.name })
                  .then((info) => {
                    if (mountedRef.current) {
                      setSelected(info)
                    }
                  })
                  .catch((err) => {
                    if (mountedRef.current) {
                      setOutput(shortError(err))
                    }
                  })
              }
            }
          }
        }
      )
      if (!cancelled) {
        unlisten = cleanup
      } else {
        cleanup()
      }
    }

    setup()

    return () => {
      cancelled = true
      if (unlisten) unlisten()
    }
  }, [refresh])

  useEffect(() => {
    const handleRefresh = () => void refresh()
    window.addEventListener("gquick-homebrew-refresh", handleRefresh)
    return () => window.removeEventListener("gquick-homebrew-refresh", handleRefresh)
  }, [refresh])

  useEffect(() => {
    const clampToViewport = () => setDetailPanelWidth((width) => clampDetailPanelWidth(width))
    window.addEventListener("resize", clampToViewport)
    return () => window.removeEventListener("resize", clampToViewport)
  }, [])

  useEffect(() => {
    if (tab !== "search" || searchQuery.trim().length < 2) {
      setSearchResults([])
      setSearching(false)
      return
    }
    const seq = ++searchSeq.current
    setSearching(true)
    const timer = window.setTimeout(async () => {
      try {
        const results = await invoke<BrewSearchResult[]>("brew_search", { query: searchQuery })
        if (seq === searchSeq.current) {
          setSearchResults(results)
          setSearching(false)
        }
      } catch (err) {
        if (seq !== searchSeq.current) return
        setOutput(shortError(err))
        setSearching(false)
      }
    }, BREW_SEARCH_DEBOUNCE_MS)
    return () => {
      window.clearTimeout(timer)
    }
  }, [searchQuery, tab])

  async function runAction(action: () => Promise<unknown>, _label: string, actionId?: string) {
    if (actionId) setPendingAction(actionId)
    setBusy(true)
    setOutput("")
    try {
      await action()
      // Output and completion come from brew-operation-output events
    } catch (err) {
      if (mountedRef.current) {
        setBusy(false)
        setOutput(shortError(err))
        if (actionId) setPendingAction(null)
      }
    }
  }

  const filteredInstalled = useMemo(
    () =>
      installed.filter((p) =>
        `${p.name} ${p.tap} ${p.desc || ""}`.toLowerCase().includes(searchQuery.toLowerCase())
      ),
    [installed, searchQuery]
  )

  const filteredOutdated = useMemo(
    () =>
      outdated.filter((p) =>
        `${p.name} ${p.installed_version} ${p.current_version}`.toLowerCase().includes(searchQuery.toLowerCase())
      ),
    [outdated, searchQuery]
  )

  const selectPackage = useCallback(async (name: string, isCask: boolean) => {
    if (!name) {
      console.warn("selectPackage called without name", { name, isCask })
      return
    }
    const seq = ++selectSeq.current
    // Open panel instantly with minimal data
    setSelected({
      name,
      is_cask: isCask,
      tap: isCask ? "homebrew/cask" : "homebrew/core",
      versions: {},
      installed: [],
      dependencies: [],
      description: undefined,
      homepage: undefined,
      caveats: undefined,
    })
    setIsPanelLoading(true)
    try {
      const info = await invoke<BrewInfo>("brew_info", { name })
      if (mountedRef.current && selectSeq.current === seq) {
        setSelected(info)
        setIsPanelLoading(false)
      }
    } catch (err) {
      if (mountedRef.current && selectSeq.current === seq) {
        setOutput(shortError(err))
        setIsPanelLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    if (initialPackage) {
      void selectPackage(initialPackage.name, initialPackage.isCask)
    }
  }, [initialPackage, selectPackage])

  const startDetailPanelResize = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return
      event.preventDefault()
      const startX = event.clientX
      const startWidth = detailPanelWidth
      const previousCursor = document.body.style.cursor
      const previousUserSelect = document.body.style.userSelect
      document.body.style.cursor = "col-resize"
      document.body.style.userSelect = "none"
      const onPointerMove = (moveEvent: PointerEvent) => {
        setDetailPanelWidth(clampDetailPanelWidth(startWidth + startX - moveEvent.clientX))
      }
      const stopResize = () => {
        document.body.style.cursor = previousCursor
        document.body.style.userSelect = previousUserSelect
        window.removeEventListener("pointermove", onPointerMove)
        window.removeEventListener("pointerup", stopResize)
        window.removeEventListener("pointercancel", stopResize)
      }
      window.addEventListener("pointermove", onPointerMove)
      window.addEventListener("pointerup", stopResize)
      window.addEventListener("pointercancel", stopResize)
    },
    [detailPanelWidth]
  )

  const statusLabel = status?.installed
    ? status.version || "Installed"
    : status?.error || "Not installed"
  const statusClass = status?.installed
    ? "text-amber-300 border-amber-500/30 bg-amber-500/10"
    : "text-red-300 border-red-500/30 bg-red-500/10"

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 max-w-full flex-col overflow-hidden text-zinc-200">
      <div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden">
        <div className="w-24 shrink-0 border-r border-white/5 p-2 min-[620px]:w-32">
          {(["installed", "search", "outdated"] as Tab[]).map((item) => (
            <button
              type="button"
              key={item}
              onClick={() => { setTab(item); onSearchQueryChange?.("") }}
              className={cn(
                "mb-1 w-full truncate rounded-lg px-2 py-2 text-left text-xs capitalize cursor-pointer",
                tab === item ? "bg-white/10 text-white" : "text-zinc-400 hover:bg-white/5"
              )}
            >
              {item}
            </button>
          ))}
        </div>

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden p-3">
          <div className="flex min-w-0 items-center gap-2 mb-3">
            <span
              className={cn(
                "max-w-[150px] shrink-0 truncate rounded-full border px-2 py-0.5 text-[11px]",
                statusClass
              )}
            >
              ● {loading ? "Loading" : statusLabel}
            </span>
            {status?.prefix && (
              <span className="hidden min-w-0 truncate text-[11px] text-zinc-500 min-[620px]:block" title={status.prefix}>
                {status.prefix}
              </span>
            )}
            <div className="ml-auto flex items-center gap-2">
              {status?.installed && (
                <button
                  type="button"
                  onClick={() => {
                    void runAction(() => invoke("brew_update"), "Updating Homebrew", "brew-update")
                  }}
                  disabled={busy}
                  className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs hover:bg-white/10 cursor-pointer text-zinc-200 disabled:opacity-50"
                >
                  <ArrowUpCircle className="h-3 w-3" />
                  <span className="hidden min-[520px]:inline">Update</span>
                </button>
              )}
            </div>
          </div>

          {loading ? (
            <SkeletonRows />
          ) : error ? (
            <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-100">{error}</div>
          ) : !status?.installed ? (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-100">
              {status?.error || "Homebrew is not installed or not on PATH."}
            </div>
          ) : tab === "installed" ? (
            filteredInstalled.length === 0 ? (
              <EmptyState
                icon={Package}
                title="No packages installed yet."
                subtitle="Your Homebrew cellar is empty."
                action={onSearchQueryChange ? { label: "Go to Search", onClick: () => { setTab("search"); onSearchQueryChange("") } } : undefined}
              />
            ) : (
              <PackageRows
                pendingAction={pendingAction}
                items={filteredInstalled.map((p) => ({
                  id: `${p.is_cask ? "cask" : "formula"}-${p.name}`,
                  icon: p.is_cask ? "cask" as const : "formula" as const,
                  title: p.name,
                  subtitle: `${p.is_cask ? "Cask" : "Formula"} • ${p.version}${p.outdated ? ` • ${p.latest_version || "update available"}` : ""}`,
                   badge: p.is_cask ? "Cask" : "Formula",
                   onClick: () => selectPackage(p.name, p.is_cask),
                   actions: [
                     ...(p.outdated
                       ? [
                          {
                            id: "upgrade",
                            label: "Upgrade",
                            onRun: () => {
                          setConfirmDialog({ type: "upgrade", name: p.name, cask: p.is_cask })
                            },
                          },
                        ]
                      : []),
                    {
                      id: "uninstall",
                      label: "Uninstall",
                      destructive: true,
                      onRun: () => setConfirmDialog({ type: "uninstall", name: p.name, cask: p.is_cask }),
                    },
                    {
                       id: "info",
                       label: "Info",
                       onRun: () => selectPackage(p.name, p.is_cask),
                    },
                  ],
                }))}
              />
            )
          ) : tab === "search" ? (
            searchQuery.trim().length < 2 ? (
              <EmptyState
                icon={Search}
                title="Search Homebrew packages"
                subtitle="Type a package name to find formulae and casks."
              />
            ) : searching ? (
              <div className="flex min-h-0 flex-1 flex-col items-center justify-center p-6 text-center">
                <Loader2 className="h-6 w-6 animate-spin text-zinc-500 mb-3" />
                <div className="text-sm text-zinc-400">Searching Homebrew…</div>
              </div>
            ) : searchResults.length === 0 ? (
              <EmptyState
                icon={Search}
                title={`No packages found for "${searchQuery}"`}
                subtitle="Try a different search term."
              />
            ) : (
              <PackageRows
                pendingAction={pendingAction}
                items={searchResults.map((r) => ({
                  id: `${r.is_cask ? "cask" : "formula"}-${r.name}`,
                  icon: r.is_cask ? "cask" as const : "formula" as const,
                  title: r.name,
                  subtitle: `${r.is_cask ? "Cask" : "Formula"}${r.description ? ` • ${r.description}` : ""}${r.version ? ` • ${r.version}` : ""}`,
                   badge: r.is_cask ? "Cask" : "Formula",
                   onClick: () => selectPackage(r.name, r.is_cask),
                  actions: [
                    {
                      id: "install",
                      label: "Install",
                      onRun: () => {
                        void runAction(() => invoke("brew_install", { name: r.name, cask: r.is_cask }), `Install ${r.name}`, `install-${r.name}`)
                      },
                    },
                    {
                       id: "info",
                       label: "Info",
                       onRun: () => selectPackage(r.name, r.is_cask),
                    },
                  ],
                }))}
              />
            )
          ) : (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              {filteredOutdated.length > 0 && (
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-xs text-zinc-400">{filteredOutdated.length} outdated package(s)</span>
                  <button
                    type="button"
                    onClick={() => {
                      if (filteredOutdated.length > 5) {
                        setConfirmDialog({ type: "upgrade-all", count: filteredOutdated.length })
                      } else {
                        void runAction(() => invoke("brew_upgrade", { name: null, cask: false, confirmed: true }), "Upgrade all", "upgrade-all")
                      }
                    }}
                    disabled={busy}
                    className="inline-flex items-center gap-1 rounded-lg border border-amber-500/20 bg-amber-500/10 px-2 py-1 text-xs text-amber-100 hover:bg-amber-500/20 disabled:opacity-50 cursor-pointer"
                  >
                    <ArrowUpCircle className="h-3 w-3" />
                    Upgrade All
                  </button>
                </div>
              )}
              {filteredOutdated.length === 0 ? (
                <EmptyState
                  icon={CheckCircle2}
                  title="All packages are up to date."
                  subtitle="You're running the latest versions of all installed formulae and casks."
                />
              ) : (
                <PackageRows
                  pendingAction={pendingAction}
                  items={filteredOutdated.map((p) => ({
                    id: `${p.is_cask ? "cask" : "formula"}-${p.name}`,
                    icon: p.is_cask ? "cask" as const : "formula" as const,
                    title: p.name,
                    subtitle: `${p.is_cask ? "Cask" : "Formula"} • ${p.installed_version} → ${p.current_version}`,
                    badge: p.is_cask ? "Cask" : "Formula",
                    onClick: () => selectPackage(p.name, p.is_cask),
                    actions: [
                      {
                        id: "upgrade",
                        label: "Upgrade",
                        onRun: () => {
                          setConfirmDialog({ type: "upgrade", name: p.name, cask: p.is_cask })
                        },
                      },
                      {
                        id: "uninstall",
                        label: "Uninstall",
                        destructive: true,
                        onRun: () => setConfirmDialog({ type: "uninstall", name: p.name, cask: p.is_cask }),
                      },
                      {
                        id: "info",
                        label: "Info",
                        onRun: () => selectPackage(p.name, p.is_cask),
                      },
                    ],
                  }))}
                  emptyText="No outdated packages."
                />
              )}
            </div>
          )}
        </div>

        <DetailPanel
          info={selected}
          width={detailPanelWidth}
          onClose={() => setSelected(null)}
          onResizeStart={startDetailPanelResize}
          busy={busy}
          output={output}
          loading={isPanelLoading}
          pendingAction={pendingAction}
          onInstall={(name, cask) => {
            void runAction(() => invoke("brew_install", { name, cask }), `Install ${name}`, `install-${name}`)
          }}
          onUninstall={(name, cask) => {
            setConfirmDialog({ type: "uninstall", name, cask })
          }}
          onUpgrade={(name, cask) => {
            setConfirmDialog({ type: "upgrade", name, cask })
          }}
        />
      </div>

      <div className="shrink-0 border-t border-white/5 bg-white/[0.02] px-3 py-1.5 flex items-center gap-3 text-[11px] text-zinc-500">
        <span>{status?.version || "Homebrew"}</span>
        <span>•</span>
        <span>{installed.length} installed</span>
        <span>•</span>
        <span className={outdated.length > 0 ? "text-amber-400" : ""}>{outdated.length} outdated</span>
        <span>•</span>
        <button
          type="button"
          onClick={() => busy && setShowLogPopup(true)}
          disabled={!busy}
          className={cn(
            "truncate inline-flex items-center gap-1 cursor-pointer disabled:cursor-default disabled:opacity-100",
            busy && "hover:text-zinc-300"
          )}
        >
          {busy ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin" />
              Working...
            </>
          ) : (
            "Ready"
          )}
        </button>
        {busy && (
          <button
            type="button"
            onClick={() => {
              void invoke("brew_operation_cancel")
            }}
            className="inline-flex items-center gap-1 rounded-lg border border-red-500/20 bg-red-500/10 px-2 py-0.5 text-[11px] text-red-300 hover:bg-red-500/20 cursor-pointer"
          >
            <X className="h-3 w-3" />
            Cancel
          </button>
        )}
        {lastRefreshed && (
          <>
            <span>•</span>
            <span className="ml-auto">Last refreshed: {formatTimeAgo(lastRefreshed)}</span>
          </>
        )}
      </div>

      {showLogPopup && (
        <div
          className="fixed inset-0 z-40 flex items-end justify-center pb-10 px-4"
          onClick={() => setShowLogPopup(false)}
        >
          <div
            className="w-full max-w-2xl max-h-[50vh] rounded-xl border border-white/10 bg-zinc-950/95 p-3 shadow-2xl shadow-black/40 flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-zinc-300">Command Output</span>
              <button
                type="button"
                onClick={() => setShowLogPopup(false)}
                className="rounded p-1 text-zinc-500 hover:bg-white/5 cursor-pointer"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
            <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-white/5 bg-zinc-900/50 p-2 text-[11px] text-zinc-400 font-mono">
              {output}
            </pre>
          </div>
        </div>
      )}

      {confirmDialog?.type === "uninstall" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-zinc-950/95 p-4 shadow-2xl shadow-black/40">
            <div className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
              <span className="flex h-7 w-7 items-center justify-center rounded-full border border-red-500/20 bg-red-500/10 text-red-400">
                <AlertTriangle className="h-4 w-4" />
              </span>
              <h2>Uninstall {confirmDialog.name}?</h2>
            </div>
            <p className="mt-3 text-xs leading-5 text-zinc-400">
              This will remove {confirmDialog.name} and all associated files. This action cannot be undone.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDialog(null)}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-white/10 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const { name, cask } = confirmDialog
                  setConfirmDialog(null)
                  void runAction(() => invoke("brew_uninstall", { name, cask, confirmed: true }), `Uninstall ${name}`, `uninstall-${name}`)
                }}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/20 bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
              >
                {pendingAction?.startsWith("uninstall-") && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Uninstall
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDialog?.type === "upgrade-all" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-zinc-950/95 p-4 shadow-2xl shadow-black/40">
            <div className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
              <span className="flex h-7 w-7 items-center justify-center rounded-full border border-amber-500/20 bg-amber-500/10 text-amber-400">
                <ArrowUpCircle className="h-4 w-4" />
              </span>
              <h2>Upgrade {confirmDialog.count} packages?</h2>
            </div>
            <p className="mt-3 text-xs leading-5 text-zinc-400">
              This will upgrade all outdated formulae and casks.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDialog(null)}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-white/10 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmDialog(null)
                  void runAction(() => invoke("brew_upgrade", { name: null, cask: false, confirmed: true }), "Upgrade all", "upgrade-all")
                }}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/20 bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
              >
                {pendingAction === "upgrade-all" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Upgrade All
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDialog?.type === "upgrade" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-zinc-950/95 p-4 shadow-2xl shadow-black/40">
            <div className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
              <span className="flex h-7 w-7 items-center justify-center rounded-full border border-amber-500/20 bg-amber-500/10 text-amber-400">
                <ArrowUpCircle className="h-4 w-4" />
              </span>
              <h2>Upgrade {confirmDialog.name}?</h2>
            </div>
            <p className="mt-3 text-xs leading-5 text-zinc-400">
              This will upgrade <strong className="text-zinc-200">{confirmDialog.name}</strong> to the latest version.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDialog(null)}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-white/10 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const { name, cask } = confirmDialog
                  setConfirmDialog(null)
                  void runAction(() => invoke("brew_upgrade", { name, cask }), `Upgrade ${name}`, `upgrade-${name}`)
                }}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/20 bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
              >
                {pendingAction?.startsWith("upgrade-") && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Upgrade
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function PackageRows({
  items,
  pendingAction,
  emptyText = "No packages.",
}: {
  items: {
    id: string
    icon?: "formula" | "cask"
    title: string
    subtitle: string
    badge?: string
    onClick: () => void
    actions: { id: string; label: string; destructive?: boolean; onRun: () => void }[]
  }[]
  pendingAction?: string | null
  emptyText?: string
}) {
  if (items.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-6 text-center text-sm text-zinc-500">
        {emptyText}
      </div>
    )
  }
  return (
    <div className="min-h-0 flex-1 space-y-1 overflow-y-auto overflow-x-hidden pr-1">
      {items.map((item) => (
        <div
          key={item.id}
          className="flex w-full min-w-0 cursor-pointer items-center gap-2 rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2 text-left outline-none hover:bg-white/10"
        >
          <div className="min-w-0 flex-1" onClick={item.onClick} role="button" tabIndex={0} onKeyDown={(e: KeyboardEvent<HTMLDivElement>) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault()
              item.onClick()
            }
          }}>
            <div className="flex items-center gap-2">
              {item.icon === "cask" ? (
                <Monitor className="h-4 w-4 text-zinc-500 shrink-0" />
              ) : (
                <Package className="h-4 w-4 text-zinc-500 shrink-0" />
              )}
              <div className="truncate text-sm text-zinc-100">{item.title}</div>
              {item.badge && (
                <span className="shrink-0 rounded-full border border-white/10 bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400">
                  {item.badge}
                </span>
              )}
            </div>
            <div className="truncate text-[11px] text-zinc-500 ml-6">{item.subtitle}</div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {item.actions.map((action) => {
              const isPending = pendingAction === `${action.id}-${item.title}`
              const icon = isPending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : action.id === "install" ? (
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
                  disabled={isPending}
                  onClick={(e) => {
                    e.stopPropagation()
                    action.onRun()
                  }}
                  className={cn(
                    "inline-flex items-center rounded-lg px-2 py-1 text-[11px] cursor-pointer transition-colors",
                    action.destructive
                      ? "text-red-300 hover:bg-red-500/10"
                      : "text-zinc-400 hover:bg-white/10 hover:text-zinc-200",
                    isPending && "opacity-60 cursor-not-allowed"
                  )}
                >
                  {icon}
                  <span className="hidden min-[520px]:inline ml-1">{action.label}</span>
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

function DetailPanel({
  info,
  width,
  onClose,
  onResizeStart,
  busy,
  output,
  loading,
  pendingAction,
  onInstall,
  onUninstall,
  onUpgrade,
}: {
  info: BrewInfo | null
  width: number
  onClose: () => void
  onResizeStart: (event: ReactPointerEvent<HTMLDivElement>) => void
  busy: boolean
  output: string
  loading?: boolean
  pendingAction?: string | null
  onInstall: (name: string, cask: boolean) => void
  onUninstall: (name: string, cask: boolean) => void
  onUpgrade: (name: string, cask: boolean) => void
}) {
  if (!info) return null

  const resizeByKeyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!["Home", "End"].includes(event.key)) return
    event.preventDefault()
    if (event.key === "Home") onClose()
    // Simplified: no width keyboard resize for brevity
  }

  const isInstalled = info.installed.length > 0
  const actionIdPrefix = `${info.name}`

  return (
    <div
      className="absolute inset-y-0 right-0 z-10 flex min-w-0 flex-col border-l border-white/5 bg-zinc-950/95 p-3 shadow-2xl backdrop-blur"
      style={{ width }}
    >
      <div
        role="separator"
        tabIndex={0}
        aria-orientation="vertical"
        aria-label="Resize Homebrew detail panel"
        onPointerDown={onResizeStart}
        onKeyDown={resizeByKeyboard}
        className="absolute inset-y-0 -left-1.5 w-3 cursor-col-resize outline-none before:absolute before:inset-y-3 before:left-1/2 before:w-px before:-translate-x-1/2 before:bg-white/10 hover:before:bg-amber-400/60 focus-visible:before:bg-amber-400"
      />
      <div className="mb-3 flex min-w-0 items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-zinc-100">{info.name}</div>
          <div className="truncate text-[11px] text-zinc-500">
            {info.is_cask ? "Cask" : "Formula"} • {info.tap}
          </div>
        </div>
        <button type="button" aria-label="Close detail panel" onClick={onClose} className="shrink-0 rounded p-1 text-zinc-500 hover:bg-white/5 cursor-pointer">
          <X className="h-3 w-3" />
        </button>
      </div>

      <div className="mb-3 flex min-w-0 flex-wrap gap-2">
        {!isInstalled && (
          <button
            type="button"
            onClick={() => onInstall(info.name, info.is_cask)}
            disabled={busy || loading}
            className="inline-flex items-center gap-1 rounded-lg border border-amber-500/20 bg-amber-500/10 px-2 py-1 text-xs text-amber-100 hover:bg-amber-500/20 cursor-pointer disabled:opacity-50"
          >
            {pendingAction === `install-${actionIdPrefix}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
            Install
          </button>
        )}
        {isInstalled && (
          <>
            <button
              type="button"
              onClick={() => onUpgrade(info.name, info.is_cask)}
              disabled={busy || loading}
              className="inline-flex items-center gap-1 rounded-lg border border-amber-500/20 bg-amber-500/10 px-2 py-1 text-xs text-amber-100 hover:bg-amber-500/20 cursor-pointer disabled:opacity-50"
            >
              {pendingAction === `upgrade-${actionIdPrefix}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <ArrowUpCircle className="h-3 w-3" />}
              Upgrade
            </button>
            <button
              type="button"
              onClick={() => onUninstall(info.name, info.is_cask)}
              disabled={busy || loading}
              className="inline-flex items-center gap-1 rounded-lg border border-red-500/20 bg-red-500/10 px-2 py-1 text-xs text-red-300 hover:bg-red-500/20 cursor-pointer disabled:opacity-50"
            >
              {pendingAction?.startsWith("uninstall-") ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
              Uninstall
            </button>
          </>
        )}
        {info.homepage && (
          <button
            type="button"
            onClick={() => { if (info.homepage) void openUrl(info.homepage) }}
            disabled={loading}
            className="inline-flex items-center gap-1 rounded-lg bg-white/10 px-2 py-1 text-xs hover:bg-white/20 cursor-pointer disabled:opacity-50"
          >
            <ExternalLink className="h-3 w-3" /> Page
          </button>
        )}
      </div>

      {loading ? (
        <div className="space-y-3 mb-3">
          <div className="w-full h-3 bg-white/5 rounded animate-pulse" />
          <div className="w-3/4 h-3 bg-white/5 rounded animate-pulse" />
          <div className="w-1/2 h-3 bg-white/5 rounded animate-pulse" />
          <div className="w-2/3 h-3 bg-white/5 rounded animate-pulse" />
          <div className="w-full h-3 bg-white/5 rounded animate-pulse" />
          <div className="w-3/4 h-3 bg-white/5 rounded animate-pulse" />
        </div>
      ) : (
        <div className="mb-3">
          {info.description && (
            <p className="mb-3 text-[11px] text-zinc-400">{info.description}</p>
          )}

          {info.versions.stable && (
            <div className="mb-2 text-[11px] text-zinc-400">
              <span className="text-zinc-500">Stable:</span> {info.versions.stable}
            </div>
          )}
          {info.versions.head && (
            <div className="mb-2 text-[11px] text-zinc-400">
              <span className="text-zinc-500">Head:</span> {info.versions.head}
            </div>
          )}

          {info.installed.length > 0 && (
            <div className="mb-3">
              <div className="mb-1 text-[11px] font-medium text-zinc-500">Installed versions</div>
              <div className="space-y-1">
                {info.installed.map((v, idx) => (
                  <div key={idx} className="text-[11px] text-zinc-400">
                    {v.version}
                    {v.installed_as_dependency && (
                      <span className="ml-1 rounded bg-zinc-800 px-1 py-0.5 text-[10px] text-zinc-500">dependency</span>
                    )}
                    {v.installed_on_request && (
                      <span className="ml-1 rounded bg-zinc-800 px-1 py-0.5 text-[10px] text-zinc-500">on request</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {info.dependencies.length > 0 && (
            <div className="mb-3">
              <div className="mb-1 text-[11px] font-medium text-zinc-500">Dependencies</div>
              <div className="flex flex-wrap gap-1">
                {info.dependencies.map((dep) => (
                  <span key={dep} className="rounded bg-zinc-900 px-1.5 py-0.5 text-[10px] text-zinc-400 border border-white/5">
                    {dep}
                  </span>
                ))}
              </div>
            </div>
          )}

          {info.caveats && (
            <div className="mb-3 rounded-lg border border-amber-500/20 bg-amber-500/5 p-2 text-[11px] text-amber-100">
              {info.caveats}
            </div>
          )}
        </div>
      )}

      <pre className="min-h-0 min-w-0 flex-1 overflow-auto whitespace-pre-wrap break-words rounded-xl border border-white/10 bg-zinc-950 p-2 text-[11px] text-zinc-400">
        {output || (busy ? "Working..." : "")}
      </pre>
    </div>
  )
}