import { describe, it, expect, vi } from "vitest";
import { inlineSameOriginAssets, toBase64, ASSETS_LOAD_ERROR } from "./inlineSameOriginAssets";

const bytes = (s: string) => new TextEncoder().encode(s).buffer as ArrayBuffer;

describe("inlineSameOriginAssets", () => {
  it("rewrites double-quoted, single-quoted and bare css urls", async () => {
    const fetchAsset = vi.fn(async () => bytes("abc"));
    const css = `a{src:url("/fonts/a.ttf")} b{src:url('/fonts/b.otf')} c{src:url(/fonts/c.woff2)}`;
    const out = await inlineSameOriginAssets(css, fetchAsset);
    expect(out).toContain('url("data:font/ttf;base64,YWJj")');
    expect(out).toContain('url("data:font/otf;base64,YWJj")');
    expect(out).toContain('url("data:font/woff2;base64,YWJj")');
    expect(out).not.toContain("/fonts/");
  });

  it("inlines the page background, the case that printed every page plain (#565)", async () => {
    const fetchAsset = vi.fn(async () => bytes("w"));
    const html = `<style>.p{background:url('/assets/scriptorium/page-background.webp') center}</style>`;
    const out = await inlineSameOriginAssets(html, fetchAsset);
    expect(out).toContain('url("data:image/webp;base64,dw==")');
    expect(fetchAsset).toHaveBeenCalledWith("/assets/scriptorium/page-background.webp");
  });

  it("inlines a root-relative src attribute and keeps its quotes", async () => {
    const fetchAsset = vi.fn(async () => bytes("p"));
    const out = await inlineSameOriginAssets(`<img alt="x" src='/assets/a.png'>`, fetchAsset);
    expect(out).toBe(`<img alt="x" src='data:image/png;base64,cA=='>`);
  });

  it("leaves absolute, protocol-relative and data references alone", async () => {
    const fetchAsset = vi.fn(async () => bytes("x"));
    const html =
      `<img src="https://cdn.example/a.png"><img src="//cdn.example/b.png">` +
      `<style>a{background:url(data:image/png;base64,AA==)}</style>`;
    expect(await inlineSameOriginAssets(html, fetchAsset)).toBe(html);
    expect(fetchAsset).not.toHaveBeenCalled();
  });

  it("fetches each distinct path once", async () => {
    const fetchAsset = vi.fn(async () => bytes("x"));
    await inlineSameOriginAssets(`a{src:url("/fonts/a.ttf")} <img src="/fonts/a.ttf">`, fetchAsset);
    expect(fetchAsset).toHaveBeenCalledTimes(1);
  });

  it("leaves unknown extensions untouched and does not fetch them", async () => {
    const fetchAsset = vi.fn(async () => bytes("x"));
    const css = `a{src:url("/fonts/a.eot")}`;
    expect(await inlineSameOriginAssets(css, fetchAsset)).toBe(css);
    expect(fetchAsset).not.toHaveBeenCalled();
  });

  it("fails with a clear error when an asset cannot be fetched", async () => {
    const fetchAsset = vi.fn(async () => {
      throw new Error("404");
    });
    await expect(inlineSameOriginAssets(`a{src:url("/fonts/a.ttf")}`, fetchAsset)).rejects.toThrow(
      ASSETS_LOAD_ERROR,
    );
  });
});

describe("toBase64", () => {
  it("encodes a 200 KB binary without blowing the stack", () => {
    const buf = new Uint8Array(200_000).fill(65).buffer;
    expect(atob(toBase64(buf)).length).toBe(200_000);
  });
});
