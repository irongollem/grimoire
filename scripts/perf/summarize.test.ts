import { describe, expect, it } from "vitest";
import { classifyRequest, describeRequest, isBackgroundRequest, type RawRequest, summarizeRequests, totalBlockingTime } from "./summarize";

const API = "http://127.0.0.1:54321";

function req(overrides: Partial<RawRequest> & Pick<RawRequest, "url">): RawRequest {
  return { method: "GET", resourceType: "Fetch", startMs: 0, endMs: 100, encodedBytes: 0, ...overrides };
}

describe("classifyRequest", () => {
  it("keeps the CORS preflight apart from the real request", () => {
    expect(classifyRequest({ url: `${API}/rest/v1/npcs`, method: "OPTIONS", resourceType: "Preflight" }, API)).toBe("preflight");
    expect(classifyRequest({ url: `${API}/rest/v1/npcs`, method: "OPTIONS", resourceType: "Fetch" }, API)).toBe("preflight");
    expect(classifyRequest({ url: `${API}/rest/v1/npcs`, method: "GET", resourceType: "Fetch" }, API)).toBe("api");
  });

  it("does not mistake a look-alike origin for the API", () => {
    expect(classifyRequest({ url: "http://127.0.0.2:54321/x", method: "GET", resourceType: "Fetch" }, API)).toBe("other");
  });

  it("does not take a longer port on the same host for the API", () => {
    expect(classifyRequest({ url: "http://127.0.0.1:54321/x", method: "GET", resourceType: "Fetch" }, "http://127.0.0.1:5432")).toBe("other");
  });

  it("falls back to the resource type for an asset whose url has no extension", () => {
    expect(classifyRequest({ url: "http://127.0.0.1:4173/assets/chunk", method: "GET", resourceType: "Script" }, API)).toBe("js");
    expect(classifyRequest({ url: "http://127.0.0.1:4173/assets/theme", method: "GET", resourceType: "Stylesheet" }, API)).toBe("css");
  });

  it("classifies static assets by extension, modulepreload included", () => {
    expect(classifyRequest({ url: "http://127.0.0.1:4173/assets/a-1.js", method: "GET", resourceType: "Other" }, API)).toBe("js");
    expect(classifyRequest({ url: "http://127.0.0.1:4173/assets/a-1.css", method: "GET", resourceType: "Stylesheet" }, API)).toBe("css");
    expect(classifyRequest({ url: "http://127.0.0.1:4173/", method: "GET", resourceType: "Document" }, API)).toBe("other");
  });

  it("ignores data and blob urls", () => {
    expect(classifyRequest({ url: "data:image/png;base64,AA", method: "GET", resourceType: "Image" }, API)).toBe("ignored");
  });
});

describe("describeRequest", () => {
  it("keeps method, path and query only", () => {
    expect(describeRequest({ url: `${API}/rest/v1/quests?select=id&limit=5`, method: "GET" })).toBe("GET /rest/v1/quests?select=id&limit=5");
  });
});

describe("background requests", () => {
  // A chain of two foreground reads, then whatever starts after the second is answered.
  const chainThen = (url: string, method = "GET") =>
    summarizeRequests(
      [
        req({ url: `${API}/rest/v1/profiles`, startMs: 0, endMs: 100 }),
        req({ url: `${API}/rest/v1/campaigns`, startMs: 100, endMs: 200 }),
        req({ url, method, startMs: 200, endMs: 300 }),
      ],
      API,
      0,
      1000,
    );

  it("does not let a request the app defers until idle deepen the serial depth", () => {
    const summary = chainThen(`${API}/rest/v1/app_settings?select=value&key=eq.placeholder_focal_points`);
    expect(summary.serialDepth).toBe(2);
    // It is still a request: counted, and shown at its link in the chain.
    expect(summary.apiRequests).toBe(3);
    expect(summary.apiWaves).toEqual([1, 2, 3]);
  });

  it("leaves out the background indexing audit", () => {
    expect(chainThen(`${API}/functions/v1/embed-content`, "POST").serialDepth).toBe(2);
    expect(chainThen(`${API}/functions/v1/embed-monsters`, "POST").serialDepth).toBe(2);
  });

  it("still counts a read of the same table that nothing defers", () => {
    expect(chainThen(`${API}/rest/v1/app_settings?select=value&key=eq.maintenance`).serialDepth).toBe(3);
    expect(chainThen(`${API}/rest/v1/notes?select=id`).serialDepth).toBe(3);
  });

  it("matches the method and the whole query parameter, not a prefix of either", () => {
    expect(isBackgroundRequest({ url: `${API}/functions/v1/embed-content`, method: "GET" })).toBe(false);
    expect(isBackgroundRequest({ url: `${API}/rest/v1/app_settings?key=eq.placeholder_focal_points_v2`, method: "GET" })).toBe(false);
  });
});

describe("summarizeRequests", () => {
  it("counts API and static separately and drops preflights from every total", () => {
    const summary = summarizeRequests(
      [
        req({ url: `${API}/rest/v1/a`, startMs: 0, endMs: 200, encodedBytes: 500 }),
        req({ url: `${API}/rest/v1/a`, method: "OPTIONS", resourceType: "Preflight", startMs: 0, endMs: 20 }),
        req({ url: `${API}/rest/v1/b`, startMs: 200, endMs: 400, encodedBytes: 300 }),
        req({ url: "http://127.0.0.1:4173/assets/x.js", resourceType: "Script", startMs: 0, endMs: 50, encodedBytes: 1000 }),
        req({ url: "http://127.0.0.1:4173/assets/x.css", resourceType: "Stylesheet", startMs: 0, endMs: 50, encodedBytes: 200 }),
      ],
      API,
      0,
      1000,
    );
    expect(summary).toMatchObject({
      apiRequests: 2,
      optionsRequests: 1,
      apiBytes: 800,
      jsBytes: 1000,
      cssBytes: 200,
      totalRequests: 4,
      serialDepth: 2,
    });
    expect(summary.apiPaths).toEqual(["GET /rest/v1/a", "GET /rest/v1/b"]);
  });

  it("lists API paths in the order they started, whatever order the recorder delivered them", () => {
    const summary = summarizeRequests(
      [req({ url: `${API}/rest/v1/late`, startMs: 300, endMs: 400 }), req({ url: `${API}/rest/v1/early`, startMs: 0, endMs: 100 })],
      API,
      0,
      1000,
    );
    expect(summary.apiPaths).toEqual(["GET /rest/v1/early", "GET /rest/v1/late"]);
  });

  it("names every non-API request totalRequests counted, so a chunk regression has a culprit (#1138)", () => {
    const summary = summarizeRequests(
      [
        req({ url: `${API}/rest/v1/a`, startMs: 0, endMs: 100 }),
        req({ url: `${API}/rest/v1/a`, method: "OPTIONS", resourceType: "Preflight", startMs: 0, endMs: 10 }),
        req({ url: "http://127.0.0.1:4173/assets/viz-Df6KLSBk.js?v=1", resourceType: "Script", startMs: 20, endMs: 60 }),
        req({ url: "http://127.0.0.1:4173/assets/x.css", resourceType: "Stylesheet", startMs: 10, endMs: 50 }),
      ],
      API,
      0,
      1000,
    );
    expect(summary.assetPaths).toEqual(["/assets/x.css", "/assets/viz-Df6KLSBk.js"]);
    expect(summary.totalRequests).toBe(summary.apiPaths.length + summary.assetPaths.length);
  });

  it("counts only chunks and stylesheets as code, so a font or image painted by chance moves no gated count (#1146)", () => {
    const summary = summarizeRequests(
      [
        req({ url: "http://127.0.0.1:4173/assets/a-1.js", resourceType: "Script" }),
        req({ url: "http://127.0.0.1:4173/assets/a-1.css", resourceType: "Stylesheet" }),
        req({ url: "http://127.0.0.1:4173/assets/crimson-pro-latin-400-normal-x.woff2", resourceType: "Font" }),
        req({ url: "http://127.0.0.1:4173/brand/bookmark-cloth.webp", resourceType: "Image" }),
        req({ url: "http://127.0.0.1:4173/dashboard", resourceType: "Document" }),
        req({ url: `${API}/rest/v1/a` }),
      ],
      API,
      0,
      1000,
    );
    expect(summary.codeRequests).toBe(2);
    expect(summary.totalRequests).toBe(6);
  });

  it("treats a request still open at the end as finishing then", () => {
    const summary = summarizeRequests([req({ url: `${API}/rest/v1/a`, startMs: 0, endMs: null })], API, 0, 900);
    expect(summary.settledMs).toBe(900);
  });
});

describe("totalBlockingTime", () => {
  it("sums only the excess over 50 ms of tasks after first paint", () => {
    expect(
      totalBlockingTime(
        [
          { startMs: 100, durationMs: 400 },
          { startMs: 600, durationMs: 90 },
          { startMs: 700, durationMs: 40 },
        ],
        500,
      ),
    ).toBe(40);
  });
  it("counts a task that began exactly at first paint", () => {
    expect(totalBlockingTime([{ startMs: 500, durationMs: 120 }], 500)).toBe(70);
  });
  it("is null when there was no first paint to measure from", () => {
    expect(totalBlockingTime([{ startMs: 0, durationMs: 400 }], null)).toBeNull();
  });
});
