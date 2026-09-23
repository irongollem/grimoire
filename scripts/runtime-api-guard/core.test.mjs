import { describe, it, expect } from "vitest";
import { detectApis, compareToPinned } from "./core.mjs";
import { PROBES } from "./probes.mjs";
import { PINNED } from "./pinned.mjs";

const detect = (source) => [...detectApis(source)].sort();

describe("detectApis", () => {
  it("finds a namespace-qualified call", () => {
    expect(detect('Object.hasOwn(target, "key")')).toEqual(["Object.hasOwn"]);
    expect(detect("Object.groupBy(rows, pick)")).toEqual(["Object.groupBy"]);
  });

  it("finds a namespace-qualified API that is only feature-detected", () => {
    // The member is read but never called on an old engine. Seeing it is the
    // point: model-viewer's guarded AbortSignal.any is recorded this way.
    expect(detect('typeof AbortSignal.any === "function" ? 1 : 2')).toEqual(["AbortSignal.any"]);
  });

  it("finds a called prototype method", () => {
    expect(detect("items.at(-1); rows.toSorted(cmp);")).toEqual([
      "Array.prototype.at",
      "Array.prototype.toSorted",
    ]);
  });

  it("ignores a prototype name that is not called", () => {
    // `thing.at` as a bare property is far more likely someone's field than
    // Array.prototype.at, so requiring the call is what keeps the noise down.
    expect(detect("const f = thing.at; const g = { at: 1 };")).toEqual([]);
  });

  it("finds a global only as a call target", () => {
    expect(detect("structuredClone(value)")).toEqual(["structuredClone"]);
    expect(detect("const structuredClone = 1;")).toEqual([]);
  });

  it("reads regex flags off the literal instead of guessing from text", () => {
    // The regression this whole approach exists for: the text-search version
    // read `1e3/d` as a `d` flag and reported three APIs that were divisions.
    expect(detect("const d = 2; const x = Math.sqrt(9) / d, y = 1e3 / d;")).toEqual([]);
    expect(detect("const re = /ab/d;")).toEqual(["RegExp d flag"]);
    expect(detect("const re = /[\\p{L}]/v;")).toEqual(["RegExp v flag"]);
  });

  it("sees through optional chaining and into nested scopes", () => {
    expect(detect("function f() { return () => Object?.hasOwn?.(o, k); }")).toEqual([
      "Object.hasOwn",
    ]);
  });

  it("reports each name once however often it appears", () => {
    expect(detect("a.at(0); b.at(1); c.at(2);")).toEqual(["Array.prototype.at"]);
  });

  it("refuses to silently swallow a chunk it cannot parse", () => {
    // A checker that skips bad input reports a clean bill of health about a
    // partial read. cli.mjs turns this into a named, fatal error.
    expect(() => detectApis("function ( {")).toThrow();
  });
});

describe("compareToPinned", () => {
  it("reports an unapproved name as added", () => {
    const { added, stale } = compareToPinned(new Set(["A", "B"]), ["A"]);
    expect(added).toEqual(["B"]);
    expect(stale).toEqual([]);
  });

  it("reports an approved name no longer present as stale", () => {
    const { added, stale } = compareToPinned(new Set(["A"]), ["A", "B"]);
    expect(added).toEqual([]);
    expect(stale).toEqual(["B"]);
  });

  it("is quiet when the sets match", () => {
    expect(compareToPinned(new Set(["A", "B"]), ["B", "A"])).toEqual({ added: [], stale: [] });
  });
});

describe("the probe and pinned tables", () => {
  it("has no duplicate probe names", () => {
    const names = PROBES.map((probe) => probe.name);
    expect(names).toEqual([...new Set(names)]);
  });

  it("gives every probe the fields its kind is matched on", () => {
    const required = {
      static: ["object", "property"],
      prototype: ["property"],
      global: ["identifier"],
      regexflag: ["flag"],
    };
    for (const probe of PROBES) {
      expect(required, `unknown kind on ${probe.name}`).toHaveProperty(probe.kind);
      for (const field of required[probe.kind]) {
        expect(probe[field], `${probe.name} is missing ${field}`).toBeTruthy();
      }
    }
  });

  it("pins only names the probes can actually produce", () => {
    // A typo in pinned.mjs would otherwise be invisible: the entry would never
    // match, so it would approve nothing while looking like it approved
    // something — and the real API would fail the build with no hint why.
    const probeNames = new Set(PROBES.map((probe) => probe.name));
    for (const name of Object.keys(PINNED)) {
      expect(probeNames, `pinned name not in PROBES: ${name}`).toContain(name);
    }
  });

  it("gives every pinned entry a reason, not a placeholder", () => {
    for (const [name, reason] of Object.entries(PINNED)) {
      expect(typeof reason, name).toBe("string");
      expect(reason.trim().length, `${name} needs a real reason`).toBeGreaterThan(40);
    }
  });
});
