import { invoke } from "@tauri-apps/api/core";
import { Box, Download, Layers } from "lucide-react";
import { searchDockerHub } from "../utils/dockerHub";
import { GQuickPlugin, SearchResultItem } from "./types";
import type { DockerInitialImage } from "../components/DockerView";

interface ContainerInfo {
  id: string;
  image: string;
  status: string;
  names: string;
  ports?: string;
  state?: string;
}

interface ImageInfo {
  id: string;
  repository: string;
  tag: string;
  size: string;
  created_since: string;
}

function confirmRisk(message: string): boolean {
  return window.confirm(message);
}

function openDocker(initialImage?: Omit<DockerInitialImage, "selectedAt">) {
  window.dispatchEvent(new CustomEvent<DockerInitialImage | undefined>("gquick-open-docker", {
    detail: initialImage ? { ...initialImage, selectedAt: Date.now() } : undefined,
  }));
}

const DOCKER_PREFIX_PATTERN = /^docker\s*:/i;

function getOpenDockerItem(subtitle = "Manage containers, images, Hub search, Compose, logs, exec, inspect, prune"): SearchResultItem {
  return {
    id: "docker-open-page",
    pluginId: "docker",
    title: "Open Docker",
    subtitle,
    icon: Box,
    score: 120,
    onSelect: () => openDocker(),
  };
}

export const dockerPlugin: GQuickPlugin = {
  metadata: {
    id: "docker",
    title: "Docker",
    icon: Box,
    keywords: ["docker", "container", "image", "hub", "compose"],
    queryPrefixes: [/^docker\s*:/i],
  },
  getItems: async (query: string): Promise<SearchResultItem[]> => {
    const trimmedQuery = query.trim();

    // Keep Docker search opt-in so the launcher does not pay Docker CLI/Hub latency
    // unless the user explicitly asks with the `docker:` prefix.
    if (!DOCKER_PREFIX_PATTERN.test(trimmedQuery)) {
      return trimmedQuery.toLowerCase() === "docker" ? [getOpenDockerItem("Open Docker page. Use docker: <image> to search images.")] : [];
    }

    const searchTerm = trimmedQuery.replace(DOCKER_PREFIX_PATTERN, "").trim();
    const q = searchTerm.toLowerCase();

    if (!q) {
      return [getOpenDockerItem("Type docker: <image> to search local images and Docker Hub.")];
    }

    const items: SearchResultItem[] = [getOpenDockerItem("Docker image search results for docker: <image>")];

    try {
      const containers = await invoke<ContainerInfo[]>("list_containers");
      containers
        .filter((c) => c.names.toLowerCase().includes(q) || c.image.toLowerCase().includes(q))
        .slice(0, 5)
        .forEach((c) => {
          const isUp = (c.state || c.status).toLowerCase().includes("running") || c.status.includes("Up");
          const actions: NonNullable<SearchResultItem["actions"]> = [
            { id: "toggle", label: isUp ? "Stop" : "Start", onRun: () => { void invoke("manage_container", { id: c.id, action: isUp ? "stop" : "start" }); } },
            { id: "restart", label: "Restart", onRun: () => { void invoke("manage_container", { id: c.id, action: "restart" }); } },
            { id: "logs", label: "Open Logs", onRun: () => openDocker() },
            {
              id: "remove",
              label: "Remove...",
              onRun: () => {
                if (confirmRisk(`Remove container ${c.names}? This cannot be undone.`)) {
                  void invoke("manage_container", { id: c.id, action: "remove", confirmed: true });
                }
              },
            },
          ];

          items.push({
            id: `docker-container-${c.id}`,
            pluginId: "docker",
            title: c.names,
            subtitle: `Container: ${c.image} (${c.status})${c.ports ? ` • ${c.ports}` : ""}`,
            icon: Box,
            onSelect: () => openDocker(),
            actions,
            score: 100,
            renderPreview: () => <ActionRow actions={actions} />,
          });
        });
    } catch {
      items.push({ id: "docker-local-error", pluginId: "docker", title: "Docker unavailable", subtitle: "Open Docker page for CLI/daemon status", icon: Box, onSelect: () => openDocker(), score: 90 });
    }

    try {
      const images = await invoke<ImageInfo[]>("list_images");
      images
        .filter((img) => img.repository.toLowerCase().includes(q) || `${img.repository}:${img.tag}`.toLowerCase().includes(q))
        .slice(0, 5)
        .forEach((img) => {
          const imageName = `${img.repository}:${img.tag}`;
          const initialImage = { source: "local" as const, image: imageName, id: img.id, tag: img.tag };
          const actions: NonNullable<SearchResultItem["actions"]> = [
            { id: "run", label: "Run in Docker page", onRun: () => openDocker(initialImage) },
            {
              id: "delete",
              label: "Delete...",
              onRun: () => {
                if (confirmRisk(`Delete image ${imageName}?`)) {
                  void invoke("delete_image", { id: img.id, force: false, confirmed: true });
                }
              },
            },
          ];

          items.push({
            id: `docker-image-${img.id}-${img.tag}`,
            pluginId: "docker",
            title: imageName,
            subtitle: `Image: ${img.size} • Created: ${img.created_since}`,
            icon: Layers,
            onSelect: () => openDocker(initialImage),
            actions,
            score: 95,
            renderPreview: () => <ActionRow actions={actions} />,
          });
        });
    } catch {
      // Local Docker failures are already represented by status/error item above.
    }

    if (q.length >= 2) {
      try {
        const hubResults = await searchDockerHub(q);
        hubResults.slice(0, 5).forEach((repo) => {
          const imageName = `${repo.repositoryName}:latest`;
          const initialImage = {
            source: "hub" as const,
            image: imageName,
            repositoryName: repo.repositoryName,
            description: repo.description,
            stars: repo.starCount,
            pulls: repo.pullCount,
          };
          const actions: NonNullable<SearchResultItem["actions"]> = [
            { id: "pull", label: "Pull latest", onRun: () => { void invoke("pull_image", { image: imageName }); } },
            { id: "open", label: "Open Docker page", onRun: () => openDocker(initialImage) },
          ];

          items.push({
            id: `docker-hub-${repo.repositoryName}`,
            pluginId: "docker",
            title: repo.repositoryName,
            subtitle: `Docker Hub • ${repo.starCount.toLocaleString()} stars • ${repo.pullCount.toLocaleString()} pulls`,
            icon: Download,
            onSelect: () => openDocker(initialImage),
            actions,
            score: 80,
            renderPreview: () => (
              <div className="p-3 space-y-2">
                <p className="text-xs text-zinc-300">{repo.description}</p>
                <ActionRow actions={actions} />
              </div>
            ),
          });
        });
      } catch {
        items.push({ id: "docker-hub-error", pluginId: "docker", title: "Docker Hub search failed", subtitle: "Local Docker actions are still available", icon: Download, onSelect: () => {}, score: 20 });
      }
    }

    return items;
  },
};

function ActionRow({ actions }: { actions: NonNullable<SearchResultItem["actions"]> }) {
  return (
    <div className="flex flex-wrap gap-2 p-2">
      {actions.map((action) => (
        <button
          key={action.id}
          onClick={(e) => {
            e.stopPropagation();
            action.onRun();
          }}
          className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs text-zinc-200 transition-colors"
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}
