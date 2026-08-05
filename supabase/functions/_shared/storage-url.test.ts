import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { isSafeStorageUrl } from "./storage-url.ts";

// storage-url.ts touches `Deno.env` inside its functions rather than at import
// time, so a stub of just that surface is enough to exercise it under Node —
// no Deno runtime needed (cf. mesh3d.test.ts, which notes the missing global).
type DenoEnvStub = { env: { get(key: string): string | undefined } };
const g = globalThis as typeof globalThis & { Deno?: DenoEnvStub };

let env: Record<string, string | undefined> = {};

beforeEach(() => {
  env = { SUPABASE_URL: "https://ref.supabase.co" };
  g.Deno = { env: { get: (key: string) => env[key] } };
});

afterEach(() => {
  delete g.Deno;
});

const ORIGIN_URL = "https://ref.supabase.co/storage/v1/object/public/npc-portraits/u1/a.webp";
const CDN_URL = "https://cdn.example.com/npc-portraits/u1/a.webp";

describe("isSafeStorageUrl — Supabase origin", () => {
  it("accepts a public storage URL on the project origin", () => {
    expect(isSafeStorageUrl(ORIGIN_URL)).toBe(true);
  });

  it("rejects a non-storage path on the project origin", () => {
    expect(isSafeStorageUrl("https://ref.supabase.co/rest/v1/users")).toBe(false);
  });

  it("rejects http, foreign hosts and junk", () => {
    expect(isSafeStorageUrl(ORIGIN_URL.replace("https:", "http:"))).toBe(false);
    expect(isSafeStorageUrl("https://evil.example.com/storage/v1/object/public/x/y.webp")).toBe(false);
    expect(isSafeStorageUrl("not a url")).toBe(false);
  });

  it("rejects when SUPABASE_URL is absent", () => {
    env = {};
    expect(isSafeStorageUrl(ORIGIN_URL)).toBe(false);
  });
});

describe("isSafeStorageUrl — asset CDN (#577)", () => {
  it("rejects the CDN host while ASSET_CDN_URL is unset", () => {
    // Stage 1 is opt-in: no env var, no widened guard.
    expect(isSafeStorageUrl(CDN_URL)).toBe(false);
  });

  it("accepts the CDN host once ASSET_CDN_URL is set", () => {
    // Without this the guard would reject every CDN URL the client now writes,
    // and the AI generators that re-fetch a reference image would start failing.
    env.ASSET_CDN_URL = "https://cdn.example.com";
    expect(isSafeStorageUrl(CDN_URL)).toBe(true);
  });

  it("keeps accepting origin URLs after the CDN is configured", () => {
    // Both shapes coexist indefinitely — old rows, Edge-written rows, new rows.
    env.ASSET_CDN_URL = "https://cdn.example.com";
    expect(isSafeStorageUrl(ORIGIN_URL)).toBe(true);
  });

  it("does not accept a different host just because a CDN is configured", () => {
    env.ASSET_CDN_URL = "https://cdn.example.com";
    expect(isSafeStorageUrl("https://evil.example.com/npc-portraits/u1/a.webp")).toBe(false);
    // Suffix confusion must not pass an origin comparison.
    expect(isSafeStorageUrl("https://cdn.example.com.evil.test/npc-portraits/a.webp")).toBe(false);
  });

  it("ignores a malformed or non-https ASSET_CDN_URL rather than widening", () => {
    env.ASSET_CDN_URL = "not a url";
    expect(isSafeStorageUrl(CDN_URL)).toBe(false);
    env.ASSET_CDN_URL = "http://cdn.example.com";
    expect(isSafeStorageUrl("http://cdn.example.com/npc-portraits/a.webp")).toBe(false);
  });

  it("still rejects private/loopback hosts even if pointed at by ASSET_CDN_URL", () => {
    env.ASSET_CDN_URL = "https://169.254.169.254";
    expect(isSafeStorageUrl("https://169.254.169.254/npc-portraits/a.webp")).toBe(false);
  });
});
