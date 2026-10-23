import { describe, expect, it, vi } from "vitest";
import { titleSize } from "./_openBookCard";
import { imageHosts, remoteImageUri } from "./_openBookCardRender";

describe("remoteImageUri", () => {
  const ours = ["cdn.example"];
  it("never fetches from a host that is not ours, or over plain http", async () => {
    const fetchImpl = vi.fn();
    for (const url of ["http://cdn.example/a.png", "https://127.0.0.1/a.png", "https://localhost./a.png", "https://evil.example/a.png", "https://127.0.0.1.nip.io/a.png", "not a url", null]) {
      expect(await remoteImageUri(url, fetchImpl as never, ours)).toBeNull();
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it("returns null for a non-image answer, an oversize one or a failed fetch", async () => {
    expect(await remoteImageUri("https://cdn.example/a", (async () => new Response("<html>", { headers: { "content-type": "text/html" } })) as never, ours)).toBeNull();
    expect(await remoteImageUri("https://cdn.example/a", (async () => new Response("x", { headers: { "content-type": "image/png", "content-length": "99999999" } })) as never, ours)).toBeNull();
    expect(await remoteImageUri("https://cdn.example/a", (async () => { throw new Error("down"); }) as never, ours)).toBeNull();
  });
});

describe("imageHosts", () => {
  it("allows the asset CDN and the Supabase origin, https only", () => {
    expect(imageHosts({ ASSET_CDN_URL: "https://CDN.example.com", SUPABASE_URL: "https://abc.supabase.co" })).toEqual(["cdn.example.com", "abc.supabase.co"]);
    expect(imageHosts({ VITE_SUPABASE_URL: "http://127.0.0.1:54321" })).toEqual([]);
    expect(imageHosts({})).toEqual([]);
  });
});

describe("titleSize", () => {
  it("shrinks long titles", () => {
    expect(titleSize("The Saltreach")).toBeGreaterThan(titleSize("The Long Winter of the Ashen Marches"));
  });
});
