import { invoke } from "@tauri-apps/api/core";

export interface DockerHubResult {
  name: string;
  namespace: string;
  repositoryName: string;
  description: string;
  starCount: number;
  pullCount: number;
  isOfficial: boolean;
  isAutomated: boolean;
  lastUpdated?: string | null;
}

const cache = new Map<string, { timestamp: number; results: DockerHubResult[] }>();
const CACHE_TTL_MS = 60_000;

export async function searchDockerHub(query: string, signal?: AbortSignal): Promise<DockerHubResult[]> {
  const normalized = query.trim();
  if (normalized.length < 2) return [];
  if (signal?.aborted) throw new DOMException("Docker Hub search aborted", "AbortError");

  const cached = cache.get(normalized);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.results;
  }

  const results = await invoke<DockerHubResult[]>("search_docker_hub", {
    query: normalized,
    pageSize: 10,
  });
  if (signal?.aborted) throw new DOMException("Docker Hub search aborted", "AbortError");

  cache.set(normalized, { timestamp: Date.now(), results });
  return results;
}
