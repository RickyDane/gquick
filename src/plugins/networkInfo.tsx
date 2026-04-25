import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Copy, Network } from "lucide-react";
import { GQuickPlugin, SearchResultItem, ToolResult } from "./types";

interface NetworkInfo {
  localIp: string;
  publicIp: string;
  ssid: string;
  vpn: string;
  latency: string;
}

const NETWORK_CACHE_TTL_MS = 45_000;
const NETWORK_QUERY_PATTERN = /^(net|network)(:|\b)/i;
const EXACT_NETWORK_QUERIES = new Set(["wifi", "wi-fi", "vpn"]);

let cachedNetworkInfo: { info: NetworkInfo; expiresAt: number } | null = null;
let networkInfoRequest: Promise<NetworkInfo> | null = null;

function isNetworkQuery(query: string): boolean {
  const trimmed = query.trim().toLowerCase();
  return NETWORK_QUERY_PATTERN.test(trimmed) || EXACT_NETWORK_QUERIES.has(trimmed);
}

function formatSummary(info: NetworkInfo): string {
  return `IP ${info.localIp} • Wi-Fi ${info.ssid} • VPN ${info.vpn} • ${info.latency}`;
}

function formatDetails(info: NetworkInfo): string {
  return [
    `Local IP: ${info.localIp}`,
    `Public IP: ${info.publicIp} (fetched from api.ipify.org; cached briefly)`,
    `Wi-Fi: ${info.ssid}`,
    `VPN: ${info.vpn}`,
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
    vpn: "Unavailable",
    latency: "Unavailable",
  };
}

export const networkInfoPlugin: GQuickPlugin = {
  metadata: {
    id: "network-info",
    title: "Network info",
    subtitle: "IP, Wi-Fi, VPN, and latency",
    icon: Network,
    keywords: ["net", "network", "ip", "wifi", "vpn", "ping", "latency"],
    queryPrefixes: [/^(net|network)(:|\b)/i, /^(wifi|wi-fi|vpn)$/i],
  },
  shouldSearch: isNetworkQuery,
  searchDebounceMs: 150,
  tools: [
    {
      name: "get_network_info",
      description: "Get local network information including IP addresses, Wi-Fi SSID, VPN status, and latency.",
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
        subtitle: `Public ${info.publicIp} • Cached briefly • Select to copy summary`,
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
    ["Wi-Fi", info.ssid],
    ["VPN", info.vpn],
    ["Latency", info.latency],
  ];

  return (
    <div className="space-y-3 p-3 text-xs text-zinc-300">
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
        {actions.map((action) => (
          <button
            key={action.id}
            onClick={(event) => {
              event.stopPropagation();
              action.onRun();
            }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs text-zinc-200 transition-colors hover:bg-white/20"
          >
            <Copy className="h-3.5 w-3.5" />
            {action.label}
          </button>
        ))}
      </div>
    </div>
  );
}
