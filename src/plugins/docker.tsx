import { invoke } from "@tauri-apps/api/core";
import { Box, Layers } from "lucide-react";
import { GQuickPlugin, SearchResultItem } from "./types";

interface ContainerInfo {
  id: string;
  image: string;
  status: string;
  names: string;
}

interface ImageInfo {
  id: string;
  repository: string;
  tag: string;
  size: string;
  created_since: string;
}

export const dockerPlugin: GQuickPlugin = {
  metadata: {
    id: "docker",
    title: "Docker",
    icon: Box,
    keywords: ["docker", "container", "image", "ps", "start", "stop", "restart", "delete"],
  },
  getItems: async (query: string): Promise<SearchResultItem[]> => {
    const q = query.toLowerCase();
    const isDockerQuery = q.includes("docker") || q.includes("container") || q.includes("image");

    try {
      const items: SearchResultItem[] = [];
      
      // Containers
      const containers = await invoke<ContainerInfo[]>("list_containers");
      const filteredContainers = containers.filter(c => 
        c.names.toLowerCase().includes(q) || c.image.toLowerCase().includes(q) || isDockerQuery
      ).slice(0, 5);

      filteredContainers.forEach(c => {
        const isUp = c.status.includes("Up");
        const containerActions = [
          {
            id: "toggle",
            label: isUp ? "Stop" : "Start",
            onRun: () => invoke("manage_container", { id: c.id, action: isUp ? "stop" : "start" })
          },
          {
            id: "restart",
            label: "Restart",
            onRun: () => invoke("manage_container", { id: c.id, action: "restart" })
          }
        ];
        items.push({
          id: `docker-container-${c.id}`,
          pluginId: "docker",
          title: c.names,
          subtitle: `Container: ${c.image} (${c.status})`,
          icon: Box,
          onSelect: () => {}, // Use actions for this
          actions: containerActions,
          score: isDockerQuery ? 100 : undefined,
          renderPreview: () => (
            <div className="flex gap-2 p-2">
              {containerActions.map(action => (
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
          )
        });
      });

      // Images
      const images = await invoke<ImageInfo[]>("list_images");
      const filteredImages = images.filter(img => 
        img.repository.toLowerCase().includes(q) || isDockerQuery
      ).slice(0, 5);

      filteredImages.forEach(img => {
        const imageActions = [
          {
            id: "delete",
            label: "Delete Image",
            onRun: () => invoke("delete_image", { id: img.id })
          }
        ];
        items.push({
          id: `docker-image-${img.id}`,
          pluginId: "docker",
          title: `${img.repository}:${img.tag}`,
          subtitle: `Image: ${img.size} • Created: ${img.created_since}`,
          icon: Layers,
          onSelect: () => {},
          actions: imageActions,
          score: isDockerQuery ? 100 : undefined,
          renderPreview: () => (
            <div className="flex gap-2 p-2">
              {imageActions.map(action => (
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
          )
        });
      });

      return items;
    } catch (e) {
      console.error(e);
      return [];
    }
  },
};
