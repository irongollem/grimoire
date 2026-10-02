import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { MAX_STRIPS } from "./bannerLoaderDetail";

/**
 * The bookmark flag is the app's only loading indicator (2 Oct 2026).
 *
 * It was drawn for the loading screen and stayed there, while 38 call sites
 * went on hand-rolling a spinning ring or spinning a lucide loader glyph, and
 * `LoadingSpinner` (113 files) drew a ring of its own. None of those looked
 * wrong alone, which is how they outlived the flag by a week. So this is held
 * by a scan rather than by convention: a spinner cannot come back without
 * failing here, and the message says what to use instead.
 *
 * The second half holds the boot splash in `index.html` equal to
 * `BannerLoader.vue`. The splash is static HTML painted before the bundle
 * loads, so it cannot import the component and restates its markup and CSS;
 * "keep the two in step" was a comment in both files and nothing else.
 */

const SRC_ROOT = join(import.meta.dirname, "../.."); // src/components/brand -> src
const REPO_ROOT = join(SRC_ROOT, "..");

const SCANNED_EXTENSIONS = new Set([".ts", ".vue", ".css"]);

function collectFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "generated") continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) collectFiles(path, out);
    else if (SCANNED_EXTENSIONS.has(extname(entry.name)) && !/\.(test|spec)\./.test(entry.name)) out.push(path);
  }
  return out;
}

/** Each is a way a second loading indicator has been drawn here before. */
const SPINNERS: { pattern: RegExp; what: string }[] = [
  { pattern: /animate-spin/, what: "a spinning element" },
  { pattern: /\b(Loader2?|LoaderCircle|LoaderPinwheel)(Icon)?\b/, what: "a lucide loader glyph" },
];

describe("the one loading indicator", () => {
  it("no source file draws a spinner of its own", () => {
    const offenders: string[] = [];
    for (const file of collectFiles(SRC_ROOT)) {
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, i) => {
        for (const { pattern, what } of SPINNERS) {
          if (pattern.test(line)) offenders.push(`${relative(REPO_ROOT, file)}:${i + 1} (${what})`);
        }
      });
    }
    expect(
      offenders,
      "Use <BannerLoader class=\"h-4\" /> (or AppButton's `loading` prop, or LoadingSpinner for a whole block) instead",
    ).toEqual([]);
  });
});

/** The declarations of `selector`'s rule, whitespace-normalised. */
function ruleBody(css: string, selector: string): string {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`no rule for ${selector}`);
  const open = css.indexOf("{", start);
  let depth = 1;
  let i = open + 1;
  for (; depth > 0; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}") depth--;
  }
  return css.slice(open + 1, i - 1).replace(/\s+/g, " ").trim();
}

describe("the boot splash copy of the loader", () => {
  const component = readFileSync(join(SRC_ROOT, "components/brand/BannerLoader.vue"), "utf8");
  // The splash names its keyframes apart so the two never collide on one page.
  const splash = readFileSync(join(REPO_ROOT, "index.html"), "utf8").replaceAll("boot-flag-sway", "dg-flag-sway");

  it.each([".dg-flag__rod", ".dg-flag__cloth", ".dg-flag__strip"])("draws %s as the component does", (selector) => {
    expect(ruleBody(splash, `#boot-splash ${selector}`)).toBe(ruleBody(component, selector));
  });

  it("sways as the component does", () => {
    expect(ruleBody(splash, "@keyframes dg-flag-sway")).toBe(ruleBody(component, "@keyframes dg-flag-sway"));
  });

  it("is cut as finely as the component cuts a flag that size", () => {
    const strips = splash.match(/class="dg-flag__strip"/g) ?? [];
    expect(strips).toHaveLength(MAX_STRIPS);
    expect(ruleBody(splash, "#boot-splash .dg-flag")).toContain(`--n: ${MAX_STRIPS};`);
  });
});
