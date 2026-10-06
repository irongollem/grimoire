import { describe, expect, it } from "vitest";
import { modulesInChunk, staticChain, type Stats } from "./composition";

const part = (n: number) => ({ renderedLength: n, gzipLength: n / 2, brotliLength: n / 3, metaUid: "" });
const stats: Stats = {
  nodeParts: { p1: part(10), p2: part(30), p3: part(20) },
  nodeMetas: {
    a: { id: "/src/main.ts", moduleParts: { "assets/index.js": "p1" }, imported: [{ uid: "b" }, { uid: "d", dynamic: true }], importedBy: [] },
    b: { id: "/src/b.ts", moduleParts: { "assets/index.js": "p2" }, imported: [{ uid: "c" }], importedBy: [{ uid: "a" }] },
    c: { id: "/node_modules/lib/x.js", moduleParts: { "assets/lib.js": "p3" }, imported: [], importedBy: [{ uid: "b" }] },
    d: { id: "/node_modules/lazy/y.js", moduleParts: {}, imported: [], importedBy: [{ uid: "a" }] },
  },
};

describe("modulesInChunk", () => {
  it("lists a chunk's modules largest first", () => {
    expect(modulesInChunk(stats, "assets/index.js").map((m) => m.id)).toEqual(["/src/b.ts", "/src/main.ts"]);
  });
});

describe("staticChain", () => {
  it("finds the shortest static chain", () => {
    expect(staticChain(stats, "/src/main.ts", /node_modules\/lib/)).toEqual(["/src/main.ts", "/src/b.ts", "/node_modules/lib/x.js"]);
  });
  it("does not follow dynamic imports", () => {
    expect(staticChain(stats, "/src/main.ts", /lazy/)).toBeNull();
  });
});
