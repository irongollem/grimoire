import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { extname, join, relative } from "node:path";

/**
 * `bg-background` is the page and nothing else (9 Oct 2026, #1031).
 *
 * Vellum paints its paper texture on every `.bg-background` element, so a row, well or
 * card that used the token as its fill showed the page's paper through as a button or
 * row fill (the quest thread rows were the first to be noticed). Nobody wrote a wrong
 * line; 100-odd sites each picked the nearest token. So it is held by a scan: a card on
 * the page is `bg-card`, a row or well inside one is `bg-muted/40`.
 *
 * Translucent `bg-background/NN` veils over content are not fills and are not scanned.
 * Comment lines are skipped, since they only talk about the token.
 */

const SRC_ROOT = join(import.meta.dirname, "../.."); // src/components/brand -> src
const REPO_ROOT = join(SRC_ROOT, "..");

/** Files that legitimately use `bg-background` because the element IS the page. */
const ALLOWED: Record<string, string> = {
  "src/layouts/DefaultLayout.vue": "the app shell is the page",
  "src/layouts/AuthLayout.vue": "full-page layout root",
  "src/layouts/PlayerLayout.vue": "full-page layout root",
  "src/views/NotFoundView.vue": "full-page view root",
  "src/views/soundboard/SpotifyCallbackView.vue": "full-page view root",
  "src/views/dev/ComponentCatalogueView.vue": "full-page view root",
  "src/components/npcs/NpcEditMobile.vue": "full-screen mobile editor root",
  "src/components/monsters/MonsterEditMobile.vue": "full-screen mobile editor root",
  "src/components/common/entity/EntitySheetMobile.vue": "the phone read sheets' page body",
  "src/components/npcs/NpcWebTopBar.vue": "page-edge top bar of the NPC web view",
  "src/components/common/list/ListPageLayout.vue": "sticky page header of a list page",
  "src/components/common/list/PageHeader.vue": "page header chrome",
  "src/components/common/feedback/RouteSkeleton.vue": "stands in for the page while a route loads",
  "src/components/scriptorium/ScriptoriumReader.vue": "the reader fills the whole page pane",
  "src/components/locations/AtlasMapZoom.vue": "opaque absolute inset-0 layer that replaces the map pane",
  "src/components/common/controls/fieldVariants.ts": "tone.default is the field-on-a-page recipe; Vellum overrides it",
};

const SCANNED_EXTENSIONS = new Set([".ts", ".vue"]);

function collectFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "generated") continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) collectFiles(path, out);
    else if (SCANNED_EXTENSIONS.has(extname(entry.name)) && !/\.(test|spec)\./.test(entry.name)) out.push(path);
  }
  return out;
}

/** `bg-background`, with or without a variant prefix, but not `bg-background/40` or `bg-background-x`. */
const OPAQUE_PAGE_FILL = /(?<![\w-])bg-background(?![\w/-])/;

describe("the page background token", () => {
  it("only the page itself uses bg-background as a fill", () => {
    const offenders: string[] = [];
    for (const file of collectFiles(SRC_ROOT)) {
      const rel = relative(REPO_ROOT, file);
      if (rel in ALLOWED) continue;
      readFileSync(file, "utf8")
        .split("\n")
        .forEach((line, i) => {
          if (/^\s*(\*|\/\/|\/\*)/.test(line)) return;
          if (OPAQUE_PAGE_FILL.test(line)) offenders.push(`${rel}:${i + 1}`);
        });
    }
    expect(
      offenders,
      "bg-background is the page. Use bg-card for a card on the page, bg-muted/40 for a row or well inside one.",
    ).toEqual([]);
  });

  it("every allowlisted file still exists and still uses the token", () => {
    for (const rel of Object.keys(ALLOWED)) {
      const text = readFileSync(join(REPO_ROOT, rel), "utf8");
      expect(OPAQUE_PAGE_FILL.test(text), `${rel} no longer uses bg-background; drop it from ALLOWED`).toBe(true);
    }
  });
});
