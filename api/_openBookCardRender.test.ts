import sharp from "sharp";
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

describe("remoteImageUri on a host that is ours", () => {
  const ours = ["cdn.example"];
  const png = () => sharp({ create: { width: 4, height: 4, channels: 3, background: "#884422" } }).png().toBuffer();
  const answer = (body: ConstructorParameters<typeof Response>[0], init: ResponseInit): typeof fetch => async () => new Response(body, init);

  it("refuses to follow a redirect, so an allowed host cannot bounce the fetch to an internal address", async () => {
    const fetchImpl = vi.fn(answer(null, { status: 200 }));
    await remoteImageUri("https://cdn.example/a.png", fetchImpl, ours);
    expect(fetchImpl.mock.calls[0][1]).toMatchObject({ redirect: "error" });
  });

  it.each(["image/png", "IMAGE/PNG; charset=binary"])("draws a real picture served as %s as a JPEG data URI", async (type) => {
    const uri = await remoteImageUri("https://cdn.example/a.png", answer(await png(), { headers: { "content-type": type } }), ours);
    expect(uri).toMatch(/^data:image\/jpeg;base64,/);
  });

  it("returns null for an error page that is served with an image type", async () => {
    expect(await remoteImageUri("https://cdn.example/a.png", answer(await png(), { status: 404, headers: { "content-type": "image/png" } }), ours)).toBeNull();
  });

  it("returns null for an empty body", async () => {
    expect(await remoteImageUri("https://cdn.example/a.png", answer(new Uint8Array(0), { headers: { "content-type": "image/png" } }), ours)).toBeNull();
  });

  it("refuses a valid picture that is over the cap, whether or not it announced its length", async () => {
    // A PNG decoder ignores what follows IEND, so padding keeps the picture drawable and only the size is wrong.
    const padded = Buffer.concat([await png(), Buffer.alloc(6_000_000)]);
    const quiet = { headers: { "content-type": "image/png" } };
    const announced = { headers: { "content-type": "image/png", "content-length": String(padded.length) } };
    expect(await remoteImageUri("https://cdn.example/a.png", answer(padded, quiet), ours)).toBeNull();
    expect(await remoteImageUri("https://cdn.example/a.png", answer(padded, announced), ours)).toBeNull();
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
