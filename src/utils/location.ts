export interface SavedLocation {
  name: string;
  latitude: number;
  longitude: number;
  country?: string;
  admin1?: string;
}

const STORAGE_KEY = 'weather-location';
const GEOCODING_API = 'https://geocoding-api.open-meteo.com/v1/search';

export function getSavedLocation(): SavedLocation | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.name !== 'string' || typeof parsed.latitude !== 'number' || typeof parsed.longitude !== 'number') {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveLocation(loc: SavedLocation): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(loc));
}

export function clearSavedLocation(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export async function geocodeLocation(name: string, signal?: AbortSignal): Promise<SavedLocation | null> {
  const res = await fetch(
    `${GEOCODING_API}?name=${encodeURIComponent(name)}&count=1&language=en&format=json`,
    { signal }
  );
  if (!res.ok) throw new Error('Geocoding request failed');
  const data = await res.json();
  if (!data.results || data.results.length === 0) return null;
  const result = data.results[0];
  return {
    name: result.name,
    latitude: result.latitude,
    longitude: result.longitude,
    country: result.country,
    admin1: result.admin1,
  };
}

interface GeocodingApiResult {
  name: string;
  latitude: number;
  longitude: number;
  country?: string;
  admin1?: string;
}

export async function searchLocations(name: string, signal?: AbortSignal): Promise<SavedLocation[]> {
  const res = await fetch(
    `${GEOCODING_API}?name=${encodeURIComponent(name)}&count=5&language=en&format=json`,
    { signal }
  );
  if (!res.ok) throw new Error('Geocoding request failed');
  const data = await res.json();
  if (!data.results || data.results.length === 0) return [];
  return (data.results as GeocodingApiResult[]).map((result) => ({
    name: result.name,
    latitude: result.latitude,
    longitude: result.longitude,
    country: result.country,
    admin1: result.admin1,
  }));
}
