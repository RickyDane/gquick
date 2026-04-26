import { useEffect, useState } from "react";
import { AlertTriangle, Gauge, Play, StopCircle } from "lucide-react";
import { GQuickPlugin, SearchResultItem } from "./types";

type SpeedtestPhase = "idle" | "latency" | "download" | "upload" | "complete" | "error" | "stopped";

interface SpeedtestSnapshot {
  phase: SpeedtestPhase;
  progress: number;
  latencyMs: number | null;
  downloadMbps: number | null;
  uploadMbps: number | null;
  detail: string;
  error: string | null;
  running: boolean;
  activeConfig: SpeedtestConfig;
  updatedAt: number;
}

interface SpeedtestConfig {
  durationSeconds: number;
  downloadMb: number;
  uploadMb: number;
}

type SpeedtestListener = (snapshot: SpeedtestSnapshot) => void;

const SPEEDTEST_QUERIES = new Set(["speedtest", "speed test", "internet speed", "/st"]);
const CLOUDFLARE_BASE_URL = "https://speed.cloudflare.com";
const LATENCY_SAMPLES = 5;
const MEGABYTE = 1_000_000;
const SPEEDTEST_CONFIG_STORAGE_KEY = "gquick.speedtest.config";
const DEFAULT_SPEEDTEST_CONFIG: SpeedtestConfig = { durationSeconds: 15, downloadMb: 50, uploadMb: 25 };
// Keep user-controlled limits bounded: downloads stream, but uploads allocate request bodies in browser memory.
const SPEEDTEST_CONFIG_LIMITS = {
  durationSeconds: { min: 5, max: 300 },
  downloadMb: { min: 1, max: 1000 },
  uploadMb: { min: 1, max: 200 },
} as const;
const DOWNLOAD_PHASE_RATIO = 0.6;
const UPLOAD_DEADLINE_GUARD_MS = 250;

const INITIAL_SNAPSHOT: SpeedtestSnapshot = {
  phase: "idle",
  progress: 0,
  latencyMs: null,
  downloadMbps: null,
  uploadMbps: null,
  detail: "Ready to test via Cloudflare speed endpoints.",
  error: null,
  running: false,
  activeConfig: DEFAULT_SPEEDTEST_CONFIG,
  updatedAt: Date.now(),
};

let snapshot = INITIAL_SNAPSHOT;
let speedtestConfig = loadSpeedtestConfig();
let controller: AbortController | null = null;
let runId = 0;
const listeners = new Set<SpeedtestListener>();
const configListeners = new Set<(config: SpeedtestConfig) => void>();

function isSpeedtestQuery(query: string): boolean {
  return SPEEDTEST_QUERIES.has(query.trim().toLowerCase());
}

function subscribe(listener: SpeedtestListener): () => void {
  listeners.add(listener);
  listener(snapshot);
  return () => listeners.delete(listener);
}

function setSnapshot(next: Partial<SpeedtestSnapshot>): void {
  snapshot = { ...snapshot, ...next, updatedAt: Date.now() };
  listeners.forEach((listener) => listener(snapshot));
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function sanitizeConfigNumber(value: unknown, defaultValue: number, min: number, max: number): number {
  return clampNumber(typeof value === "number" && Number.isFinite(value) ? value : defaultValue, min, max);
}

function sanitizeSpeedtestConfig(config: Partial<SpeedtestConfig>): SpeedtestConfig {
  return {
    durationSeconds: sanitizeConfigNumber(config.durationSeconds, DEFAULT_SPEEDTEST_CONFIG.durationSeconds, SPEEDTEST_CONFIG_LIMITS.durationSeconds.min, SPEEDTEST_CONFIG_LIMITS.durationSeconds.max),
    downloadMb: sanitizeConfigNumber(config.downloadMb, DEFAULT_SPEEDTEST_CONFIG.downloadMb, SPEEDTEST_CONFIG_LIMITS.downloadMb.min, SPEEDTEST_CONFIG_LIMITS.downloadMb.max),
    uploadMb: sanitizeConfigNumber(config.uploadMb, DEFAULT_SPEEDTEST_CONFIG.uploadMb, SPEEDTEST_CONFIG_LIMITS.uploadMb.min, SPEEDTEST_CONFIG_LIMITS.uploadMb.max),
  };
}

function loadSpeedtestConfig(): SpeedtestConfig {
  try {
    if (typeof window === "undefined") return DEFAULT_SPEEDTEST_CONFIG;
    const saved = window.localStorage.getItem(SPEEDTEST_CONFIG_STORAGE_KEY);
    if (!saved) return DEFAULT_SPEEDTEST_CONFIG;
    return sanitizeSpeedtestConfig(JSON.parse(saved) as Partial<SpeedtestConfig>);
  } catch {
    return DEFAULT_SPEEDTEST_CONFIG;
  }
}

function saveSpeedtestConfig(next: Partial<SpeedtestConfig>): void {
  speedtestConfig = sanitizeSpeedtestConfig({ ...speedtestConfig, ...next });
  try {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(SPEEDTEST_CONFIG_STORAGE_KEY, JSON.stringify(speedtestConfig));
    }
  } catch {
    // Ignore storage failures; current session still uses updated config.
  }
  configListeners.forEach((listener) => listener(speedtestConfig));
}

function subscribeConfig(listener: (config: SpeedtestConfig) => void): () => void {
  configListeners.add(listener);
  listener(speedtestConfig);
  return () => configListeners.delete(listener);
}

function friendlyFetchError(error: unknown): string {
  if (error instanceof DOMException && error.name === "AbortError") {
    return "Speed test stopped.";
  }
  if (error instanceof TypeError) {
    return "Network request failed. Cloudflare speed endpoints may be blocked, offline, or blocked by CORS.";
  }
  return error instanceof Error ? error.message : "Speed test failed.";
}

function assertActive(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new DOMException("Speed test stopped", "AbortError");
  }
}

function bytesToMbps(bytes: number, elapsedMs: number): number {
  return (bytes * 8) / (elapsedMs / 1000) / 1_000_000;
}

function getElapsedProgress(testStartedAt: number, durationMs: number): number {
  return Math.min(99, Math.floor(((performance.now() - testStartedAt) / durationMs) * 100));
}

function setRunningSnapshot(testStartedAt: number, durationMs: number, next: Partial<SpeedtestSnapshot>): void {
  setSnapshot({ ...next, progress: Math.max(snapshot.progress, getElapsedProgress(testStartedAt, durationMs), next.progress ?? 0) });
}

function useSpeedtestSnapshot(): SpeedtestSnapshot {
  const [current, setCurrent] = useState(snapshot);

  useEffect(() => subscribe(setCurrent), []);

  return current;
}

function useSpeedtestConfig(): SpeedtestConfig {
  const [current, setCurrent] = useState(speedtestConfig);

  useEffect(() => subscribeConfig(setCurrent), []);

  return current;
}

function formatMetric(value: number | null, suffix: string): string {
  return value === null ? "—" : `${value.toFixed(value >= 100 ? 0 : 1)} ${suffix}`;
}

async function sleepUntil(targetTime: number, signal: AbortSignal): Promise<void> {
  const remainingMs = targetTime - performance.now();
  if (remainingMs <= 0) return;

  await new Promise<void>((resolve, reject) => {
    let timeoutId = 0;
    const cleanup = () => {
      window.clearTimeout(timeoutId);
      signal.removeEventListener("abort", abortHandler);
    };
    const finish = () => {
      cleanup();
      resolve();
    };
    const abortHandler = () => {
      cleanup();
      reject(new DOMException("Speed test stopped", "AbortError"));
    };

    timeoutId = window.setTimeout(finish, remainingMs);
    signal.addEventListener("abort", abortHandler, { once: true });
    if (signal.aborted) abortHandler();
  });
}

async function measureLatency(signal: AbortSignal, activeRunId: number, testStartedAt: number, durationMs: number, config: SpeedtestConfig): Promise<number> {
  const samples: number[] = [];

  for (let index = 0; index < LATENCY_SAMPLES; index += 1) {
    assertActive(signal);
    const startedAt = performance.now();
    const response = await fetch(`${CLOUDFLARE_BASE_URL}/__down?bytes=0&r=${crypto.randomUUID()}`, {
      cache: "no-store",
      signal,
    });
    if (!response.ok) throw new Error(`Latency check failed (${response.status}).`);
    await response.arrayBuffer();
    samples.push(performance.now() - startedAt);

    if (runId === activeRunId) {
      setRunningSnapshot(testStartedAt, durationMs, {
        phase: "latency",
        latencyMs: Math.round(samples.reduce((sum, sample) => sum + sample, 0) / samples.length),
        detail: `${config.durationSeconds}-second test: pinging Cloudflare (${index + 1}/${LATENCY_SAMPLES})`,
      });
    }
  }

  samples.sort((left, right) => left - right);
  return Math.round(samples[Math.floor(samples.length / 2)]);
}

async function measureDownload(signal: AbortSignal, activeRunId: number, testStartedAt: number, durationMs: number, config: SpeedtestConfig): Promise<number> {
  const phaseStartedAt = performance.now();
  const phaseEndsAt = testStartedAt + durationMs * DOWNLOAD_PHASE_RATIO;
  const sampleBytes = config.downloadMb * MEGABYTE;
  let receivedBytes = 0;

  while (performance.now() < phaseEndsAt) {
    assertActive(signal);
    const response = await fetch(`${CLOUDFLARE_BASE_URL}/__down?bytes=${sampleBytes}&r=${crypto.randomUUID()}`, {
      cache: "no-store",
      signal,
    });

    if (!response.ok) throw new Error(`Download test failed (${response.status}).`);

    if (response.body) {
      const reader = response.body.getReader();
      let finishedSample = false;
      try {
        while (performance.now() < phaseEndsAt) {
          assertActive(signal);
          const { done, value } = await reader.read();
          if (done) {
            finishedSample = true;
            break;
          }
          receivedBytes += value.byteLength;
          const elapsedMs = Math.max(performance.now() - phaseStartedAt, 1);

          if (runId === activeRunId) {
            setRunningSnapshot(testStartedAt, durationMs, {
              phase: "download",
              downloadMbps: bytesToMbps(receivedBytes, elapsedMs),
              detail: `${config.durationSeconds}-second test: downloading ${config.downloadMb} MB samples (${Math.round(receivedBytes / MEGABYTE)} MB total)`,
            });
          }
        }
      } finally {
        if (!finishedSample) {
          await reader.cancel().catch(() => undefined);
        }
        reader.releaseLock();
      }
    } else {
      throw new Error("Download streaming is unavailable in this environment; speed test cannot safely fall back without buffering large files.");
    }
  }

  return bytesToMbps(receivedBytes, Math.max(performance.now() - phaseStartedAt, 1));
}

async function measureUpload(signal: AbortSignal, activeRunId: number, testStartedAt: number, durationMs: number, config: SpeedtestConfig): Promise<number> {
  const phaseStartedAt = performance.now();
  const phaseEndsAt = testStartedAt + durationMs;
  let sentBytes = 0;
  const sampleBytes = config.uploadMb * MEGABYTE;
  const updateTimer = window.setInterval(() => {
    if (runId !== activeRunId || signal.aborted) return;
    const elapsedMs = Math.max(performance.now() - phaseStartedAt, 1);
    setRunningSnapshot(testStartedAt, durationMs, {
      phase: "upload",
      uploadMbps: sentBytes > 0 ? bytesToMbps(sentBytes, elapsedMs) : null,
      detail: `${config.durationSeconds}-second test: uploading ${config.uploadMb} MB samples (${Math.round(sentBytes / MEGABYTE)} MB total)`,
    });
  }, 250);

  try {
    while (performance.now() < phaseEndsAt) {
      assertActive(signal);
      if (phaseEndsAt - performance.now() <= UPLOAD_DEADLINE_GUARD_MS) break;

      const payload = new Uint8Array(sampleBytes);
      crypto.getRandomValues(payload.subarray(0, Math.min(payload.length, 65_536)));
      const requestController = new AbortController();
      const remainingMs = phaseEndsAt - performance.now();
      const deadlineTimer = window.setTimeout(() => requestController.abort(), Math.max(0, remainingMs));
      const abortRequest = () => requestController.abort();

      signal.addEventListener("abort", abortRequest, { once: true });
      try {
        const response = await fetch(`${CLOUDFLARE_BASE_URL}/__up?r=${crypto.randomUUID()}`, {
          method: "POST",
          body: payload,
          cache: "no-store",
          signal: requestController.signal,
        });
        if (!response.ok) throw new Error(`Upload test failed (${response.status}).`);
        await response.arrayBuffer();
      } catch (error) {
        if (signal.aborted) throw error;
        if (performance.now() >= phaseEndsAt) break;
        throw error;
      } finally {
        window.clearTimeout(deadlineTimer);
        signal.removeEventListener("abort", abortRequest);
      }
      sentBytes += payload.byteLength;
      const elapsedMs = Math.max(performance.now() - phaseStartedAt, 1);
      if (runId === activeRunId) {
        setRunningSnapshot(testStartedAt, durationMs, {
          phase: "upload",
          uploadMbps: bytesToMbps(sentBytes, elapsedMs),
          detail: `${config.durationSeconds}-second test: uploading ${config.uploadMb} MB samples (${Math.round(sentBytes / MEGABYTE)} MB total)`,
        });
      }
    }
  } finally {
    window.clearInterval(updateTimer);
  }

  return bytesToMbps(sentBytes, Math.max(performance.now() - phaseStartedAt, 1));
}

async function startSpeedtest(): Promise<void> {
  stopSpeedtest("Restarting speed test…", false);

  const activeRunId = runId + 1;
  const config = speedtestConfig;
  const durationMs = config.durationSeconds * 1000;
  runId = activeRunId;
  controller = new AbortController();
  const signal = controller.signal;
  const testStartedAt = performance.now();

  setSnapshot({
    phase: "latency",
    progress: 0,
    latencyMs: null,
    downloadMbps: null,
    uploadMbps: null,
    activeConfig: config,
    detail: `Starting ${config.durationSeconds}-second Cloudflare speed test (${config.downloadMb} MB download, ${config.uploadMb} MB upload samples)…`,
    error: null,
    running: true,
  });

  try {
    const latencyMs = await measureLatency(signal, activeRunId, testStartedAt, durationMs, config);
    if (runId !== activeRunId) return;
    setRunningSnapshot(testStartedAt, durationMs, { phase: "download", latencyMs, detail: `${config.durationSeconds}-second test: measuring download speed with ${config.downloadMb} MB samples…` });

    const downloadMbps = await measureDownload(signal, activeRunId, testStartedAt, durationMs, config);
    if (runId !== activeRunId) return;
    setRunningSnapshot(testStartedAt, durationMs, { phase: "upload", downloadMbps, detail: `${config.durationSeconds}-second test: measuring upload speed with ${config.uploadMb} MB samples…` });

    const uploadMbps = await measureUpload(signal, activeRunId, testStartedAt, durationMs, config);
    await sleepUntil(testStartedAt + durationMs, signal);
    if (runId !== activeRunId) return;
    setSnapshot({
      phase: "complete",
      progress: 100,
      uploadMbps,
      running: false,
      detail: "Speed test complete.",
      error: null,
    });
  } catch (error) {
    if (runId !== activeRunId) return;
    const aborted = error instanceof DOMException && error.name === "AbortError";
    setSnapshot({
      phase: aborted ? "stopped" : "error",
      progress: aborted ? snapshot.progress : 0,
      running: false,
      detail: aborted ? "Stopped by user." : "Could not complete speed test.",
      error: aborted ? null : friendlyFetchError(error),
    });
  } finally {
    if (runId === activeRunId) {
      controller = null;
    }
  }
}

function stopSpeedtest(detail = "Stopped by user.", updateState = true): void {
  if (!controller) return;
  controller.abort();
  controller = null;
  runId += 1;
  if (updateState) {
    setSnapshot({ phase: "stopped", running: false, detail, error: null });
  }
}

function getSummary(current: SpeedtestSnapshot): string {
  if (current.phase === "idle") return "Run an internet speed test";
  if (current.phase === "error") return "Speed test failed";
  if (current.phase === "stopped") return "Speed test stopped";
  return `${formatMetric(current.latencyMs, "ms ping")} • ↓ ${formatMetric(current.downloadMbps, "Mbps")} • ↑ ${formatMetric(current.uploadMbps, "Mbps")}`;
}

export const speedtestPlugin: GQuickPlugin = {
  metadata: {
    id: "speedtest",
    title: "Speedtest",
    subtitle: "Latency, download, and upload via Cloudflare",
    icon: Gauge,
    keywords: ["speedtest", "speed test", "internet speed", "/st", "ping", "latency", "download", "upload"],
    queryPrefixes: [/^(speedtest|speed test|internet speed|\/st)$/i],
  },
  shouldSearch: isSpeedtestQuery,
  getItems: async (query: string): Promise<SearchResultItem[]> => {
    if (!isSpeedtestQuery(query)) return [];

    return [
      {
        id: "speedtest-runner",
        pluginId: "speedtest",
        title: getSummary(snapshot),
        subtitle: `${snapshot.phase} • ${Math.round(snapshot.progress)}% • Select to ${snapshot.running ? "view" : "start"}`,
        titleNode: <SpeedtestTitle />,
        subtitleNode: <SpeedtestSubtitle />,
        icon: Gauge,
        score: 230,
        onSelect: () => {
          if (!snapshot.running) void startSpeedtest();
        },
        renderPreview: () => <SpeedtestPreview />,
      },
    ];
  },
};

function SpeedtestPreview() {
  const current = useSpeedtestSnapshot();
  const config = useSpeedtestConfig();

  const statusLabel = current.error ?? current.detail;

  return (
    <div className="space-y-3 p-3 text-xs text-zinc-300" role="status" aria-live="polite" aria-label="Speed test status">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-zinc-100">Cloudflare speed test</div>
          <div className="mt-1 text-zinc-500">Phase: {current.phase} • Progress: {Math.round(current.progress)}%</div>
        </div>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            current.running ? stopSpeedtest() : void startSpeedtest();
          }}
          className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium cursor-pointer text-zinc-100 transition-colors hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-sky-400/60"
          aria-label={current.running ? "Stop speed test" : "Start speed test"}
        >
          {current.running ? <StopCircle className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          {current.running ? "Stop" : "Start"}
        </button>
      </div>

      <div className="h-2 overflow-hidden rounded-full bg-white/10" aria-label={`Progress ${Math.round(current.progress)} percent`}>
        <div className="h-full rounded-full bg-sky-400 transition-all duration-300" style={{ width: `${Math.min(current.progress, 100)}%` }} />
      </div>

      <SpeedtestConfigControls config={config} running={current.running} activeConfig={current.activeConfig} phase={current.phase} />

      <div className="rounded-lg bg-white/5 px-3 py-2 text-[11px] leading-relaxed text-zinc-400">
        {current.error && <AlertTriangle className="mr-1.5 inline h-3.5 w-3.5 text-amber-400" aria-hidden="true" />}
        {statusLabel}
      </div>
    </div>
  );
}

function SpeedtestConfigControls({ config, running, activeConfig, phase }: { config: SpeedtestConfig; running: boolean; activeConfig: SpeedtestConfig; phase: SpeedtestPhase }) {
  const shownConfig = running ? activeConfig : config;
  const hasRunConfig = !running && phase !== "idle";

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Test config</div>
        <div className="text-[10px] text-zinc-500">Limits: 5–300 sec, download 1–1000 MB, upload 1–200 MB</div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <NumberConfigInput
          id="speedtest-duration"
          label="Duration (sec)"
          value={config.durationSeconds}
          min={SPEEDTEST_CONFIG_LIMITS.durationSeconds.min}
          max={SPEEDTEST_CONFIG_LIMITS.durationSeconds.max}
          disabled={running}
          onChange={(durationSeconds) => saveSpeedtestConfig({ durationSeconds })}
        />
        <NumberConfigInput
          id="speedtest-download-size"
          label="Download (MB)"
          value={config.downloadMb}
          min={SPEEDTEST_CONFIG_LIMITS.downloadMb.min}
          max={SPEEDTEST_CONFIG_LIMITS.downloadMb.max}
          disabled={running}
          onChange={(downloadMb) => saveSpeedtestConfig({ downloadMb })}
        />
        <NumberConfigInput
          id="speedtest-upload-size"
          label="Upload (MB)"
          value={config.uploadMb}
          min={SPEEDTEST_CONFIG_LIMITS.uploadMb.min}
          max={SPEEDTEST_CONFIG_LIMITS.uploadMb.max}
          disabled={running}
          onChange={(uploadMb) => saveSpeedtestConfig({ uploadMb })}
        />
      </div>
      <div className="mt-2 text-[11px] text-zinc-500">
        {running ? "Active" : "Next run"}: {shownConfig.durationSeconds}s • ↓ {shownConfig.downloadMb} MB samples • ↑ {shownConfig.uploadMb} MB samples. Changes apply to next run.
        {hasRunConfig && <> Last run: {activeConfig.durationSeconds}s • ↓ {activeConfig.downloadMb} MB • ↑ {activeConfig.uploadMb} MB.</>}
      </div>
    </div>
  );
}

function NumberConfigInput({ id, label, value, min, max, disabled, onChange }: { id: string; label: string; value: number; min: number; max: number; disabled: boolean; onChange: (value: number) => void }) {
  return (
    <label htmlFor={id} className="block">
      <span className="mb-1 block text-[10px] text-zinc-500">{label}</span>
      <input
        id={id}
        type="number"
        min={min}
        max={max}
        step={1}
        value={value}
        disabled={disabled}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next)) onChange(clampNumber(next, min, max));
        }}
        className="w-full rounded-md border border-white/10 bg-black/20 px-2 py-1.5 text-xs text-zinc-100 outline-none transition-colors focus:border-sky-400/60 focus:ring-2 focus:ring-sky-400/20 disabled:cursor-not-allowed disabled:opacity-60"
        aria-describedby={`${id}-help`}
      />
      <span id={`${id}-help`} className="sr-only">Allowed range {min} to {max}.</span>
    </label>
  );
}

function SpeedtestTitle() {
  return <>{getSummary(useSpeedtestSnapshot())}</>;
}

function SpeedtestSubtitle() {
  const current = useSpeedtestSnapshot();
  return <>{current.phase} • {Math.round(current.progress)}% • Select to {current.running ? "view" : "start"}</>;
}
