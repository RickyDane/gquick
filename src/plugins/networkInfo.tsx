import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Copy, Network } from "lucide-react";
import { GQuickPlugin, SearchResultItem, ToolResult } from "./types";

interface NetworkInfo {
  localIp: string;
  publicIp: string;
  ssid: string;
  wifiPermissionState: string;
  latency: string;
}

const NETWORK_CACHE_TTL_MS = 45_000;
const NETWORK_QUERY_PATTERN = /^(net|network)(:|\b)/i;
const EXACT_NETWORK_QUERIES = new Set(["wifi", "wi-fi"]);

let cachedNetworkInfo: { info: NetworkInfo; expiresAt: number } | null = null;
let networkInfoRequest: Promise<NetworkInfo> | null = null;

const WIFI_PERMISSION_NEEDED_LABEL = "Wi-Fi Permission needed";

function isNetworkQuery(query: string): boolean {
  const trimmed = query.trim().toLowerCase();
  return NETWORK_QUERY_PATTERN.test(trimmed) || EXACT_NETWORK_QUERIES.has(trimmed);
}

function needsWifiPermission(info: NetworkInfo): boolean {
  return info.wifiPermissionState !== "granted";
}

function wifiLabel(info: NetworkInfo): string {
  return needsWifiPermission(info) ? WIFI_PERMISSION_NEEDED_LABEL : info.ssid;
}

function formatSummary(info: NetworkInfo): string {
  return `IP ${info.localIp} • Wi-Fi ${wifiLabel(info)} • ${info.latency}`;
}

function formatDetails(info: NetworkInfo): string {
  return [
    `Local IP: ${info.localIp}`,
    `Public IP: ${info.publicIp} (fetched from api.ipify.org; cached briefly)`,
    `Wi-Fi: ${wifiLabel(info)}`,
    `Latency: ${info.latency}`,
  ].join("\n");
}

async function copyAndHide(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    await getCurrentWindow().hide();
  } catch (error) {
    console.warn("Failed to copy network info:", error);
  }
}

async function getCachedNetworkInfo(): Promise<NetworkInfo> {
  const now = Date.now();
  if (cachedNetworkInfo && cachedNetworkInfo.expiresAt > now) {
    return cachedNetworkInfo.info;
  }

  if (!networkInfoRequest) {
    networkInfoRequest = invoke<NetworkInfo>("get_network_info")
      .then((info) => {
        cachedNetworkInfo = { info, expiresAt: Date.now() + NETWORK_CACHE_TTL_MS };
        return info;
      })
      .finally(() => {
        networkInfoRequest = null;
      });
  }

  return networkInfoRequest;
}

function unavailableInfo(): NetworkInfo {
  return {
    localIp: "Unavailable",
    publicIp: "Unavailable",
    ssid: "Unavailable",
    wifiPermissionState: "unknown",
    latency: "Unavailable",
  };
}

async function requestWifiPermission(): Promise<void> {
  try {
    const state = await invoke<string>("request_wifi_permission");
    console.info("Wi-Fi permission request state:", state);

    if (state !== "granted") {
      await openWifiPrivacySettings();
    }
  } catch (error) {
    console.warn("Wi-Fi permission request failed, opening System Settings:", error);
    try {
      await openWifiPrivacySettings();
    } catch (settingsError) {
      console.warn("Failed to open Wi-Fi privacy settings:", settingsError);
    }
  } finally {
    cachedNetworkInfo = null;
    networkInfoRequest = null;
  }
}

async function openWifiPrivacySettings(): Promise<void> {
  await invoke("open_wifi_privacy_settings");
}

export const networkInfoPlugin: GQuickPlugin = {
  metadata: {
    id: "network-info",
    title: "Network info",
    subtitle: "IP, Wi-Fi, and latency",
    icon: Network,
    keywords: ["net", "network", "ip", "wifi", "ping", "latency"],
    queryPrefixes: [/^(net|network)(:|\b)/i, /^(wifi|wi-fi)$/i],
  },
  shouldSearch: isNetworkQuery,
  searchDebounceMs: 150,
  tools: [
    {
      name: "get_network_info",
      description: "Get local network information including IP addresses, Wi-Fi SSID, and latency.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  ],
  executeTool: async (_name: string, _args: Record<string, any>): Promise<ToolResult> => {
    try {
      const info = await getCachedNetworkInfo();
      return {
        content: JSON.stringify(info),
        success: true,
      };
    } catch (err: any) {
      return {
        content: JSON.stringify(unavailableInfo()),
        success: false,
        error: err.message || String(err),
      };
    }
  },
  getItems: async (query: string): Promise<SearchResultItem[]> => {
    if (!isNetworkQuery(query)) return [];

    let info = unavailableInfo();
    try {
      info = await getCachedNetworkInfo();
    } catch (error) {
      console.error("Failed to get network info:", error);
    }

    const summary = formatSummary(info);
    const details = formatDetails(info);
    const actions: NonNullable<SearchResultItem["actions"]> = [
      {
        id: "copy-summary",
        label: "Copy summary",
        shortcut: "Enter",
        onRun: () => {
          void copyAndHide(summary);
        },
      },
      {
        id: "copy-details",
        label: "Copy details",
        onRun: () => {
          void copyAndHide(details);
        },
      },
    ];

    return [
      {
        id: "network-info-summary",
        pluginId: "network-info",
        title: summary,
        subtitle: needsWifiPermission(info)
          ? "Wi-Fi permission needed • Select to copy summary"
          : `Public ${info.publicIp} • Cached briefly • Select to copy summary`,
        icon: Network,
        score: 220,
        onSelect: () => {
          void copyAndHide(summary);
        },
        actions,
        renderPreview: () => <NetworkInfoPreview info={info} actions={actions} />,
      },
    ];
  },
};

function NetworkInfoPreview({
  info,
  actions,
}: {
  info: NetworkInfo;
  actions: NonNullable<SearchResultItem["actions"]>;
}) {
  const rows = [
    ["Local IP", info.localIp],
    ["Public IP", info.publicIp],
    ["Wi-Fi", wifiLabel(info)],
    ["Latency", info.latency],
  ];

  const wifiPermissionNeeded = needsWifiPermission(info);

  return (
    <div className="space-y-3 p-3 text-xs text-zinc-300">
      {wifiPermissionNeeded && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] leading-relaxed text-amber-200">
          Wi-Fi name is blocked by macOS privacy. Grant Location Services access for GQuick.
        </div>
      )}
      <div className="grid grid-cols-[84px_1fr] gap-x-3 gap-y-1.5">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <span className="text-zinc-500">{label}</span>
            <span className="truncate text-zinc-200">{value}</span>
          </div>
        ))}
      </div>
      <div className="rounded-lg bg-white/5 px-3 py-2 text-[11px] leading-relaxed text-zinc-500">
        Public IP uses api.ipify.org and is cached briefly to avoid repeated lookups.
      </div>
      <div className="flex flex-wrap gap-2">
        {wifiPermissionNeeded && (
          <button
            onClick={(event) => {
              event.stopPropagation();
              void requestWifiPermission();
            }}
            className="inline-flex items-center gap-1.5 cursor-pointer rounded-lg bg-amber-500/20 px-3 py-1.5 text-xs text-amber-100 transition-colors hover:bg-amber-500/30"
          >
            Grant Permission
          </button>
        )}
        {wifiPermissionNeeded && (
          <button
            onClick={(event) => {
              event.stopPropagation();
              void openWifiPrivacySettings();
            }}
            className="inline-flex items-center gap-1.5 cursor-pointer rounded-lg bg-white/10 px-3 py-1.5 text-xs text-zinc-200 transition-colors hover:bg-white/20"
          >
            Open System Settings
          </button>
        )}
        {actions.map((action) => (
          <button
            key={action.id}
            onClick={(event) => {
              event.stopPropagation();
              action.onRun();
            }}
            className="inline-flex items-center gap-1.5 cursor-pointer rounded-lg bg-white/10 px-3 py-1.5 text-xs text-zinc-200 transition-colors hover:bg-white/20"
          >
            <Copy className="h-3.5 w-3.5" />
            {action.label}
          </button>
        ))}
      </div>
    </div>
  );
}
