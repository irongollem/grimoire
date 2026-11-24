import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { init as initPng } from "@jsquash/png/decode";
import { init as initWebp } from "@jsquash/webp/encode";
import { storable } from "./storableImage";

// Deno loads the codecs' wasm itself; Node's fetch cannot read a file URL, so the test hands them over.
beforeAll(async () => {
  await initPng(readFileSync("node_modules/@jsquash/png/codec/pkg/squoosh_png_bg.wasm"));
  const webp = readFileSync("node_modules/@jsquash/webp/codec/enc/webp_enc.wasm");
  await initWebp({ instantiateWasm: (imports: WebAssembly.Imports, done: (instance: WebAssembly.Instance) => void) => { void WebAssembly.instantiate(webp, imports).then((r) => done(r.instance)); return {}; } } as never);
});

// A 1 by 1 PNG.
const PNG = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="), (c) => c.charCodeAt(0));

// #1271 review: Gemini answers a map painting in PNG, which the place-picture bucket refuses (WebP and JPEG only), so a
// paid painting was never stored.
describe("storable", () => {
  it("re-encodes a PNG as WebP", async () => {
    const out = await storable(PNG, "image/png");
    expect(out.contentType).toBe("image/webp");
    const head = new TextDecoder().decode(out.bytes.slice(0, 12));
    expect([head.slice(0, 4), head.slice(8, 12)]).toEqual(["RIFF", "WEBP"]);
  });

  it("leaves a format the bucket takes as it came", async () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
    expect(await storable(jpeg, "image/jpeg")).toEqual({ bytes: jpeg, contentType: "image/jpeg" });
  });
});
