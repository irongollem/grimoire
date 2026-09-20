import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import path from "node:path";

/**
 * Covers the `es-polyfills` script in index.html by running the shipped source
 * itself, extracted from that file rather than copied here — a copy would pass
 * forever after someone edited the real one.
 *
 * Every case runs in a fresh `node:vm` realm with the natives deleted. Both
 * halves matter: Node has `Object.hasOwn` and `Array.prototype.at`, so without
 * the deletion these assertions would pass against the engine no matter what
 * the script said — which is exactly the hole the production crash fell
 * through, since the whole gate runs on Node. And the realm keeps the deletion
 * out of the test process, where a missing `Array.prototype.at` would take
 * vitest itself down.
 */
const source = (() => {
  const html = readFileSync(path.resolve(import.meta.dirname, "../../index.html"), "utf8");
  const match = html.match(/<script id="es-polyfills">([\s\S]*?)<\/script>/);
  if (!match) throw new Error("no <script id=\"es-polyfills\"> in index.html");
  return match[1];
})();

/** A realm with the ES2022 primitives removed and the shipped script applied. */
function oldEngine() {
  const context = createContext({});
  runInContext(
    `Reflect.deleteProperty(Object, "hasOwn");
     Reflect.deleteProperty(Array.prototype, "at");`,
    context,
  );
  runInContext(source, context);
  return (expression: string): unknown => runInContext(expression, context);
}

describe("the es-polyfills script", () => {
  it("parses as ES5, so the engine it targets can read it", () => {
    // An arrow function or `const` here would throw at parse time on the very
    // browser this exists for, before a single property was installed. The
    // comments are stripped first: prose about the code is not the code, and
    // a backtick in a sentence is not a template literal.
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    expect(code).not.toMatch(/=>|\bconst\b|\blet\b|`|\.{3}|\?\./);
  });

  it("installs both primitives when they are missing", () => {
    const evaluate = oldEngine();
    expect(evaluate("typeof Object.hasOwn")).toBe("function");
    expect(evaluate("typeof Array.prototype.at")).toBe("function");
  });

  it("leaves a native implementation alone", () => {
    const context = createContext({});
    runInContext("globalThis.before = [Object.hasOwn, Array.prototype.at];", context);
    runInContext(source, context);
    expect(
      runInContext("before[0] === Object.hasOwn && before[1] === Array.prototype.at", context),
    ).toBe(true);
  });
});

describe("Object.hasOwn", () => {
  it("reports own properties and ignores inherited ones", () => {
    const evaluate = oldEngine();
    expect(evaluate('Object.hasOwn({ a: 1 }, "a")')).toBe(true);
    // An own key whose value is undefined is still own — the whole reason to
    // reach for this over `target.key !== undefined`.
    expect(evaluate('Object.hasOwn({ a: undefined }, "a")')).toBe(true);
    expect(evaluate('Object.hasOwn({ a: 1 }, "b")')).toBe(false);
    expect(evaluate('Object.hasOwn({ a: 1 }, "toString")')).toBe(false);
  });

  it("coerces the key and the target the way the spec does", () => {
    const evaluate = oldEngine();
    expect(evaluate('var s = Symbol("k"); Object.hasOwn({ [s]: 1 }, s)')).toBe(true);
    expect(evaluate('Object.hasOwn(["only"], 0)')).toBe(true);
    expect(evaluate('Object.hasOwn(["only"], "0")')).toBe(true);
    expect(evaluate('Object.hasOwn(["only"], 1)')).toBe(false);
    // ToObject on a primitive rather than a throw.
    expect(evaluate('Object.hasOwn("ab", "length")')).toBe(true);
  });

  it("throws a TypeError for null and undefined", () => {
    const evaluate = oldEngine();
    expect(evaluate('(function () { try { Object.hasOwn(null, "a"); return "no throw"; } catch (e) { return e.constructor.name; } })()')).toBe("TypeError");
    expect(evaluate('(function () { try { Object.hasOwn(undefined, "a"); return "no throw"; } catch (e) { return e.constructor.name; } })()')).toBe("TypeError");
  });

  it("stays off the enumerable surface of Object", () => {
    expect(oldEngine()('Object.keys(Object).indexOf("hasOwn")')).toBe(-1);
  });
});

describe("Array.prototype.at", () => {
  it("indexes from the end for negative values", () => {
    const evaluate = oldEngine();
    expect(evaluate('["a", "b", "c"].at(-1)')).toBe("c");
    expect(evaluate('["a", "b", "c"].at(-3)')).toBe("a");
    expect(evaluate('["a", "b", "c"].at(0)')).toBe("a");
    expect(evaluate('["a", "b", "c"].at(2)')).toBe("c");
  });

  it("returns undefined outside the range", () => {
    const evaluate = oldEngine();
    expect(evaluate('["a", "b", "c"].at(3)')).toBeUndefined();
    expect(evaluate('["a", "b", "c"].at(-4)')).toBeUndefined();
    expect(evaluate("[].at(-1)")).toBeUndefined();
    expect(evaluate('["a"].at(Infinity)')).toBeUndefined();
    expect(evaluate('["a"].at(-Infinity)')).toBeUndefined();
  });

  it("coerces a missing or fractional index the way the spec does", () => {
    const evaluate = oldEngine();
    expect(evaluate('["a", "b", "c"].at()')).toBe("a");
    expect(evaluate('["a", "b", "c"].at(NaN)')).toBe("a");
    expect(evaluate('["a", "b", "c"].at(1.9)')).toBe("b");
    expect(evaluate('["a", "b", "c"].at(-1.9)')).toBe("c");
  });

  it("stays non-enumerable, so for...in over an array is unaffected", () => {
    const evaluate = oldEngine();
    expect(evaluate('(function () { var keys = []; for (var k in ["a", "b"]) keys.push(k); return keys.join(","); })()')).toBe("0,1");
  });
});
