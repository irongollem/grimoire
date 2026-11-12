import { describe, it, expect, vi } from "vitest";
import { inlineSameOriginAssets, toBase64, ASSETS_LOAD_ERROR } from "./inlineSameOriginAssets";

// The art CDN of a production build; the module reads it once, at import.
vi.mock("@/lib/storage/buckets", () => ({ ASSET_CDN_BASE: "https://cdn.test" }));

const bytes = (s: string) => new TextEncoder().encode(s).buffer as ArrayBuffer;

describe("inlineSameOriginAssets", () => {
  it("rewrites double-quoted, single-quoted and bare css urls", async () => {
    const fetchAsset = vi.fn(async () => bytes("abc"));
    const css = `a{src:url("/fonts/a.ttf")} b{src:url('/fonts/b.otf')} c{src:url(/fonts/c.woff2)}`;
    const out = await inlineSameOriginAssets(css, fetchAsset);
    expect(out).toContain("url(data:font/ttf;base64,YWJj)");
    expect(out).toContain("url(data:font/otf;base64,YWJj)");
    expect(out).toContain("url(data:font/woff2;base64,YWJj)");
    expect(out).not.toContain("/fonts/");
  });

  it("inlines the page background, the case that printed every page plain (#565)", async () => {
    const fetchAsset = vi.fn(async () => bytes("w"));
    const html = `<style>.p{background:url('/assets/scriptorium/page-background.webp') center}</style>`;
    const out = await inlineSameOriginAssets(html, fetchAsset);
    expect(out).toContain("url(data:image/webp;base64,dw==)");
    expect(fetchAsset).toHaveBeenCalledWith("/assets/scriptorium/page-background.webp");
  });

  it("inlines a root-relative src attribute and keeps its quotes", async () => {
    const fetchAsset = vi.fn(async () => bytes("p"));
    const out = await inlineSameOriginAssets(`<img alt="x" src='/assets/a.png'>`, fetchAsset);
    expect(out).toBe(`<img alt="x" src='data:image/png;base64,cA=='>`);
  });

  it("inlines a paper's CDN url from the body's style attribute, without breaking the attribute's quotes", async () => {
    // Fails on: a CDN paper url left in the PDF's body style (the renderer cannot be relied on to fetch it), or an
    // inlined data uri wrapped in double quotes inside style="...", which ends the attribute early.
    const fetchAsset = vi.fn(async () => bytes("p"));
    const html = `<body class="sc-paper" style="--sc-paper-image: url(https://cdn.test/app-art/assets/papers/kraft.1a2b3c4d.webp); --sc-paper-size: 130.00mm 130.00mm">`;
    const out = await inlineSameOriginAssets(html, fetchAsset);
    expect(out).toBe(`<body class="sc-paper" style="--sc-paper-image: url(data:image/webp;base64,cA==); --sc-paper-size: 130.00mm 130.00mm">`);
    expect(fetchAsset).toHaveBeenCalledWith("https://cdn.test/app-art/assets/papers/kraft.1a2b3c4d.webp");
  });

  it("leaves a url on some other host alone, even one that starts like the CDN's", async () => {
    // Fails on: matching the CDN origin as a prefix, which would fetch and inline a stranger's file.
    const fetchAsset = vi.fn(async () => bytes("x"));
    const html = `<i style="background: url(https://cdn.test.evil.example/a.webp)">`;
    expect(await inlineSameOriginAssets(html, fetchAsset)).toBe(html);
    expect(fetchAsset).not.toHaveBeenCalled();
  });

  it("leaves absolute, protocol-relative and data references alone", async () => {
    const fetchAsset = vi.fn(async () => bytes("x"));
    const html =
      `<img src="https://cdn.example/a.png"><img src="//cdn.example/b.png">` +
      `<style>a{background:url(data:image/png;base64,AA==)}</style>`;
    expect(await inlineSameOriginAssets(html, fetchAsset)).toBe(html);
    expect(fetchAsset).not.toHaveBeenCalled();
  });

  it("types an asset by its extension, ignoring a cache-busting query, and jpg is image/jpeg", async () => {
    const fetchAsset = vi.fn(async () => bytes("x"));
    const out = await inlineSameOriginAssets(`<img src="/a/b.png?v=3"><img src="/a/c.jpg">`, fetchAsset);
    expect(out).toContain("data:image/png;base64,");
    expect(out).toContain("data:image/jpeg;base64,");
    expect(fetchAsset).toHaveBeenCalledWith("/a/b.png?v=3");
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

describe("page dressing masks", () => {
  it("inlines every mark picture named in the dressing's stylesheet, for the PDF", async () => {
    // Fails on: a mask url left as a CDN link in the PDF: the renderer on Cloudflare cannot be relied on to fetch it,
    // so every printed page would lose its stains and its flourishes without a word.
    const { dressingCss } = await import("@/scriptorium/dressing/dressingLayer");
    const fetchAsset = vi.fn(async () => bytes("m"));
    const out = await inlineSameOriginAssets(`<style>${dressingCss()}</style>`, fetchAsset);
    expect(out).not.toMatch(/url\((?!data:)/);
    expect(out).toContain("mask-image:url(data:image/webp;base64,bQ==)");
    expect(out).toContain("mask-image:url(data:image/svg+xml;base64,bQ==)");
    expect(fetchAsset).toHaveBeenCalledTimes(4);
  });

  it("inlines a mask set in a style attribute as well", async () => {
    const fetchAsset = vi.fn(async () => bytes("m"));
    const html = `<div style="mask-image:url(https://cdn.test/app-art/assets/paintbox/marks/stain-ring.1a2b.webp);opacity:.4">`;
    expect(await inlineSameOriginAssets(html, fetchAsset)).toBe(`<div style="mask-image:url(data:image/webp;base64,bQ==);opacity:.4">`);
  });
});
