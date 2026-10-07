import { describe, expect, it } from "vitest";
import { measure, parseArgs, parseCriticalAssets, sumSizes, topBySize, type FileReport } from "./critical-path";

const html = `<html><head>
<script id="es-polyfills">var x=1</script>
<script type="module" crossorigin src="/assets/index-A.js"></script>
<link rel="modulepreload" crossorigin href="/assets/vue-B.js">
<link rel="modulepreload" crossorigin href="/assets/vue-B.js">
<link rel="modulepreload" href="/assets/index-A.js">
<link rel="stylesheet" href="/assets/index-C.css">
</head></html>`;

describe("parseCriticalAssets", () => {
  it("finds the module entry and de-duplicated modulepreloads, ignoring other links", () => {
    expect(parseCriticalAssets(html)).toEqual({ entry: "assets/index-A.js", preloads: ["assets/vue-B.js"] });
  });
  it("throws when there is no module entry", () => {
    expect(() => parseCriticalAssets("<html></html>")).toThrow(/entry/);
  });
});

describe("parseArgs", () => {
  // Without --json the first argument is the build directory. An earlier
  // version dropped it and silently measured dist/ instead.
  it("takes the build directory with or without --json", () => {
    expect(parseArgs(["dist-bundle"])).toEqual({ buildDir: "dist-bundle", jsonOut: null });
    expect(parseArgs(["dist-bundle", "--json", "o.json"])).toEqual({ buildDir: "dist-bundle", jsonOut: "o.json" });
    expect(parseArgs(["--json", "o.json", "dist-bundle"])).toEqual({ buildDir: "dist-bundle", jsonOut: "o.json" });
    expect(parseArgs([])).toEqual({ buildDir: "dist", jsonOut: null });
  });
  it("refuses --json without a path", () => {
    expect(() => parseArgs(["--json"])).toThrow(/needs a file path/);
  });
});

describe("sizes", () => {
  it("measures raw, gzip and brotli", () => {
    const s = measure(Buffer.from("a".repeat(1000)));
    expect(s.raw).toBe(1000);
    expect(s.gzip).toBeLessThan(100);
    expect(s.brotli).toBeLessThan(100);
  });
  it("sums", () => {
    expect(sumSizes([{ raw: 1, gzip: 2, brotli: 3 }, { raw: 10, gzip: 20, brotli: 30 }])).toEqual({
      raw: 11, gzip: 22, brotli: 33,
    });
    expect(sumSizes([])).toEqual({ raw: 0, gzip: 0, brotli: 0 });
  });
  it("ranks by raw size", () => {
    const f = (file: string, raw: number): FileReport => ({ file, raw, gzip: 0, brotli: 0, onCriticalPath: false });
    expect(topBySize([f("a", 1), f("b", 3), f("c", 2)], 2).map((x) => x.file)).toEqual(["b", "c"]);
  });
});
