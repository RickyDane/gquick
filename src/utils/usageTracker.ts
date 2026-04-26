export interface UsageEntry {
  id: string;
  pluginId: string;
  title: string;
  subtitle?: string;
  icon?: string;
  query: string;
  timestamp: number;
  count: number;
}

const STORAGE_KEY = "gquick-usage-history";
const MAX_ENTRIES = 100;
const RECENT_LIMIT = 8;

function loadEntries(): UsageEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as UsageEntry[];
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

function saveEntries(entries: UsageEntry[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // ignore quota errors
  }
}

function calculateScore(entry: UsageEntry): number {
  const hoursAgo = (Date.now() - entry.timestamp) / (1000 * 60 * 60);
  // Exponential decay: score drops to ~37% after 48 hours
  const decay = Math.exp(-hoursAgo / 48);
  return entry.count * decay;
}

export function recordUsage(entry: Omit<UsageEntry, "timestamp" | "count">) {
  const entries = loadEntries();
  const existingIndex = entries.findIndex(
    (e) => e.id === entry.id && e.pluginId === entry.pluginId
  );

  if (existingIndex >= 0) {
    const existing = entries[existingIndex];
    existing.count += 1;
    existing.timestamp = Date.now();
    existing.title = entry.title;
    existing.subtitle = entry.subtitle;
    existing.query = entry.query;
    if (entry.icon !== undefined) existing.icon = entry.icon;
    // Move to end (most recent)
    entries.splice(existingIndex, 1);
    entries.push(existing);
  } else {
    entries.push({
      ...entry,
      timestamp: Date.now(),
      count: 1,
    });
  }

  // Trim to max
  if (entries.length > MAX_ENTRIES) {
    entries.splice(0, entries.length - MAX_ENTRIES);
  }

  saveEntries(entries);
}

export function getRecentItems(limit = RECENT_LIMIT): UsageEntry[] {
  const entries = loadEntries();
  return entries
    .map((e) => ({ entry: e, score: calculateScore(e) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.entry);
}

export function clearUsageHistory() {
  localStorage.removeItem(STORAGE_KEY);
}
