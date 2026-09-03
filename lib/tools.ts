import type { Tool, ToolResult } from "@/types";
import { evaluateExpression, ExpressionError } from "./math";
import { optionalEnv } from "./server/env";

/**
 * Tool registry — every tool either hits a real API or fails gracefully.
 *
 * - web_search  → Tavily (requires TAVILY_API_KEY; falls back to an error
 *                 result when the key is missing so agents never see fake data)
 * - weather     → Open-Meteo (free, no API key)
 * - http_fetch  → arbitrary HTTP(S) GET with SSRF protection and size caps
 * - calculator  → safe local expression parser
 * - summarizer  → deterministic local text summarization
 */

const HTTP_TIMEOUT_MS = 8_000;
const HTTP_MAX_BYTES = 512_000;
const HTTP_MAX_REDIRECTS = 3;
const TAVILY_URL = "https://api.tavily.com/search";

// ---------------------------------------------------------------------------
// web_search — Tavily
// ---------------------------------------------------------------------------

interface TavilyResponse {
  answer?: string;
  results: { title: string; url: string; content: string }[];
}

export async function searchWeb(query: string): Promise<ToolResult> {
  const startTime = Date.now();
  const apiKey = optionalEnv("TAVILY_API_KEY");

  if (!apiKey) {
    return {
      success: false,
      output: null,
      error: "Web search unavailable: TAVILY_API_KEY is not configured",
      latency_ms: Date.now() - startTime,
    };
  }

  try {
    const response = await fetch(TAVILY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: "basic",
        include_answer: true,
        max_results: 5,
      }),
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    });

    if (!response.ok) {
      return {
        success: false,
        output: null,
        error: `Web search failed (HTTP ${response.status})`,
        latency_ms: Date.now() - startTime,
      };
    }

    const data = (await response.json()) as TavilyResponse;
    return {
      success: true,
      output: {
        answer: data.answer ?? null,
        results: data.results.map((r) => ({
          title: r.title,
          url: r.url,
          snippet: r.content,
        })),
      },
      latency_ms: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      output: null,
      error: `Web search failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      latency_ms: Date.now() - startTime,
    };
  }
}

export const webSearch: Tool = {
  name: "web_search",
  description: "Search the web for up-to-date information about a topic",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "The search query",
      },
    },
    required: ["query"],
  },
  execute: async (params: Record<string, unknown>): Promise<ToolResult> => {
    const query = String(params.query ?? "");
    if (!query.trim()) {
      return { success: false, output: null, error: "query is required", latency_ms: 0 };
    }
    return searchWeb(query);
  },
};

// ---------------------------------------------------------------------------
// weather — Open-Meteo (no API key required)
// ---------------------------------------------------------------------------

const WMO_CODES: Record<number, string> = {
  0: "Clear sky",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Depositing rime fog",
  51: "Light drizzle",
  53: "Moderate drizzle",
  55: "Dense drizzle",
  61: "Slight rain",
  63: "Moderate rain",
  65: "Heavy rain",
  71: "Slight snow fall",
  73: "Moderate snow fall",
  75: "Heavy snow fall",
  77: "Snow grains",
  80: "Slight rain showers",
  81: "Moderate rain showers",
  82: "Violent rain showers",
  85: "Slight snow showers",
  86: "Heavy snow showers",
  95: "Thunderstorm",
  96: "Thunderstorm with slight hail",
  99: "Thunderstorm with heavy hail",
};

interface GeocodeResponse {
  results?: { latitude: number; longitude: number; name: string; country?: string }[];
}

interface ForecastResponse {
  current?: {
    temperature_2m: number;
    relative_humidity_2m: number;
    weather_code: number;
    wind_speed_10m: number;
  };
}

export async function getWeather(location: string): Promise<ToolResult> {
  const startTime = Date.now();

  try {
    // 1. Geocode the location name → coordinates
    const geoResponse = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1&language=en&format=json`,
      { signal: AbortSignal.timeout(HTTP_TIMEOUT_MS) }
    );
    if (!geoResponse.ok) {
      return {
        success: false,
        output: null,
        error: `Geocoding failed (HTTP ${geoResponse.status})`,
        latency_ms: Date.now() - startTime,
      };
    }
    const geo = (await geoResponse.json()) as GeocodeResponse;
    const place = geo.results?.[0];
    if (!place) {
      return {
        success: false,
        output: null,
        error: `Location not found: ${location}`,
        latency_ms: Date.now() - startTime,
      };
    }

    // 2. Fetch current conditions for the coordinates
    const forecastResponse = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}` +
        "&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&timezone=auto",
      { signal: AbortSignal.timeout(HTTP_TIMEOUT_MS) }
    );
    if (!forecastResponse.ok) {
      return {
        success: false,
        output: null,
        error: `Forecast failed (HTTP ${forecastResponse.status})`,
        latency_ms: Date.now() - startTime,
      };
    }
    const forecast = (await forecastResponse.json()) as ForecastResponse;
    const current = forecast.current;
    if (!current) {
      return {
        success: false,
        output: null,
        error: "Forecast returned no current data",
        latency_ms: Date.now() - startTime,
      };
    }

    return {
      success: true,
      output: {
        location: place.name,
        country: place.country ?? null,
        condition: WMO_CODES[current.weather_code] ?? `Code ${current.weather_code}`,
        temperatureC: current.temperature_2m,
        humidityPercent: current.relative_humidity_2m,
        windSpeedKmh: current.wind_speed_10m,
      },
      latency_ms: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      output: null,
      error: `Weather lookup failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      latency_ms: Date.now() - startTime,
    };
  }
}

export const weather: Tool = {
  name: "weather",
  description: "Get current weather conditions for a city or location",
  parameters: {
    type: "object",
    properties: {
      location: {
        type: "string",
        description: "The city or location name",
      },
    },
    required: ["location"],
  },
  execute: async (params: Record<string, unknown>): Promise<ToolResult> => {
    const location = String(params.location ?? "").trim();
    if (!location) {
      return { success: false, output: null, error: "location is required", latency_ms: 0 };
    }
    return getWeather(location);
  },
};

// ---------------------------------------------------------------------------
// http_fetch — SSRF-safe HTTP GET
// ---------------------------------------------------------------------------

const PRIVATE_IP_RE =
  /^(10\.|127\.|0\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|::1$|fc|fd|fe8)/;

function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (PRIVATE_IP_RE.test(host)) return true;
  return false;
}

async function resolveAndCheck(hostname: string): Promise<string | null> {
  try {
    const { lookup } = await import("node:dns/promises");
    const addresses = await lookup(hostname, { all: true });
    for (const entry of addresses) {
      if (isPrivateHost(entry.address)) {
        return entry.address;
      }
    }
    return null;
  } catch {
    return null;
  }
}

async function fetchWithRedirects(
  url: URL,
  redirectsLeft: number,
  seen: Set<string>
): Promise<Response> {
  const response = await fetch(url, {
    redirect: "manual",
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    headers: { "User-Agent": "AgentBoard/1.0" },
  });

  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get("location");
    if (!location || redirectsLeft <= 0) return response;
    const nextUrl = new URL(location, url);
    const nextHost = nextUrl.hostname.toLowerCase();
    if (seen.has(nextUrl.href)) return response; // redirect loop
    seen.add(nextUrl.href);
    const blocked = isPrivateHost(nextHost) || (await resolveAndCheck(nextHost)) !== null;
    if (blocked) {
      throw new Error(`Redirect to blocked host: ${nextHost}`);
    }
    if (nextUrl.protocol !== "http:" && nextUrl.protocol !== "https:") {
      throw new Error(`Redirect to unsupported protocol: ${nextUrl.protocol}`);
    }
    return fetchWithRedirects(nextUrl, redirectsLeft - 1, seen);
  }

  return response;
}

export async function fetchUrl(rawUrl: string): Promise<ToolResult> {
  const startTime = Date.now();

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return {
      success: false,
      output: null,
      error: `Invalid URL: ${rawUrl}`,
      latency_ms: Date.now() - startTime,
    };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return {
      success: false,
      output: null,
      error: `Unsupported protocol: ${url.protocol} (only http/https allowed)`,
      latency_ms: Date.now() - startTime,
    };
  }

  const host = url.hostname.toLowerCase();
  if (isPrivateHost(host)) {
    return {
      success: false,
      output: null,
      error: `Blocked host: ${host} (private/loopback addresses are not allowed)`,
      latency_ms: Date.now() - startTime,
    };
  }
  const resolvedPrivate = await resolveAndCheck(host);
  if (resolvedPrivate) {
    return {
      success: false,
      output: null,
      error: `Blocked host: ${host} resolves to private address ${resolvedPrivate}`,
      latency_ms: Date.now() - startTime,
    };
  }

  try {
    const seen = new Set<string>([url.href]);
    const response = await fetchWithRedirects(url, HTTP_MAX_REDIRECTS, seen);
    if (!response.ok) {
      return {
        success: false,
        output: null,
        error: `Request failed (HTTP ${response.status})`,
        latency_ms: Date.now() - startTime,
      };
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text") && !contentType.includes("json") && !contentType.includes("xml")) {
      return {
        success: false,
        output: null,
        error: `Unsupported content type: ${contentType}`,
        latency_ms: Date.now() - startTime,
      };
    }

    const text = await response.text();
    const truncated = text.length > HTTP_MAX_BYTES;
    const body = truncated ? text.slice(0, HTTP_MAX_BYTES) : text;

    return {
      success: true,
      output: {
        url: url.href,
        status: response.status,
        contentType,
        truncated,
        body,
      },
      latency_ms: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      output: null,
      error: `Fetch failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      latency_ms: Date.now() - startTime,
    };
  }
}

export const httpFetch: Tool = {
  name: "http_fetch",
  description:
    "Fetch a web page or JSON API over HTTP(S). Private/loopback addresses are blocked. Response bodies are capped at 512KB.",
  parameters: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description: "The http(s) URL to fetch",
      },
    },
    required: ["url"],
  },
  execute: async (params: Record<string, unknown>): Promise<ToolResult> => {
    const url = String(params.url ?? "").trim();
    if (!url) {
      return { success: false, output: null, error: "url is required", latency_ms: 0 };
    }
    return fetchUrl(url);
  },
};

// ---------------------------------------------------------------------------
// calculator — safe local evaluation
// ---------------------------------------------------------------------------

export const calculator: Tool = {
  name: "calculator",
  description: "Perform mathematical calculations",
  parameters: {
    type: "object",
    properties: {
      expression: {
        type: "string",
        description: "A mathematical expression to evaluate (e.g., '2 + 2' or '10 * 5')",
      },
    },
    required: ["expression"],
  },
  execute: async (params: Record<string, unknown>): Promise<ToolResult> => {
    const startTime = Date.now();
    const expression = String(params.expression ?? "");

    try {
      const result = evaluateExpression(expression);
      return {
        success: true,
        output: { expression, result },
        latency_ms: Date.now() - startTime,
      };
    } catch (error) {
      const detail = error instanceof ExpressionError ? error.message : "Unknown error";
      return {
        success: false,
        output: null,
        error: `Invalid expression: ${expression} (${detail})`,
        latency_ms: Date.now() - startTime,
      };
    }
  },
};

// ---------------------------------------------------------------------------
// summarizer — deterministic local heuristic
// ---------------------------------------------------------------------------

export const summarizer: Tool = {
  name: "summarizer",
  description: "Summarize a long text into key points",
  parameters: {
    type: "object",
    properties: {
      text: {
        type: "string",
        description: "The text to summarize",
      },
      maxLength: {
        type: "number",
        description: "Maximum length of the summary in words",
        default: 50,
      },
    },
    required: ["text"],
  },
  execute: async (params: Record<string, unknown>): Promise<ToolResult> => {
    const startTime = Date.now();
    const text = String(params.text ?? "");
    const maxLength = Number(params.maxLength) || 50;

    const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
    const summary = sentences
      .slice(0, 3)
      .join(". ")
      .trim()
      .substring(0, maxLength * 10);

    return {
      success: true,
      output: {
        summary,
        originalLength: text.split(/\s+/).filter(Boolean).length,
        summaryLength: summary.split(/\s+/).filter(Boolean).length,
      },
      latency_ms: Date.now() - startTime,
    };
  },
};

// Tool registry
export const tools: Tool[] = [webSearch, calculator, summarizer, weather, httpFetch];

export function getToolByName(name: string): Tool | undefined {
  return tools.find((t) => t.name === name);
}