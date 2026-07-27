import { describe, it, expect, vi, beforeEach } from "vitest";

const invoke = vi.fn();

vi.mock("@/lib/supabase", () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invoke(...args) } },
}));

const { freesoundProvider } = await import("./freesound");

function apiHit(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 42,
    name: "Thunder",
    username: "stormchaser",
    license: "cc-by",
    preview_url: "https://freesound.org/data/previews/42/42_x-hq.mp3",
    duration: 3.5,
    tags: ["thunder", "storm"],
    page_url: "https://freesound.org/s/42/",
    attribution: '"Thunder" by stormchaser on Freesound (CC-BY)',
    attribution_url: "https://freesound.org/s/42/",
    ...over,
  };
}

beforeEach(() => {
  invoke.mockReset();
});

describe("freesound adapter", () => {
  it("normalises a hit onto the provider-agnostic shape", async () => {
    invoke.mockResolvedValue({
      data: { count: 1, results: [apiHit()], page: 1, page_size: 48, has_next: false },
      error: null,
    });

    const result = await freesoundProvider.search({ query: "thunder", page: 1 });
    const [hit] = result.hits;

    expect(hit.providerId).toBe("freesound");
    expect(hit.id).toBe("42"); // string, so ids stay unique across providers
    expect(hit.author).toBe("stormchaser");
    expect(hit.license).toBe("attribution");
    expect(hit.pageUrl).toBe("https://freesound.org/s/42/");
    expect(result.total).toBe(1);
    expect(result.hasNext).toBe(false);
  });

  it("maps CC0 onto public-domain, which needs no credit", async () => {
    invoke.mockResolvedValue({
      data: {
        count: 1,
        results: [apiHit({ license: "cc0", attribution: null, attribution_url: null })],
        page: 1,
        page_size: 48,
        has_next: false,
      },
      error: null,
    });

    const { hits } = await freesoundProvider.search({ query: "thunder", page: 1 });
    expect(hits[0].license).toBe("public-domain");
    expect(hits[0].attribution).toBeNull();
  });

  it("rewrites preview URLs to the CDN host, saving a redirect per play", async () => {
    invoke.mockResolvedValue({
      data: { count: 1, results: [apiHit()], page: 1, page_size: 48, has_next: false },
      error: null,
    });

    const { hits } = await freesoundProvider.search({ query: "thunder", page: 1 });
    expect(hits[0].audioUrl).toBe("https://cdn.freesound.org/previews/42/42_x-hq.mp3");
  });

  it("surfaces transport errors rather than returning an empty result set", async () => {
    invoke.mockResolvedValue({ data: null, error: new Error("network down") });
    await expect(freesoundProvider.search({ query: "x", page: 1 })).rejects.toThrow();
  });

  it("treats an empty body as an error, not as zero results", async () => {
    // Silently showing "no results" for a broken endpoint would send a DM
    // hunting for a better search term when the service is simply down.
    invoke.mockResolvedValue({ data: null, error: null });
    await expect(freesoundProvider.search({ query: "x", page: 1 })).rejects.toThrow();
  });

  it("declares the metadata the browser UI relies on", async () => {
    expect(freesoundProvider.id).toBe("freesound");
    expect(freesoundProvider.label.length).toBeGreaterThan(0);
    expect(freesoundProvider.minQueryLength).toBeGreaterThan(0);
    expect(freesoundProvider.attributionNote.length).toBeGreaterThan(0);
  });
});
