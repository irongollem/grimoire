import { describe, expect, it, vi } from "vitest";
import { titleSize } from "./_openBookCard";
import { remoteImageUri } from "./_openBookCardRender";

describe("remoteImageUri", () => {
  it("never fetches a non-https, IP-literal or local address", async () => {
    const fetchImpl = vi.fn();
    for (const url of ["http://img.example/a.png", "https://127.0.0.1/a.png", "https://localhost/a.png", "https://[::1]/a.png", "https://db.internal/a.png", "not a url", null]) {
      expect(await remoteImageUri(url, fetchImpl as never)).toBeNull();
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it("returns null for a non-image answer or a failed fetch", async () => {
    expect(await remoteImageUri("https://img.example/a", (async () => new Response("<html>", { headers: { "content-type": "text/html" } })) as never)).toBeNull();
    expect(await remoteImageUri("https://img.example/a", (async () => { throw new Error("down"); }) as never)).toBeNull();
  });
});

describe("titleSize", () => {
  it("shrinks long titles", () => {
    expect(titleSize("The Saltreach")).toBeGreaterThan(titleSize("The Long Winter of the Ashen Marches"));
  });
});
