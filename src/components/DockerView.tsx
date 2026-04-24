import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, KeyboardEvent, MouseEvent, ReactNode, SetStateAction } from "react";
import { invoke } from "@tauri-apps/api/core";
import { FileCode2, Loader2, Play, RefreshCw, Search, Terminal, Trash2, X } from "lucide-react";
import { searchDockerHub, DockerHubResult } from "../utils/dockerHub";
import { cn } from "../utils/cn";

type Tab = "containers" | "images" | "hub" | "compose" | "activity";

interface DockerStatus {
  cli_installed: boolean;
  daemon_running: boolean;
  docker_version?: string;
  compose_available: boolean;
  compose_version?: string;
  error_code?: string;
  error_message?: string;
}

interface ContainerInfo {
  id: string;
  image: string;
  status: string;
  names: string;
  ports: string;
  state: string;
  created_at: string;
}

interface ImageInfo {
  id: string;
  repository: string;
  tag: string;
  size: string;
  created_since: string;
}

interface CommandResult {
  stdout: string;
  stderr: string;
}

interface RunForm {
  image: string;
  name: string;
  detached: boolean;
  interactive: boolean;
  ports: string;
  env: string;
  volumes: string;
  command: string;
  extraArgs: string;
}

export interface DockerInitialImage {
  source: "local" | "hub";
  image: string;
  id?: string;
  tag?: string;
  repositoryName?: string;
  description?: string;
  stars?: number;
  pulls?: number;
  selectedAt: number;
}

interface DockerViewProps {
  onClose?: () => void;
  initialImage?: DockerInitialImage | null;
}

type SelectedItem = { type: "container" | "image"; id: string; label: string };

type ContextMenuState =
  | { type: "container"; x: number; y: number; container: ContainerInfo }
  | { type: "background"; x: number; y: number };

const defaultCompose = `services:\n  app:\n    image: nginx:latest\n    ports:\n      - "8080:80"\n`;

function parseLines(value: string): string[] {
  return value.split("\n").map((line) => line.trim()).filter(Boolean);
}

function splitCommand(value: string): string[] {
  return value.trim().split(/\s+/).filter(Boolean);
}

function parseVolumeSpec(line: string) {
  const trimmed = line.trim();
  const searchFrom = /^[A-Za-z]:[\\/]/.test(trimmed) ? 2 : 0;
  const containerSeparator = trimmed.indexOf(":", searchFrom);
  if (containerSeparator === -1) return { host: trimmed, container: "", readonly: false };

  const host = trimmed.slice(0, containerSeparator);
  const rest = trimmed.slice(containerSeparator + 1);
  const modeSeparator = rest.lastIndexOf(":");
  if (modeSeparator === -1) return { host, container: rest, readonly: false };

  const mode = rest.slice(modeSeparator + 1);
  const hasMode = ["ro", "rw", "z", "Z"].includes(mode);
  return {
    host,
    container: hasMode ? rest.slice(0, modeSeparator) : rest,
    readonly: mode === "ro",
  };
}

function shortError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function dockerHubImageRef(repo: DockerHubResult): string {
  const ref = repo.repositoryName.trim() || [repo.namespace, repo.name].filter(Boolean).join("/");
  return ref.includes(":") ? ref : `${ref}:latest`;
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest("button, input, textarea, select, a, [role='button'], [role='menu']"));
}

function menuPosition(x: number, y: number) {
  return {
    x: Math.min(x, Math.max(8, window.innerWidth - 220)),
    y: Math.min(y, Math.max(8, window.innerHeight - 260)),
  };
}

export function DockerView({ onClose, initialImage }: DockerViewProps) {
  const [tab, setTab] = useState<Tab>("containers");
  const [status, setStatus] = useState<DockerStatus | null>(null);
  const [containers, setContainers] = useState<ContainerInfo[]>([]);
  const [images, setImages] = useState<ImageInfo[]>([]);
  const [hub, setHub] = useState<DockerHubResult[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<SelectedItem | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [selectedImageContext, setSelectedImageContext] = useState<DockerInitialImage | null>(null);
  const [output, setOutput] = useState("Ready.");
  const [runForm, setRunForm] = useState<RunForm>({ image: "", name: "", detached: true, interactive: false, ports: "", env: "", volumes: "", command: "", extraArgs: "" });
  const [composePath, setComposePath] = useState(localStorage.getItem("docker-compose-path") || "");
  const [composeContent, setComposeContent] = useState(defaultCompose);
  const [composeOutput, setComposeOutput] = useState("");
  const hubSearchSeq = useRef(0);
  const refreshSeq = useRef(0);
  const mountedRef = useRef(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    const seq = ++refreshSeq.current;
    setLoading(true);
    try {
      const currentStatus = await invoke<DockerStatus>("docker_status");
      if (!mountedRef.current || seq !== refreshSeq.current) return;
      setStatus(currentStatus);
      if (currentStatus.cli_installed && currentStatus.daemon_running) {
        // Sequence Docker CLI reads to avoid Docker Desktop/daemon contention on open.
        const nextContainers = await invoke<ContainerInfo[]>("list_containers");
        if (!mountedRef.current || seq !== refreshSeq.current) return;
        const nextImages = await invoke<ImageInfo[]>("list_images");
        if (!mountedRef.current || seq !== refreshSeq.current) return;
        setContainers(nextContainers);
        setImages(nextImages);
      }
    } catch (error) {
      if (mountedRef.current && seq === refreshSeq.current) setOutput(shortError(error));
    } finally {
      if (mountedRef.current && seq === refreshSeq.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    let timeoutId: number | undefined;
    const rafId = window.requestAnimationFrame(() => {
      timeoutId = window.setTimeout(() => void refresh(), 0);
    });
    return () => {
      mountedRef.current = false;
      refreshSeq.current += 1;
      window.cancelAnimationFrame(rafId);
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    };
  }, [refresh]);

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("click", close);
    window.addEventListener("resize", close);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [contextMenu]);

  useEffect(() => {
    if (tab !== "hub" || query.trim().length < 2) {
      setHub([]);
      return;
    }
    const controller = new AbortController();
    const seq = ++hubSearchSeq.current;
    const timer = window.setTimeout(async () => {
      try {
        const results = await searchDockerHub(query, controller.signal);
        if (seq === hubSearchSeq.current) setHub(results);
      } catch (error) {
        if (controller.signal.aborted || seq !== hubSearchSeq.current) return;
        setOutput(shortError(error));
      }
    }, 300);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query, tab]);

  useEffect(() => {
    if (!initialImage) {
      setSelectedImageContext(null);
      return;
    }

    const imageRef = initialImage.image.trim();
    if (!imageRef) return;

    setSelectedImageContext(initialImage);
    setTab("images");
    setQuery("");
    setRunForm((prev) => ({ ...prev, image: imageRef }));
    setOutput(`${initialImage.source === "hub" ? "Docker Hub" : "Local"} image selected: ${imageRef}`);
  }, [initialImage?.selectedAt]);

  const selectHubImage = useCallback((repo: DockerHubResult) => {
    const image = dockerHubImageRef(repo);

    setSelected(null);
    setSelectedImageContext({
      source: "hub",
      image,
      repositoryName: repo.repositoryName,
      description: repo.description,
      stars: repo.starCount,
      pulls: repo.pullCount,
      selectedAt: Date.now(),
    });
    setRunForm((prev) => ({ ...prev, image }));
    setTab("images");
    setQuery("");
    setOutput(`Docker Hub image selected: ${image}`);
  }, []);

  const filteredContainers = useMemo(() => containers.filter((c) => [c.names, c.image, c.status, c.ports].join(" ").toLowerCase().includes(query.toLowerCase())), [containers, query]);
  const filteredImages = useMemo(() => images.filter((i) => `${i.repository}:${i.tag} ${i.id}`.toLowerCase().includes(query.toLowerCase())), [images, query]);

  async function runAction(action: () => Promise<CommandResult | void>, label: string) {
    setBusy(true);
    setOutput(`${label}...`);
    try {
      const result = await action();
      if (!mountedRef.current) return;
      if (result) setOutput([result.stdout, result.stderr].filter(Boolean).join("\n") || `${label} complete.`);
      await refresh();
    } catch (error) {
      if (mountedRef.current) setOutput(shortError(error));
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  }

  function confirmRisk(message: string): boolean {
    return window.confirm(message);
  }

  function buildRunOptions() {
    return {
      image: runForm.image.trim(),
      name: runForm.name.trim() || undefined,
      detached: runForm.detached,
      interactive: runForm.interactive,
      ports: parseLines(runForm.ports).map((line) => {
        const [host, rest] = line.split(":");
        const [container, protocol] = (rest || "").split("/");
        return { host, container, protocol: protocol || "tcp" };
      }),
      env: parseLines(runForm.env).map((line) => {
        const [key, ...value] = line.split("=");
        return { key, value: value.join("=") };
      }),
      volumes: parseLines(runForm.volumes).map(parseVolumeSpec),
      command: splitCommand(runForm.command),
      remove_when_exit: false,
      extra_args: splitCommand(runForm.extraArgs),
    };
  }

  function selectContainer(container: ContainerInfo) {
    setSelected({ type: "container", id: container.id, label: container.names });
  }

  function openContainerMenu(container: ContainerInfo, x: number, y: number) {
    const position = menuPosition(x, y);
    setContextMenu({ type: "container", x: position.x, y: position.y, container });
  }

  function openBackgroundMenu(event: MouseEvent<HTMLDivElement>) {
    if (tab !== "containers" || isInteractiveTarget(event.target)) return;
    event.preventDefault();
    const position = menuPosition(event.clientX, event.clientY);
    setContextMenu({ type: "background", x: position.x, y: position.y });
  }

  const runContainerAction = useCallback((container: ContainerInfo, action: "start" | "stop" | "restart") => {
    selectContainer(container);
    void runAction(() => invoke("manage_container", { id: container.id, action }), `${action[0].toUpperCase()}${action.slice(1)} ${container.names}`);
  }, [refresh]);

  const showLogs = useCallback((id: string) => void runAction(() => invoke("container_logs", { id, tail: 300, timestamps: false }), "Fetch logs"), [refresh]);
  const execShell = useCallback((id: string) => confirmRisk("Run non-interactive shell command in this container?") && void runAction(() => invoke("exec_container", { id, command: ["sh", "-lc", "pwd && ls -la"] }), "Exec shell"), [refresh]);
  const inspectTarget = useCallback((id: string) => void runAction(() => invoke("inspect_docker", { target: id }), "Inspect"), [refresh]);
  const deleteSelected = useCallback((id: string, type: "container" | "image") => confirmRisk(`Delete ${type} ${id}?`) && void runAction(() => type === "container" ? invoke("manage_container", { id, action: "remove", confirmed: true }) : invoke("delete_image", { id, force: false, confirmed: true }), `Delete ${type}`), [refresh]);
  const pruneSystem = useCallback(() => confirmRisk("Prune unused Docker system data? Images/containers may be removed.") && void runAction(() => invoke("prune_docker", { kind: "system", volumes: false, force: true, confirmed: true }), "Prune system"), [refresh]);

  const statusLabel = status?.cli_installed ? (status.daemon_running ? "Running" : "Daemon unavailable") : "Docker not installed";
  const statusClass = status?.daemon_running ? "text-emerald-300 border-emerald-500/30 bg-emerald-500/10" : "text-amber-300 border-amber-500/30 bg-amber-500/10";

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 max-w-full flex-col overflow-hidden text-zinc-200">
      <div className="flex min-w-0 items-center justify-between gap-2 border-b border-white/5 px-3 py-3">
        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
          <span className={cn("max-w-[150px] shrink-0 truncate rounded-full border px-2 py-0.5 text-[11px]", statusClass)}>● {loading ? "Loading" : statusLabel}</span>
          {status?.docker_version && <span className="hidden min-w-0 truncate text-[11px] text-zinc-500 min-[620px]:block" title={status.docker_version}>{status.docker_version}</span>}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="hidden text-[11px] text-zinc-500 min-[700px]:inline">⌘/Ctrl ⇧D</span>
          <button onClick={() => void refresh()} className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs hover:bg-white/10"><RefreshCw className="h-3 w-3" /> <span className="hidden min-[520px]:inline">Refresh</span></button>
          {onClose && <button onClick={onClose} className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/5"><X className="h-4 w-4" /></button>}
        </div>
      </div>

      <div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden">
        <div className="w-24 shrink-0 border-r border-white/5 p-2 min-[620px]:w-32">
          {(["containers", "images", "hub", "compose", "activity"] as Tab[]).map((item) => (
            <button key={item} onClick={() => setTab(item)} className={cn("mb-1 w-full truncate rounded-lg px-2 py-2 text-left text-xs capitalize", tab === item ? "bg-white/10 text-white" : "text-zinc-400 hover:bg-white/5")}>{item}</button>
          ))}
          <button onClick={pruneSystem} className="mt-4 inline-flex w-full items-center gap-1 rounded-lg border border-red-500/20 bg-red-500/10 px-2 py-2 text-left text-xs text-red-300 hover:bg-red-500/20"><Trash2 className="h-3 w-3 shrink-0" /> <span className="truncate">Prune</span></button>
        </div>

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden p-3 pb-12" onContextMenu={openBackgroundMenu}>
          <div className="relative mb-3 shrink-0">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
            <input ref={searchInputRef} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search Docker Hub, images, containers..." className="w-full rounded-xl border border-white/10 bg-zinc-950/60 py-2 pl-9 pr-3 text-sm outline-none focus:border-cyan-500/40" />
          </div>

          {loading ? <div className="p-6 text-center text-sm text-zinc-400"><Loader2 className="inline h-4 w-4 animate-spin" /> Loading Docker...</div> : !status?.cli_installed || !status?.daemon_running ? (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-100">{status?.error_code}: {status?.error_message || "Docker CLI or daemon unavailable."}</div>
          ) : tab === "containers" ? (
            <Rows items={filteredContainers.map((c) => ({ id: c.id, title: c.names, subtitle: `${c.image} • ${c.status}${c.ports ? ` • ${c.ports}` : ""}`, onClick: () => selectContainer(c), onContextMenu: (x, y) => openContainerMenu(c, x, y), onMenuButton: (event) => openContainerMenu(c, event.clientX, event.clientY) }))} />
          ) : tab === "images" ? (
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overflow-x-hidden pr-1">
              {selectedImageContext && <SelectedImageCard image={selectedImageContext} onClear={() => setSelectedImageContext(null)} />}
              <RunPanel runForm={runForm} setRunForm={setRunForm} onRun={() => {
                const opts = buildRunOptions();
                const risky = opts.ports.length > 0 || opts.volumes.length > 0 || opts.extra_args.includes("--network") || opts.extra_args.includes("--privileged");
                if (risky && !confirmRisk("Run container with exposed ports, bind mounts, or advanced flags?")) return;
                void runAction(() => invoke("run_container", { options: opts }), "Run container");
              }} />
              <Rows items={filteredImages.map((i) => ({ id: `${i.id}-${i.tag}`, title: `${i.repository}:${i.tag}`, subtitle: `${i.size} • ${i.created_since}`, onClick: () => { const image = `${i.repository}:${i.tag}`; setSelected({ type: "image", id: i.id, label: image }); setSelectedImageContext({ source: "local", image, id: i.id, tag: i.tag, selectedAt: Date.now() }); setRunForm((prev) => ({ ...prev, image })); } }))} />
            </div>
          ) : tab === "hub" ? (
            <HubRows repos={hub} onSelect={selectHubImage} onPull={(repo) => void runAction(() => invoke("pull_image", { image: dockerHubImageRef(repo) }), `Pull ${repo.repositoryName}`)} />
          ) : tab === "compose" ? (
            <ComposePanel path={composePath} content={composeContent} output={composeOutput} setPath={setComposePath} setContent={setComposeContent} onRead={() => void runAction(async () => { const text = await invoke<string>("compose_read_file", { path: composePath }); setComposeContent(text); localStorage.setItem("docker-compose-path", composePath); }, "Read compose")} onWrite={() => { if (!confirmRisk("Save compose file? Existing files may be overwritten.")) return; void runAction(async () => { await invoke("compose_write_file", { path: composePath, content: composeContent, overwrite: true, confirmed: true }); localStorage.setItem("docker-compose-path", composePath); }, "Save compose"); }} onAction={(action, volumes) => { const confirmed = action === "down" && volumes ? confirmRisk("Compose down with volumes will remove named volumes. Continue?") : false; if (action === "down" && volumes && !confirmed) return; void runAction(async () => { const result = await invoke<CommandResult>("compose_action", { path: composePath, action, detach: true, volumes, confirmed }); setComposeOutput([result.stdout, result.stderr].filter(Boolean).join("\n")); return result; }, `Compose ${action}`); }} />
          ) : (
            <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words rounded-xl border border-white/10 bg-zinc-950/70 p-3 text-xs text-zinc-300">{output}</pre>
          )}
        </div>

        <DetailDrawer selected={selected} busy={busy} output={output} onClose={() => setSelected(null)} onLogs={showLogs} onExec={execShell} onInspect={inspectTarget} onDelete={deleteSelected} />
        <DockerContextMenu menu={contextMenu} busy={busy} dockerAvailable={Boolean(status?.cli_installed && status.daemon_running)} onClose={() => setContextMenu(null)} onContainerAction={runContainerAction} onLogs={showLogs} onExec={execShell} onInspect={inspectTarget} onRemove={(container) => deleteSelected(container.id, "container")} onRefresh={() => void refresh()} onSearch={() => searchInputRef.current?.focus()} onPrune={pruneSystem} />
      </div>
    </div>
  );
}

function SelectedImageCard({ image, onClear }: { image: DockerInitialImage; onClear: () => void }) {
  return <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/10 p-3 text-xs text-cyan-50">
    <div className="flex min-w-0 items-start justify-between gap-3">
      <div className="min-w-0 space-y-1">
        <div className="font-medium">Selected {image.source === "hub" ? "Docker Hub image" : "local image"}</div>
        <div className="truncate font-mono text-cyan-100" title={image.image}>{image.image}</div>
        {image.description && <div className="line-clamp-2 text-cyan-100/70">{image.description}</div>}
        {image.source === "hub" && <div className="text-cyan-100/60">{(image.stars ?? 0).toLocaleString()} stars • {(image.pulls ?? 0).toLocaleString()} pulls</div>}
      </div>
      <button onClick={onClear} className="shrink-0 rounded p-1 text-cyan-100/70 hover:bg-white/10 hover:text-white" aria-label="Clear selected Docker image"><X className="h-3 w-3" /></button>
    </div>
  </div>;
}

function Rows({ items }: { items: { id: string; title: string; subtitle: string; onClick: () => void; onContextMenu?: (x: number, y: number) => void; onMenuButton?: (event: MouseEvent<HTMLButtonElement>) => void }[] }) {
  if (items.length === 0) return <div className="flex min-h-0 flex-1 items-center justify-center p-6 text-center text-sm text-zinc-500">No Docker data.</div>;
  return <div className="min-h-0 flex-1 space-y-1 overflow-y-auto overflow-x-hidden pr-1">{items.map((item) => {
    const handleRowKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.target !== event.currentTarget) return;

      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        item.onClick();
        return;
      }

      if (!item.onContextMenu || (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10"))) return;
      event.preventDefault();
      const rect = event.currentTarget.getBoundingClientRect();
      item.onContextMenu(rect.right - 24, rect.top + 12);
    };

    return <div key={item.id} tabIndex={0} role="button" aria-label={`Select ${item.title}`} onClick={item.onClick} onKeyDown={handleRowKeyDown} onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); event.currentTarget.focus(); item.onContextMenu?.(event.clientX, event.clientY); }} className="flex w-full min-w-0 cursor-default items-center gap-2 rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2 text-left outline-none hover:bg-white/10 focus:border-cyan-500/40 focus:bg-white/10">
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm text-zinc-100">{item.title}</div>
        <div className="truncate text-[11px] text-zinc-500">{item.subtitle}</div>
      </div>
      {item.onMenuButton && <button onClick={(event) => { event.stopPropagation(); item.onMenuButton?.(event); }} className="shrink-0 rounded-lg px-2 py-1 text-zinc-500 hover:bg-white/10 hover:text-zinc-200" aria-label={`Open menu for ${item.title}`}>⋯</button>}
    </div>;
  })}</div>;
}

function HubRows({ repos, onSelect, onPull }: { repos: DockerHubResult[]; onSelect: (repo: DockerHubResult) => void; onPull: (repo: DockerHubResult) => void }) {
  if (repos.length === 0) return <div className="flex min-h-0 flex-1 items-center justify-center p-6 text-center text-sm text-zinc-500">No Docker Hub results.</div>;

  return <div className="min-h-0 flex-1 space-y-1 overflow-y-auto overflow-x-hidden pr-1">{repos.map((repo) => {
    const image = dockerHubImageRef(repo);
    return <div key={repo.repositoryName} className="flex min-w-0 items-stretch gap-2 rounded-xl border border-white/5 bg-white/[0.03] p-1.5 hover:bg-white/10">
      <button onClick={() => onSelect(repo)} className="min-w-0 flex-1 px-2 py-1 text-left" aria-label={`Select Docker Hub image ${image}`}>
        <div className="truncate text-sm text-zinc-100">{repo.repositoryName}</div>
        <div className="truncate text-[11px] text-zinc-500">{repo.starCount.toLocaleString()} stars • {repo.pullCount.toLocaleString()} pulls • {repo.description}</div>
      </button>
      <button onClick={() => onPull(repo)} className="shrink-0 rounded-lg border border-cyan-500/20 bg-cyan-500/10 px-2 text-xs text-cyan-100 hover:bg-cyan-500/20" aria-label={`Pull Docker Hub image ${image}`}>Pull</button>
    </div>;
  })}</div>;
}

function RunPanel({ runForm, setRunForm, onRun }: { runForm: RunForm; setRunForm: Dispatch<SetStateAction<RunForm>>; onRun: () => void }) {
  const fieldClass = "h-9 w-full min-w-0 rounded-lg border border-white/10 bg-zinc-950 px-2.5 text-xs outline-none placeholder:text-zinc-600 focus:border-cyan-500/40";
  const textAreaClass = "min-h-16 w-full min-w-0 resize-y rounded-lg border border-white/10 bg-zinc-950 px-2.5 py-2 text-xs leading-relaxed outline-none placeholder:text-zinc-600 focus:border-cyan-500/40";
  const labelClass = "block min-w-0 space-y-1";

  return <div className="w-full min-w-0 overflow-hidden rounded-xl border border-white/10 bg-white/[0.03] p-3">
    <div className="mb-3 flex items-center gap-2 text-xs font-medium text-zinc-300"><Play className="h-3 w-3" /> Run Image</div>
    <div className="grid min-w-0 grid-cols-1 gap-2 text-xs min-[900px]:grid-cols-2">
      <label className={labelClass}><span className="text-[11px] text-zinc-500">Image</span><input value={runForm.image} onChange={(e) => setRunForm((p) => ({ ...p, image: e.target.value }))} placeholder="nginx:latest" className={fieldClass} /></label>
      <label className={labelClass}><span className="text-[11px] text-zinc-500">Container name</span><input value={runForm.name} onChange={(e) => setRunForm((p) => ({ ...p, name: e.target.value }))} placeholder="optional-name" className={fieldClass} /></label>
      <label className={labelClass}><span className="text-[11px] text-zinc-500">Ports</span><textarea value={runForm.ports} onChange={(e) => setRunForm((p) => ({ ...p, ports: e.target.value }))} placeholder={"One per line\n8080:80/tcp"} className={textAreaClass} /></label>
      <label className={labelClass}><span className="text-[11px] text-zinc-500">Environment</span><textarea value={runForm.env} onChange={(e) => setRunForm((p) => ({ ...p, env: e.target.value }))} placeholder={"One per line\nKEY=value"} className={textAreaClass} /></label>
      <label className={labelClass}><span className="text-[11px] text-zinc-500">Volumes</span><textarea value={runForm.volumes} onChange={(e) => setRunForm((p) => ({ ...p, volumes: e.target.value }))} placeholder="/host:/container:ro" className={textAreaClass} /></label>
      <label className={labelClass}><span className="text-[11px] text-zinc-500">Command</span><textarea value={runForm.command} onChange={(e) => setRunForm((p) => ({ ...p, command: e.target.value }))} placeholder="command args" className={textAreaClass} /></label>
      <label className={cn(labelClass, "min-[900px]:col-span-2")}><span className="text-[11px] text-zinc-500">Advanced flags</span><input value={runForm.extraArgs} onChange={(e) => setRunForm((p) => ({ ...p, extraArgs: e.target.value }))} placeholder="--pull always --platform linux/amd64" className={fieldClass} /></label>
    </div>
    <div className="mt-3 flex min-w-0 flex-wrap items-center justify-between gap-2">
      <div className="flex flex-wrap gap-3">
        <label className="inline-flex items-center gap-1.5 text-xs text-zinc-400"><input type="checkbox" checked={runForm.detached} onChange={(e) => setRunForm((p) => ({ ...p, detached: e.target.checked }))} /> Detached</label>
        <label className="inline-flex items-center gap-1.5 text-xs text-zinc-400"><input type="checkbox" checked={runForm.interactive} onChange={(e) => setRunForm((p) => ({ ...p, interactive: e.target.checked }))} /> Interactive</label>
      </div>
      <button onClick={onRun} disabled={!runForm.image.trim()} className="rounded-lg bg-cyan-600 px-3 py-1.5 text-xs text-white disabled:opacity-40">Run</button>
    </div>
  </div>;
}

function ComposePanel({ path, content, output, setPath, setContent, onRead, onWrite, onAction }: { path: string; content: string; output: string; setPath: (v: string) => void; setContent: (v: string) => void; onRead: () => void; onWrite: () => void; onAction: (action: string, volumes?: boolean) => void }) {
  const composeActions = ["up", "down", "pull", "logs", "ps", "restart"];

  return <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-hidden">
    <input value={path} onChange={(e) => setPath(e.target.value)} placeholder="/path/to/docker-compose.yml" className="w-full min-w-0 rounded-xl border border-white/10 bg-zinc-950/60 px-3 py-2 text-xs outline-none" />
    <textarea value={content} onChange={(e) => setContent(e.target.value)} className="min-h-0 w-full min-w-0 flex-1 resize-none rounded-xl border border-white/10 bg-zinc-950/70 p-3 font-mono text-xs outline-none" />
    <div className="flex min-w-0 flex-wrap gap-2 overflow-hidden">
      <button onClick={onRead} className="inline-flex items-center gap-1 rounded-lg bg-white/10 px-3 py-1.5 text-xs hover:bg-white/20"><FileCode2 className="h-3 w-3" /> Read</button>
      <button onClick={onWrite} className="rounded-lg bg-white/10 px-3 py-1.5 text-xs hover:bg-white/20">Save</button>
      {composeActions.map((action) => <button key={action} onClick={() => onAction(action, false)} className="rounded-lg bg-white/10 px-3 py-1.5 text-xs capitalize hover:bg-white/20">{action}</button>)}
      <button onClick={() => onAction("down", true)} className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-1.5 text-xs text-red-300 hover:bg-red-500/20">Down -v</button>
    </div>
    {output && <pre className="max-h-24 overflow-auto whitespace-pre-wrap break-words rounded-xl border border-white/10 bg-zinc-950 p-2 text-[11px] text-zinc-400">{output}</pre>}
  </div>;
}

function DockerContextMenu({ menu, busy, dockerAvailable, onClose, onContainerAction, onLogs, onExec, onInspect, onRemove, onRefresh, onSearch, onPrune }: { menu: ContextMenuState | null; busy: boolean; dockerAvailable: boolean; onClose: () => void; onContainerAction: (container: ContainerInfo, action: "start" | "stop" | "restart") => void; onLogs: (id: string) => void; onExec: (id: string) => void; onInspect: (id: string) => void; onRemove: (container: ContainerInfo) => void; onRefresh: () => void; onSearch: () => void; onPrune: () => void }) {
  if (!menu) return null;

  const runItem = (action: () => void) => {
    onClose();
    action();
  };

  if (menu.type === "background") {
    return <MenuShell x={menu.x} y={menu.y}>
      <MenuItem label="Refresh" onSelect={() => runItem(onRefresh)} />
      <MenuItem label="Search containers" disabled={!dockerAvailable} onSelect={() => runItem(onSearch)} />
      <MenuSeparator />
      <MenuItem label="Prune unused data…" disabled={!dockerAvailable || busy} destructive onSelect={() => runItem(onPrune)} />
    </MenuShell>;
  }

  const container = menu.container;
  const running = container.state.toLowerCase() === "running";
  const actionDisabled = busy || !dockerAvailable;

  return <MenuShell x={menu.x} y={menu.y}>
    <MenuItem label="Start" disabled={running || actionDisabled} onSelect={() => runItem(() => onContainerAction(container, "start"))} />
    <MenuItem label="Stop" disabled={!running || actionDisabled} onSelect={() => runItem(() => onContainerAction(container, "stop"))} />
    <MenuItem label="Restart" disabled={!running || actionDisabled} onSelect={() => runItem(() => onContainerAction(container, "restart"))} />
    <MenuSeparator />
    <MenuItem label="Logs" disabled={!dockerAvailable || busy} onSelect={() => runItem(() => onLogs(container.id))} />
    <MenuItem label="Exec shell" disabled={!running || actionDisabled} onSelect={() => runItem(() => onExec(container.id))} />
    <MenuItem label="Inspect" disabled={!dockerAvailable || busy} onSelect={() => runItem(() => onInspect(container.id))} />
    <MenuSeparator />
    <MenuItem label="Remove container" disabled={busy || !dockerAvailable} destructive onSelect={() => runItem(() => onRemove(container))} />
  </MenuShell>;
}

function MenuShell({ x, y, children }: { x: number; y: number; children: ReactNode }) {
  const menuRef = useRef<HTMLDivElement>(null);

  const focusEnabledItem = useCallback((index: number) => {
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? []);
    if (items.length === 0) return;
    items[(index + items.length) % items.length].focus();
  }, []);

  useEffect(() => {
    focusEnabledItem(0);
  }, [focusEnabledItem, children]);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;

    event.preventDefault();
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? []);
    if (items.length === 0) return;

    const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "Home") {
      items[0].focus();
    } else if (event.key === "End") {
      items[items.length - 1].focus();
    } else {
      const direction = event.key === "ArrowDown" ? 1 : -1;
      const nextIndex = currentIndex === -1 ? 0 : currentIndex + direction;
      focusEnabledItem(nextIndex);
    }
  };

  return <div ref={menuRef} role="menu" onKeyDown={handleKeyDown} onClick={(event) => event.stopPropagation()} onContextMenu={(event) => event.preventDefault()} className="fixed z-50 min-w-48 overflow-hidden rounded-xl border border-white/10 bg-zinc-950/95 p-1 text-xs text-zinc-200 shadow-2xl backdrop-blur" style={{ left: x, top: y }}>{children}</div>;
}

function MenuItem({ label, disabled, destructive, onSelect }: { label: string; disabled?: boolean; destructive?: boolean; onSelect: () => void }) {
  return <button role="menuitem" aria-disabled={disabled || undefined} disabled={disabled} onClick={onSelect} className={cn("block w-full rounded-lg px-3 py-2 text-left disabled:cursor-not-allowed disabled:opacity-40", destructive ? "text-red-300 hover:bg-red-500/10" : "hover:bg-white/10")}>{label}</button>;
}

function MenuSeparator() {
  return <div role="separator" className="my-1 h-px bg-white/10" />;
}

function DetailDrawer({ selected, busy, output, onClose, onLogs, onExec, onInspect, onDelete }: { selected: { type: "container" | "image"; id: string; label: string } | null; busy: boolean; output: string; onClose: () => void; onLogs: (id: string) => void; onExec: (id: string) => void; onInspect: (id: string) => void; onDelete: (id: string, type: "container" | "image") => void }) {
  if (!selected) return null;
  return <div className="absolute inset-y-0 right-0 z-10 flex w-[min(20rem,70%)] min-w-0 flex-col border-l border-white/5 bg-zinc-950/95 p-3 shadow-2xl backdrop-blur"><div className="mb-3 flex min-w-0 items-start justify-between gap-2"><div className="min-w-0"><div className="truncate text-sm font-medium text-zinc-100">{selected.label}</div><div className="truncate text-[11px] text-zinc-500">{selected.type} • {selected.id}</div></div><button onClick={onClose} className="shrink-0 rounded p-1 text-zinc-500 hover:bg-white/5"><X className="h-3 w-3" /></button></div><div className="mb-3 flex min-w-0 flex-wrap gap-2">{selected.type === "container" && <><button onClick={() => onLogs(selected.id)} className="rounded-lg bg-white/10 px-2 py-1 text-xs hover:bg-white/20">Logs</button><button onClick={() => onExec(selected.id)} className="rounded-lg bg-white/10 px-2 py-1 text-xs hover:bg-white/20"><Terminal className="inline h-3 w-3" /> Exec</button></>}<button onClick={() => onInspect(selected.id)} className="rounded-lg bg-white/10 px-2 py-1 text-xs hover:bg-white/20">Inspect</button><button onClick={() => onDelete(selected.id, selected.type)} className="rounded-lg bg-red-500/10 px-2 py-1 text-xs text-red-300 hover:bg-red-500/20">Delete</button></div><pre className="min-h-0 min-w-0 flex-1 overflow-auto whitespace-pre-wrap break-words rounded-xl border border-white/10 bg-zinc-950 p-2 text-[11px] text-zinc-400">{busy ? "Working..." : output}</pre><p className="mt-2 text-[10px] text-zinc-600">Exec shell is non-interactive because no PTY bridge is available.</p></div>;
}
