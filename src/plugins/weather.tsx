import { useState, useEffect } from "react";
import {
  Sun,
  CloudSun,
  CloudFog,
  CloudDrizzle,
  CloudRain,
  Snowflake,
  CloudLightning,
  MapPin,
  Loader2,
  Droplets,
  Wind,
  Thermometer,
  Check,
} from "lucide-react";
import { GQuickPlugin, SearchResultItem, ToolResult } from "./types";
import type { LucideIcon } from "lucide-react";
import { getSavedLocation, saveLocation, geocodeLocation, searchLocations, SavedLocation } from "../utils/location";

const FORECAST_API = "https://api.open-meteo.com/v1/forecast";

function getWeatherIcon(code: number): LucideIcon {
  if (code === 0) return Sun;
  if ([1, 2, 3].includes(code)) return CloudSun;
  if ([45, 48].includes(code)) return CloudFog;
  if ([51, 53, 55].includes(code)) return CloudDrizzle;
  if ([61, 63, 65, 80, 81, 82].includes(code)) return CloudRain;
  if ([71, 73, 75, 85, 86].includes(code)) return Snowflake;
  if ([95, 96, 99].includes(code)) return CloudLightning;
  return CloudSun;
}

function getWeatherConditionText(code: number): string {
  const conditions: Record<number, string> = {
    0: "Clear sky",
    1: "Mainly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Fog",
    48: "Rime fog",
    51: "Light drizzle",
    53: "Moderate drizzle",
    55: "Dense drizzle",
    61: "Slight rain",
    63: "Moderate rain",
    65: "Heavy rain",
    71: "Slight snow",
    73: "Moderate snow",
    75: "Heavy snow",
    80: "Slight showers",
    81: "Moderate showers",
    82: "Violent showers",
    85: "Slight snow showers",
    86: "Heavy snow showers",
    95: "Thunderstorm",
    96: "Thunderstorm with hail",
    99: "Heavy thunderstorm with hail",
  };
  return conditions[code] || "Unknown";
}

interface ForecastDay {
  date: Date;
  maxTemp: number;
  minTemp: number;
  weatherCode: number;
  precipProb: number;
}

interface WeatherData {
  current: {
    temperature_2m: number;
    relative_humidity_2m: number;
    apparent_temperature: number;
    weather_code: number;
    wind_speed_10m: number;
    is_day: number;
  };
  daily: {
    time: string[];
    weather_code: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_probability_max: number[];
  };
}

interface WeatherPreviewProps {
  location: SavedLocation;
}

function WeatherPreview({ location }: WeatherPreviewProps) {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");

    fetchWeatherData(location.latitude, location.longitude, controller.signal)
      .then((data) => {
        setWeather(data);
      })
      .catch((err) => {
        if (err.name !== "AbortError") {
          setError(err.message || "Failed to load weather");
        }
      })
      .finally(() => {
        setLoading(false);
      });

    return () => {
      controller.abort();
    };
  }, [location.latitude, location.longitude]);

  useEffect(() => {
    const handleSaved = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail === location.name) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    };
    window.addEventListener("gquick-weather-saved", handleSaved);
    return () => window.removeEventListener("gquick-weather-saved", handleSaved);
  }, [location.name]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8 min-w-[420px]">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl min-w-[420px]">
        {error}
      </div>
    );
  }

  if (!weather) return null;

  const current = weather.current;
  const CurrentIcon = getWeatherIcon(current.weather_code);
  const currentCondition = getWeatherConditionText(current.weather_code);

  const forecast: ForecastDay[] = weather.daily.time.slice(0, 7).map((time, i) => ({
    date: new Date(time),
    maxTemp: weather.daily.temperature_2m_max[i],
    minTemp: weather.daily.temperature_2m_min[i],
    weatherCode: weather.daily.weather_code[i],
    precipProb: weather.daily.precipitation_probability_max[i],
  }));

  return (
    <div className="flex flex-col gap-4 p-4 min-w-[420px] relative">
      {saved && (
        <div className="absolute top-2 right-2 z-10 flex items-center gap-1 px-2.5 py-1 bg-green-500/15 border border-green-500/25 rounded-lg text-xs text-green-300 animate-in fade-in slide-in-from-top-2 duration-300">
          <Check className="h-3 w-3" />
          Location saved
        </div>
      )}
      <div className="bg-white/5 border border-white/10 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-zinc-200">
            {location.name}
            {location.country && (
              <span className="text-zinc-500 font-normal">, {location.country}</span>
            )}
          </h3>
          <span className="text-xs text-zinc-500">Current</span>
        </div>

        <div className="flex items-center gap-4">
          <CurrentIcon className="h-12 w-12 text-zinc-200 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-3xl font-bold text-zinc-100">
              {Math.round(current.temperature_2m)}°C
            </div>
            <div className="text-sm text-zinc-400 truncate">{currentCondition}</div>
          </div>
          <div className="flex flex-col gap-1.5 text-xs text-zinc-500">
            <div className="flex items-center gap-1.5">
              <Thermometer className="h-3.5 w-3.5" />
              <span>Feels {Math.round(current.apparent_temperature)}°</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Droplets className="h-3.5 w-3.5" />
              <span>{current.relative_humidity_2m}%</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Wind className="h-3.5 w-3.5" />
              <span>{Math.round(current.wind_speed_10m)} km/h</span>
            </div>
          </div>
        </div>
      </div>

      <div>
        <h4 className="text-xs font-bold text-zinc-500 uppercase mb-2">7-Day Forecast</h4>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {forecast.map((day, i) => {
            const DayIcon = getWeatherIcon(day.weatherCode);
            const dayName =
              i === 0 ? "Today" : day.date.toLocaleDateString("en-US", { weekday: "short" });
            return (
              <div
                key={i}
                className="flex-shrink-0 w-[72px] bg-white/5 border border-white/10 rounded-xl p-2 flex flex-col items-center gap-1"
              >
                <span className="text-[11px] text-zinc-500">{dayName}</span>
                <DayIcon className="h-5 w-5 text-zinc-300" />
                <span className="text-xs font-semibold text-zinc-200">
                  {Math.round(day.maxTemp)}°
                </span>
                <span className="text-[10px] text-zinc-500">{Math.round(day.minTemp)}°</span>
                {day.precipProb > 0 && (
                  <span className="text-[10px] text-blue-400">{day.precipProb}%</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function NoLocationPrompt() {
  return (
    <div className="flex flex-col items-center justify-center p-8 gap-3 min-w-[420px] text-center">
      <MapPin className="h-8 w-8 text-zinc-600" />
      <div>
        <p className="text-sm font-medium text-zinc-300">No weather location set</p>
        <p className="text-xs text-zinc-500 mt-1">
          Type <code className="bg-white/10 px-1 py-0.5 rounded text-zinc-400">/wt London</code> to search for a city, or set a location in Settings
        </p>
      </div>
    </div>
  );
}

async function fetchWeatherData(
  latitude: number,
  longitude: number,
  signal?: AbortSignal
): Promise<WeatherData> {
  const url = `${FORECAST_API}?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,is_day&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error("Failed to fetch weather");
  const data = await res.json();
  if (!data?.current || !Array.isArray(data?.daily?.time)) {
    throw new Error("Invalid weather response");
  }
  return data;
}

export const weatherPlugin: GQuickPlugin = {
  metadata: {
    id: "weather",
    title: "Weather",
    subtitle: "Weather forecast",
    icon: CloudSun,
    keywords: ["weather", "forecast", "temperature", "rain", "sun", "climate"],
    queryPrefixes: ["/wt", "weather:"],
  },
  tools: [
    {
      name: "get_current_weather",
      description: "Get the current weather conditions for a location.",
      parameters: {
        type: "object",
        properties: {
          location: { type: "string", description: "City name or location to get weather for. If omitted, uses the user's saved location." },
        },
        required: [],
      },
    },
    {
      name: "get_weather_forecast",
      description: "Get the 7-day weather forecast for a location.",
      parameters: {
        type: "object",
        properties: {
          location: { type: "string", description: "City name or location to get forecast for. If omitted, uses the user's saved location." },
        },
        required: [],
      },
    },
  ],
  executeTool: async (name: string, args: Record<string, any>): Promise<ToolResult> => {
    let locationName = args.location;
    if (typeof locationName !== "string" || !locationName.trim()) {
      const saved = getSavedLocation();
      if (!saved) {
        return { content: "", success: false, error: "No location provided and no saved location set. Please specify a location or set one in Settings." };
      }
      const weather = await fetchWeatherData(saved.latitude, saved.longitude);

      if (name === "get_current_weather") {
        const current = weather.current;
        const condition = getWeatherConditionText(current.weather_code);
        const summary = `Current weather in ${saved.name}${saved.country ? `, ${saved.country}` : ""}:\n` +
          `Temperature: ${Math.round(current.temperature_2m)}°C (feels like ${Math.round(current.apparent_temperature)}°C)\n` +
          `Condition: ${condition}\n` +
          `Humidity: ${current.relative_humidity_2m}%\n` +
          `Wind Speed: ${Math.round(current.wind_speed_10m)} km/h`;
        return { content: summary, success: true };
      }

      if (name === "get_weather_forecast") {
        const daily = weather.daily;
        let summary = `7-day weather forecast for ${saved.name}${saved.country ? `, ${saved.country}` : ""}:\n`;
        for (let i = 0; i < daily.time.length; i++) {
          const date = new Date(daily.time[i]).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
          const condition = getWeatherConditionText(daily.weather_code[i]);
          const maxTemp = Math.round(daily.temperature_2m_max[i]);
          const minTemp = Math.round(daily.temperature_2m_min[i]);
          summary += `\n${date}: ${condition}, High ${maxTemp}°C, Low ${minTemp}°C`;
        }
        return { content: summary, success: true };
      }

      return { content: "", success: false, error: `Unknown tool: ${name}` };
    }

    try {
      const loc = await geocodeLocation(locationName);
      if (!loc) {
        return { content: "", success: false, error: `Location "${locationName}" not found` };
      }

      const weather = await fetchWeatherData(loc.latitude, loc.longitude);

      if (name === "get_current_weather") {
        const current = weather.current;
        const condition = getWeatherConditionText(current.weather_code);
        const summary = `Current weather in ${loc.name}${loc.country ? `, ${loc.country}` : ""}:\n` +
          `Temperature: ${Math.round(current.temperature_2m)}°C (feels like ${Math.round(current.apparent_temperature)}°C)\n` +
          `Condition: ${condition}\n` +
          `Humidity: ${current.relative_humidity_2m}%\n` +
          `Wind Speed: ${Math.round(current.wind_speed_10m)} km/h`;
        return { content: summary, success: true };
      }

      if (name === "get_weather_forecast") {
        const daily = weather.daily;
        let summary = `7-day weather forecast for ${loc.name}${loc.country ? `, ${loc.country}` : ""}:\n`;
        for (let i = 0; i < daily.time.length; i++) {
          const date = new Date(daily.time[i]).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
          const condition = getWeatherConditionText(daily.weather_code[i]);
          const maxTemp = Math.round(daily.temperature_2m_max[i]);
          const minTemp = Math.round(daily.temperature_2m_min[i]);
          summary += `\n${date}: ${condition}, High ${maxTemp}°C, Low ${minTemp}°C`;
        }
        return { content: summary, success: true };
      }

      return { content: "", success: false, error: `Unknown tool: ${name}` };
    } catch (err: any) {
      return { content: "", success: false, error: err.message || String(err) };
    }
  },
  shouldSearch: (query: string) => {
    const trimmed = query.trim().toLowerCase();
    return (
      trimmed.startsWith("/wt") ||
      trimmed.startsWith("weather:") ||
      trimmed === "weather" ||
      trimmed === "forecast"
    );
  },
  searchDebounceMs: 500,
  getItems: async (query: string): Promise<SearchResultItem[]> => {
    const trimmed = query.trim();
    const lower = trimmed.toLowerCase();

    // Bare keyword: show "Open Weather" action
    if (lower === "weather" || lower === "forecast") {
      const saved = getSavedLocation();
      return [
        {
          id: "weather-open",
          pluginId: "weather",
          title: "Open Weather",
          subtitle: saved ? `Weather in ${saved.name}` : "View weather forecast",
          icon: CloudSun,
          score: 200,
          onSelect: () => {},
          renderPreview: () => {
            if (saved) {
              return <WeatherPreview location={saved} />;
            }
            return <NoLocationPrompt />;
          },
        },
      ];
    }

    // Parse location from prefix
    let locationQuery = "";
    if (lower.startsWith("/wt")) {
      locationQuery = trimmed.slice(3).trim();
    } else if (lower.startsWith("weather:")) {
      locationQuery = trimmed.slice(8).trim();
    }

    // No location provided — show saved location or prompt
    if (!locationQuery) {
      const saved = getSavedLocation();
      if (saved) {
        return [
          {
            id: "weather-saved",
            pluginId: "weather",
            title: `Weather in ${saved.name}`,
            subtitle: [saved.admin1, saved.country].filter(Boolean).join(", ") || undefined,
            icon: CloudSun,
            score: 200,
            onSelect: () => {},
            renderPreview: () => <WeatherPreview location={saved} />,
          },
        ];
      }

      return [
        {
          id: "weather-set-location",
          pluginId: "weather",
          title: "Set your weather location",
          subtitle: "Type a city name after /wt",
          icon: MapPin,
          score: 200,
          onSelect: () => {},
        },
      ];
    }

    // Geocoding search
    try {
      const results = await searchLocations(locationQuery);

      if (results.length === 0) {
        return [
          {
            id: "weather-no-results",
            pluginId: "weather",
            title: "No locations found",
            subtitle: `No results for "${locationQuery}"`,
            icon: MapPin,
            score: 200,
            onSelect: () => {},
          },
        ];
      }

      return results.map((loc, idx) => {
        return {
          id: `weather-loc-${loc.name}-${loc.latitude}-${loc.longitude}-${idx}`,
          pluginId: "weather",
          title: loc.name,
          subtitle: [loc.admin1, loc.country].filter(Boolean).join(", ") || undefined,
          icon: MapPin,
          score: 200,
          onSelect: () => {
            saveLocation(loc);
            window.dispatchEvent(new CustomEvent("gquick-weather-saved", { detail: loc.name }));
          },
          renderPreview: () => <WeatherPreview location={loc} />,
        };
      });
    } catch (err) {
      return [
        {
          id: "weather-error",
          pluginId: "weather",
          title: "Error searching locations",
          subtitle: err instanceof Error ? err.message : "Please try again",
          icon: MapPin,
          score: 200,
          onSelect: () => {},
        },
      ];
    }
  },
};
