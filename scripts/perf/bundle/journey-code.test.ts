import { describe, expect, it } from "vitest";
import type { Budgets } from "../budgets";
import type { ResultsFile } from "../results";
import { type BuildGraph, type JourneySpec, compareWithRun, judge, nameDiff, parseBoot, parseLazyImports, predict, specFromRun } from "./journey-code";

// Shaped like a real chunk: one preload table, each import() indexing into it.
const chunk =
  'const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/Dash-AAAAAAAA.js","assets/shared-BBBBBBBB.js","assets/Dash-CCCCCCCC.css","assets/Tiny-DDDDDDDD.js"])))=>i.map(i=>d[i]);' +
  "a=()=>q(()=>import(`./Dash-AAAAAAAA.js`).then(e=>(e.r(),e.n)),__vite__mapDeps([0,1,2]));" +
  "b=()=>import(`./Bare-EEEEEEEE.js`);" +
  "c=()=>q(()=>import(`./Tiny-DDDDDDDD.js`),__vite__mapDeps([3]));";

describe("parseLazyImports", () => {
  it("gives each import its own preload list, not the next import's", () => {
    const lazy = parseLazyImports(chunk);
    expect([...lazy.get("Dash-AAAAAAAA.js")!].sort()).toEqual(["Dash-AAAAAAAA.js", "Dash-CCCCCCCC.css", "shared-BBBBBBBB.js"]);
    // Bare has no list of its own; the Tiny list after it is not Bare's.
    expect([...lazy.get("Bare-EEEEEEEE.js")!]).toEqual(["Bare-EEEEEEEE.js"]);
  });

  it("refuses an index outside the table instead of dropping the file", () => {
    expect(() => parseLazyImports(chunk.replace("[3]", "[9]"))).toThrow(/outside/);
  });
});

describe("parseBoot", () => {
  it("takes the entry, modulepreloads and stylesheets, not icons or other origins", () => {
    const html =
      '<link rel="icon" href="/favicon.ico"><script type="module" src="/assets/index-AAAAAAAA.js"></script>' +
      '<link rel="modulepreload" href="/assets/vue-BBBBBBBB.js"><link rel="stylesheet" href="/assets/app-CCCCCCCC.css">' +
      '<script defer src="/_vercel/insights/script.js"></script>';
    expect([...parseBoot(html)].sort()).toEqual(["app-CCCCCCCC.css", "index-AAAAAAAA.js", "vue-BBBBBBBB.js"]);
  });
});

const graph: BuildGraph = {
  boot: new Set(["index-AAAAAAAA.js", "vue-BBBBBBBB.js"]),
  lazy: new Map([
    ["Dash-AAAAAAAA.js", new Set(["Dash-AAAAAAAA.js", "shared-BBBBBBBB.js", "vue-BBBBBBBB.js"])],
    ["Npcs-CCCCCCCC.js", new Set(["Npcs-CCCCCCCC.js", "shared-BBBBBBBB.js"])],
  ]),
};

const spec: JourneySpec = {
  "dm-cold/dm-cold": { after: [], roots: ["Dash.js"], external: ["/_vercel/insights/script.js"], files: [] },
  "dm-nav//npcs": { after: ["dm-cold/dm-cold"], roots: ["Npcs.js"], external: [], files: [] },
};

describe("predict", () => {
  it("counts boot files once on a cold load, plus the roots' preload lists and outside scripts", () => {
    // index + vue + Dash + shared = 4 build files (vue is in both boot and Dash's list), + 1 analytics script.
    expect(predict(graph, spec)[0].codeRequests).toBe(5);
  });

  it("does not count again what an earlier step already loaded", () => {
    // Npcs brings shared, which the dashboard fetched: only Npcs itself is new.
    expect(predict(graph, spec)[1]).toMatchObject({ codeRequests: 1, files: ["Npcs.js"] });
  });

  it("flags a root the build no longer has", () => {
    const stale = { "dm-cold/dm-cold": { ...spec["dm-cold/dm-cold"], roots: ["Gone.js"] } };
    expect(predict(graph, stale)[0].unknownRoots).toEqual(["Gone.js"]);
  });
});

describe("judge", () => {
  const budgets = (n: number): Budgets => ({ journeys: { "dm-cold": { "dm-cold": { apiRequests: 1, codeRequests: n, serialDepth: 1 } } } });
  const at = [{ step: "dm-cold/dm-cold", codeRequests: 83, files: [], unknownRoots: [] }];

  it.each([
    [82, "over"],
    [83, "within"],
    [84, "under"],
  ])("83 files against a budget of %i is %s", (budget, verdict) => {
    const { over, under } = judge(at, budgets(budget));
    expect({ over: over.length, under: under.length }).toEqual({ over: Number(verdict === "over"), under: Number(verdict === "under") });
  });

  it("reports a step with no budget instead of passing it", () => {
    expect(judge([{ ...at[0], step: "new-journey/x" }], budgets(83)).unbudgeted).toEqual(["new-journey/x"]);
  });
});

describe("nameDiff", () => {
  // Two chunks may share a name (the build has three vendor.js); a third one appearing is still new.
  it("counts a name each time it occurs", () => {
    expect(nameDiff(["vendor.js", "vendor.js"], ["vendor.js", "vendor.js", "vendor.js", "combat.js"])).toEqual({ added: ["combat.js", "vendor.js"], removed: [] });
  });
});

function run(journey: string, label: string, assetPaths: string[], codeRequests = assetPaths.length) {
  return {
    journey,
    status: "ok",
    skipReason: null,
    steps: [{ label, runs: [{ assetPaths }], median: { codeRequests } }],
  };
}

describe("specFromRun", () => {
  it("primes dm-nav with the dashboard even when the run lists dm-nav first", () => {
    const results = {
      journeys: [run("dm-nav", "/npcs", ["/assets/Npcs-CCCCCCCC.js"]), run("dm-cold", "dm-cold", ["/assets/Dash-AAAAAAAA.js", "/_vercel/insights/script.js"])],
    } as unknown as ResultsFile;
    const built = specFromRun(results, graph);
    expect(Object.keys(built)).toEqual(["dm-cold/dm-cold", "dm-nav//npcs"]);
    expect(built["dm-nav//npcs"].after).toEqual(["dm-cold/dm-cold"]);
    expect(built["dm-cold/dm-cold"]).toMatchObject({ roots: ["Dash.js"], external: ["/_vercel/insights/script.js"] });
  });
});

describe("compareWithRun", () => {
  it("names a step whose measured count the model no longer reproduces", () => {
    const results = { journeys: [run("dm-cold", "dm-cold", [], 6)] } as unknown as ResultsFile;
    expect(compareWithRun(predict(graph, { "dm-cold/dm-cold": spec["dm-cold/dm-cold"] }), results)).toEqual(["dm-cold/dm-cold: model 5, measured 6"]);
  });
});
