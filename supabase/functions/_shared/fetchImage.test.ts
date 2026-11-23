import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchGuardedImage, MAX_STYLE_IMAGE_BYTES } from "./fetchImage.ts";

afterEach(() => vi.unstubAllGlobals());

const reply = (body: Uint8Array, type: string | null, ok = true) => ({
  ok,
  headers: { get: (h: string) => (h.toLowerCase() === "content-type" ? type : null) },
  arrayBuffer: () => Promise.resolve(body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength)),
});
const URL_ = "https://ref.supabase.co/storage/v1/object/public/canon/a.webp";

describe("fetchGuardedImage", () => {
  it("returns the bytes and bare type of a good picture", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(reply(new Uint8Array([1, 2, 3]), "image/webp; charset=x"))));
    expect(await fetchGuardedImage(URL_)).toEqual({ bytes: new Uint8Array([1, 2, 3]), mimeType: "image/webp" });
  });

  it("refuses a body that is not an image type", async () => {
    // Bug caught: trusting any 200 hands an HTML page to the image model as a style picture, which answers 400 and fails every generation.
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(reply(new Uint8Array([1]), "text/html"))));
    expect(await fetchGuardedImage(URL_)).toBeNull();
  });

  it("refuses a body over the byte cap", async () => {
    // Bug caught: a huge file is sent to the provider as input tokens, or exhausts the function's memory.
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(reply(new Uint8Array(MAX_STYLE_IMAGE_BYTES + 1), "image/png"))));
    expect(await fetchGuardedImage(URL_)).toBeNull();
  });

  it("refuses an empty body", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(reply(new Uint8Array(), "image/png"))));
    expect(await fetchGuardedImage(URL_)).toBeNull();
  });

  it("asks fetch to refuse redirects and to give up after a while", async () => {
    // Bug caught: a following redirect leaves the SSRF-guarded host; no signal lets a hanging URL stall the generator.
    const fetchMock = vi.fn(() => Promise.resolve(reply(new Uint8Array([1]), "image/png")));
    vi.stubGlobal("fetch", fetchMock);
    await fetchGuardedImage(URL_);
    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(init.redirect).toBe("error");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("lets a redirect or timeout error reach the caller", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new TypeError("redirect"))));
    await expect(fetchGuardedImage(URL_)).rejects.toThrow();
  });
});
