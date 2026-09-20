import { describe, it, expect } from "vitest";
import { build } from "esbuild";
import { createContext, runInContext } from "node:vm";
import path from "node:path";
import {
  hasOwn,
  at,
  findLast,
  findLastIndex,
  randomUUID,
  installPolyfills,
} from "./index";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("hasOwn", () => {
  it("reports own properties and ignores inherited ones", () => {
    expect(hasOwn({ a: 1 }, "a")).toBe(true);
    // Own even though the value is undefined — the whole reason to reach for
    // this over `target.key !== undefined`.
    expect(hasOwn({ a: undefined }, "a")).toBe(true);
    expect(hasOwn({ a: 1 }, "b")).toBe(false);
    expect(hasOwn({ a: 1 }, "toString")).toBe(false);
  });

  it("coerces the key and the target the way the spec does", () => {
    const key = Symbol("key");
    expect(hasOwn({ [key]: 1 }, key)).toBe(true);
    expect(hasOwn(["only"], 0)).toBe(true);
    expect(hasOwn(["only"], "0")).toBe(true);
    expect(hasOwn(["only"], 1)).toBe(false);
    expect(hasOwn("ab", "length")).toBe(true); // ToObject, not a throw
  });

  it("throws a TypeError for null and undefined", () => {
    expect(() => hasOwn(null, "a")).toThrow(TypeError);
    expect(() => hasOwn(undefined, "a")).toThrow(TypeError);
  });
});

describe("at", () => {
  const items = ["a", "b", "c"];

  it("indexes from the end for negative values", () => {
    expect(at.call(items, -1)).toBe("c");
    expect(at.call(items, -3)).toBe("a");
    expect(at.call(items, 0)).toBe("a");
    expect(at.call(items, 2)).toBe("c");
  });

  it("returns undefined outside the range", () => {
    expect(at.call(items, 3)).toBeUndefined();
    expect(at.call(items, -4)).toBeUndefined();
    expect(at.call([], -1)).toBeUndefined();
    expect(at.call(items, Infinity)).toBeUndefined();
    expect(at.call(items, -Infinity)).toBeUndefined();
  });

  it("coerces a missing or fractional index the way the spec does", () => {
    expect(at.call(items)).toBe("a");
    expect(at.call(items, NaN)).toBe("a");
    expect(at.call(items, 1.9)).toBe("b");
    expect(at.call(items, -1.9)).toBe("c");
  });
});

describe("findLast / findLastIndex", () => {
  const items = [1, 2, 3, 4];

  it("searches from the end", () => {
    expect(findLast.call(items, (n) => (n as number) % 2 === 1)).toBe(3);
    expect(findLastIndex.call(items, (n) => (n as number) % 2 === 1)).toBe(2);
  });

  it("reports no match as undefined and -1", () => {
    expect(findLast.call(items, () => false)).toBeUndefined();
    expect(findLastIndex.call(items, () => false)).toBe(-1);
  });

  it("passes value, index and the array, and honours thisArg", () => {
    const calls: unknown[][] = [];
    findLast.call(["x"], function (this: unknown, ...args: unknown[]) {
      calls.push([...args, this]);
      return false;
    }, "bound");
    expect(calls).toEqual([["x", 0, ["x"], "bound"]]);
  });

  it("rejects a non-function predicate", () => {
    expect(() => findLastIndex.call(items, "nope" as never)).toThrow(TypeError);
  });
});

describe("randomUUID", () => {
  it("produces an RFC 4122 version 4 id", () => {
    for (let i = 0; i < 50; i++) expect(randomUUID()).toMatch(UUID_V4);
  });

  it("does not repeat itself", () => {
    const seen = new Set(Array.from({ length: 500 }, () => randomUUID()));
    expect(seen.size).toBe(500);
  });

  it("pins the version and variant bits rather than passing them through", () => {
    // A generator that forwarded raw random bytes would emit `ff` here and
    // still look like a UUID to a loose regex.
    const allOnes = {
      getRandomValues: (bytes: Uint8Array) => bytes.fill(0xff),
    } as unknown as Crypto;
    const original = globalThis.crypto;
    Object.defineProperty(globalThis, "crypto", { value: allOnes, configurable: true });
    try {
      expect(randomUUID()).toBe("ffffffff-ffff-4fff-bfff-ffffffffffff");
    } finally {
      Object.defineProperty(globalThis, "crypto", { value: original, configurable: true });
    }
  });
});

describe("installPolyfills", () => {
  it("leaves native implementations alone", () => {
    const before = [
      Object.hasOwn,
      Array.prototype.at,
      (Array.prototype as unknown as Record<string, unknown>).findLast,
      globalThis.structuredClone,
      globalThis.crypto.randomUUID,
    ];
    installPolyfills();
    expect([
      Object.hasOwn,
      Array.prototype.at,
      (Array.prototype as unknown as Record<string, unknown>).findLast,
      globalThis.structuredClone,
      globalThis.crypto.randomUUID,
    ]).toEqual(before);
  });
});

/**
 * The unit tests above cover the implementations; this covers the artifact
 * that actually ships. vite.config.ts bundles install.ts to an IIFE and inlines
 * it in index.html's head, so what matters is whether *that* output, run on an
 * engine missing these APIs, installs working ones. It is the only test here
 * that would catch the bundle losing the structuredClone package, or the entry
 * forgetting to call the installer.
 *
 * A fresh `node:vm` realm, with the natives deleted inside it, is what makes
 * this testable at all: Node has every one of these, and deleting them in the
 * test process would take vitest itself down.
 */
describe("the bundled script vite inlines", () => {
  it("installs working implementations on an engine that has none", async () => {
    const result = await build({
      entryPoints: [path.resolve(import.meta.dirname, "install.ts")],
      bundle: true,
      write: false,
      format: "iife",
      target: "es2015",
      minify: true,
      platform: "browser",
    });

    const context = createContext({
      crypto: {
        getRandomValues: (bytes: Uint8Array) => {
          for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
          return bytes;
        },
      },
    });
    runInContext(
      `Reflect.deleteProperty(Object, "hasOwn");
       Reflect.deleteProperty(Array.prototype, "at");
       Reflect.deleteProperty(Array.prototype, "findLast");
       Reflect.deleteProperty(Array.prototype, "findLastIndex");
       globalThis.structuredClone = undefined;`,
      context,
    );
    runInContext(result.outputFiles[0].text, context);

    const evaluate = (expression: string) => runInContext(expression, context);

    expect(evaluate('Object.hasOwn({ a: 1 }, "a")')).toBe(true);
    expect(evaluate('["a", "b"].at(-1)')).toBe("b");
    expect(evaluate("[1, 2, 3].findLast(function (n) { return n < 3; })")).toBe(2);
    expect(evaluate("[1, 2, 3].findLastIndex(function (n) { return n < 3; })")).toBe(1);
    expect(evaluate("crypto.randomUUID()")).toMatch(UUID_V4);

    // The reason this one needed a real package: a JSON round-trip would turn
    // the Date into a string, drop the Map entirely and blow the stack on the
    // cycle — and the date picker, which is what calls it here, holds Dates.
    expect(
      evaluate(`(function () {
        var source = { when: new Date(0), tags: new Map([["a", 1]]), set: new Set([1]) };
        source.self = source;
        var copy = structuredClone(source);
        return [
          copy !== source,
          copy.when instanceof Date && copy.when.getTime() === 0,
          copy.tags instanceof Map && copy.tags.get("a") === 1,
          copy.set instanceof Set && copy.set.has(1),
          copy.self === copy,
        ].join(",");
      })()`),
    ).toBe("true,true,true,true,true");

    // Non-enumerable, or every `for...in` over an array in the app breaks.
    expect(evaluate('(function () { var k = []; for (var i in ["a"]) k.push(i); return k.join(); })()')).toBe("0");
  });
});
