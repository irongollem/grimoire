import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildManualIndex, renderManualModule } from "./buildIndex.ts";
import { MANUAL_PAGES } from "./manualPages.generated.ts";

const manualDir = join(import.meta.dirname, "..", "..", "..", "..", "src", "manual");
const files = readdirSync(manualDir)
  .filter((n) => n.endsWith(".md"))
  .map((name) => ({ name, raw: readFileSync(join(manualDir, name), "utf8") }));

describe("the generated manual index", () => {
  // Bug caught: a manual page edited (or added) without running `npm run manual:index`, so Ask answers from the old page.
  it("is what the Markdown in src/manual builds to; run `npm run manual:index` when this fails", () => {
    const committed = readFileSync(join(import.meta.dirname, "manualPages.generated.ts"), "utf8");
    expect(committed).toBe(renderManualModule(buildManualIndex(files)));
  });

  // Bug caught: a page lost in the build (a frontmatter parse that skips a file) so a question about it logs as a gap.
  it("holds every page, by the id the in-app manual uses", () => {
    expect(MANUAL_PAGES.map((p) => p.id)).toContain("worldbuilding-canon");
    expect(MANUAL_PAGES.length).toBe(files.length);
  });

  // Bug caught: the frontmatter shipped inside the body, so the model would read "section_order: 2" as manual text.
  it("strips the frontmatter from the body", () => {
    expect(MANUAL_PAGES.every((p) => !p.body.startsWith("---"))).toBe(true);
  });
});
