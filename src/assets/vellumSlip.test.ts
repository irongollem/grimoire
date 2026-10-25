import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(process.cwd(), "src/assets/vellum.css"), "utf8");

// A slip is often the element that scrolls (a combobox list). iOS Safari does not repaint rows scrolled into a
// filtered scroller until the page moves, so they stayed blank: the underleaf lives in the frame image instead.
describe("vellum floating slip", () => {
  it("sets no filter on [data-slip]", () => {
    const rules = [...css.matchAll(/([^{}]*\[data-slip\][^{}]*)\{([^}]*)\}/g)]
      // Rules for the slip element itself, not for things inside it.
      .filter(([, selector]) => /\[data-slip\](:[\w()-]+)*$/.test(selector.trim()))
      .map(([, , body]) => body);
    expect(rules.length).toBeGreaterThan(0);
    for (const body of rules) expect(body).not.toMatch(/(^|[;\s])filter:\s*(?!none\b)\S/);
  });

  it("draws the underleaf inside the frame, in both themes", () => {
    const frames = [...css.matchAll(/--vl-slip-frame: url\("([^"]*)"\)/g)].map(([, u]) => decodeURIComponent(u));
    expect(frames).toHaveLength(2);
    for (const f of frames) expect(f).toContain("feOffset in='p' dx='3' dy='5'");
  });
});
