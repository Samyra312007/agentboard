import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getToolByName, fetchUrl, searchWeb, getWeather } from "../tools";

// Stub DNS lookups so HTTP-fetch tests never hit the real network.
vi.mock("node:dns/promises", () => ({
  lookup: vi.fn(async () => [{ address: "93.184.216.34", family: 4 }]),
}));

function jsonResponse(body: unknown, status = 200, contentType = "application/json") {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": contentType },
  });
}

describe("calculator tool", () => {
  it("evaluates expressions safely", async () => {
    const tool = getToolByName("calculator");
    expect(tool).toBeDefined();
    const result = await tool!.execute({ expression: "6 * 7" });
    expect(result.success).toBe(true);
    expect(result.output).toEqual({ expression: "6 * 7", result: 42 });
  });

  it("fails gracefully on invalid input", async () => {
    const tool = getToolByName("calculator");
    const result = await tool!.execute({ expression: "process.exit()" });
    expect(result.success).toBe(false);
    expect(result.error).toContain("Invalid expression");
  });
});

describe("summarizer tool", () => {
  it("summarizes long text", async () => {
    const tool = getToolByName("summarizer");
    const text = "First sentence about agents. Second sentence about traces. Third sentence about costs.";
    const result = await tool!.execute({ text });
    expect(result.success).toBe(true);
    expect(String((result.output as { summary: string }).summary)).toContain("First sentence");
  });
});

describe("web search", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("fails gracefully when no API key is configured", async () => {
    vi.stubEnv("TAVILY_API_KEY", "");
    const result = await searchWeb("test query");
    expect(result.success).toBe(false);
    expect(result.error).toContain("TAVILY_API_KEY");
  });

  it("returns results from Tavily when a key is present", async () => {
    vi.stubEnv("TAVILY_API_KEY", "tvly-test");
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({
        answer: "An answer",
        results: [{ title: "Title", url: "https://example.com", content: "Snippet" }],
      })
    );

    const result = await searchWeb("AI agents");
    expect(result.success).toBe(true);
    expect(result.output).toMatchObject({
      answer: "An answer",
      results: [{ title: "Title", url: "https://example.com", snippet: "Snippet" }],
    });
  });

  it("returns a failure result when Tavily errors", async () => {
    vi.stubEnv("TAVILY_API_KEY", "tvly-test");
    vi.mocked(fetch).mockResolvedValue(new Response("nope", { status: 500 }));
    const result = await searchWeb("AI agents");
    expect(result.success).toBe(false);
    expect(result.error).toContain("HTTP 500");
  });
});

describe("weather tool", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resolves a location and returns current conditions", async () => {
    const fetchMock = vi.fn((input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("geocoding-api.open-meteo.com")) {
        return Promise.resolve(
          jsonResponse({ results: [{ latitude: 52.52, longitude: 13.41, name: "Berlin", country: "Germany" }] })
        );
      }
      return Promise.resolve(
        jsonResponse({
          current: {
            temperature_2m: 18.2,
            relative_humidity_2m: 65,
            weather_code: 2,
            wind_speed_10m: 11.3,
          },
        })
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await getWeather("Berlin");
    expect(result.success).toBe(true);
    expect(result.output).toMatchObject({
      location: "Berlin",
      condition: "Partly cloudy",
      temperatureC: 18.2,
    });
  });

  it("fails gracefully for unknown locations", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ results: [] }))
    );
    const result = await getWeather("Atlantis");
    expect(result.success).toBe(false);
    expect(result.error).toContain("Location not found");
  });
});

describe("http_fetch tool", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects non-http protocols", async () => {
    const result = await fetchUrl("file:///etc/passwd");
    expect(result.success).toBe(false);
    expect(result.error).toContain("Unsupported protocol");
  });

  it("rejects private and loopback hosts", async () => {
    for (const url of ["http://127.0.0.1:3000/admin", "http://localhost/api", "http://192.168.1.1/x"]) {
      const result = await fetchUrl(url);
      expect(result.success).toBe(false);
      expect(result.error).toContain("Blocked host");
    }
  });

  it("rejects invalid URLs", async () => {
    const result = await fetchUrl("not a url");
    expect(result.success).toBe(false);
    expect(result.error).toContain("Invalid URL");
  });

  it("fetches text content and truncates oversized bodies", async () => {
    const body = "x".repeat(600_000);
    vi.mocked(fetch).mockResolvedValue(
      new Response(body, { headers: { "Content-Type": "text/plain" } })
    );
    const result = await fetchUrl("https://example.com/page");
    expect(result.success).toBe(true);
    expect((result.output as { truncated: boolean }).truncated).toBe(true);
    expect((result.output as { body: string }).body.length).toBe(512_000);
  });

  it("follows redirects but caps the count", async () => {
    vi.mocked(fetch).mockImplementation((input) => {
      const url = String(input);
      const hop = Number(new URL(url).searchParams.get("hop") ?? "0");
      if (hop < 5) {
        return Promise.resolve(
          new Response(null, { status: 302, headers: { Location: `https://example.com/?hop=${hop + 1}` } })
        );
      }
      return Promise.resolve(new Response("done", { headers: { "Content-Type": "text/plain" } }));
    });
    const result = await fetchUrl("https://example.com/?hop=0");
    expect(result.success).toBe(false); // redirect cap exceeded → non-2xx returned
  });
});