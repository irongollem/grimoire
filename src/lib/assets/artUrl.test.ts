import { describe, it, expect, vi, afterEach } from "vitest";

// `ASSET_CDN_BASE` (src/lib/storage/buckets.ts) is computed from
// `import.meta.env.VITE_ASSET_CDN_URL` at module load time, so — as in
// src/lib/storage/urls.test.ts — the module under test must be re-imported
// after stubbing the env var, not just re-evaluated.
describe("artUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("returns the path unchanged when the CDN base is unset", async () => {
    const { artUrl } = await import("./artUrl");
    expect(artUrl("/assets/placeholders/npc.webp")).toBe("/assets/placeholders/npc.webp");
  });

  it("returns the path unchanged when the CDN base is set but the path has no manifest entry", async () => {
    vi.stubEnv("VITE_ASSET_CDN_URL", "https://cdn.example.com");
    vi.resetModules();
    const { artUrl } = await import("./artUrl");
    expect(artUrl("/assets/nonexistent/nope.webp")).toBe("/assets/nonexistent/nope.webp");
  });

  it("returns the CDN URL, with the app-art prefix, when the base is set and the manifest knows the path", async () => {
    vi.stubEnv("VITE_ASSET_CDN_URL", "https://cdn.example.com");
    vi.resetModules();
    const { artUrl, ART_PREFIX } = await import("./artUrl");
    const manifest = (await import("@/generated/artManifest.json")).default as Record<string, string>;
    const [path, key] = Object.entries(manifest)[0];

    expect(key.startsWith(`${ART_PREFIX}/`)).toBe(true);
    expect(artUrl(path)).toBe(`https://cdn.example.com/${key}`);
  });

  it("resolves the leading-slash and no-slash forms of a path to the same URL", async () => {
    vi.stubEnv("VITE_ASSET_CDN_URL", "https://cdn.example.com");
    vi.resetModules();
    const { artUrl } = await import("./artUrl");
    const manifest = (await import("@/generated/artManifest.json")).default as Record<string, string>;
    const [path] = Object.entries(manifest)[0];
    const withoutSlash = path.replace(/^\//, "");

    expect(artUrl(withoutSlash)).toBe(artUrl(path));
  });

  it("returns a non-art path unchanged even with the CDN base set", async () => {
    vi.stubEnv("VITE_ASSET_CDN_URL", "https://cdn.example.com");
    vi.resetModules();
    const { artUrl } = await import("./artUrl");
    expect(artUrl("/api/campaigns/1")).toBe("/api/campaigns/1");
  });
});
