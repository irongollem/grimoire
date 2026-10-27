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

  it("accepts a CDN whose host name merely starts with an IPv6 private prefix", () => {
    // fc/fd/fe80 are IPv6 ranges; a DNS name such as "fdn." or "fcdn." is not one.
    for (const host of ["fdn.example.com", "fcdn.example.com", "fe80cdn.example.com"]) {
      env.ASSET_CDN_URL = `https://${host}`;
      expect(isSafeStorageUrl(`https://${host}/npc-portraits/u1/a.webp`)).toBe(true);
    }
  });

  it("still rejects private/loopback hosts even if pointed at by ASSET_CDN_URL", () => {
    env.ASSET_CDN_URL = "https://169.254.169.254";
    expect(isSafeStorageUrl("https://169.254.169.254/npc-portraits/a.webp")).toBe(false);
  });
});

describe("isSafeStorageUrl — private and loopback literals", () => {
  // The CDN origin is configurable, so a private literal configured there is
  // the only way the literal check is reachable: the guard must still refuse.
  it.each([
    "127.0.0.1",
    "10.1.2.3",
    "172.16.0.1",
    "172.31.255.1",
    "192.168.1.1",
    "169.254.169.254",
    "[::1]",
    "[fd12::1]",
    "[fe80::1]",
  ])("refuses %s even when it is the configured CDN", (host) => {
    env.ASSET_CDN_URL = `https://${host}`;
    expect(isSafeStorageUrl(`https://${host}/npc-portraits/a.webp`)).toBe(false);
  });

  it.each(["172.15.0.1", "172.32.0.1", "192.169.0.1", "11.0.0.1"])(
    "does not mistake the public neighbour %s for a private range",
    (host) => {
      env.ASSET_CDN_URL = `https://${host}`;
      expect(isSafeStorageUrl(`https://${host}/npc-portraits/a.webp`)).toBe(true);
    },
  );

  it("refuses an http URL on an http project origin: the scheme is checked on its own", () => {
    env.SUPABASE_URL = "http://ref.supabase.co";
    expect(isSafeStorageUrl("http://ref.supabase.co/storage/v1/object/public/x/y.webp")).toBe(false);
  });

  it("matches the CDN by whole origin, port included", () => {
    env.ASSET_CDN_URL = "https://cdn.example.com";
    expect(isSafeStorageUrl("https://cdn.example.com:8443/npc-portraits/a.webp")).toBe(false);
  });
});
