import { describe, expect, it } from "vitest";
import { manualSections } from "@/lib/rules/manualLoader";
import { ANNOUNCEMENTS } from "@/lib/announcements";

const pages = manualSections.flatMap((s) => s.pages);

describe("manual structure", () => {
  it("gives every page a unique id", () => {
    const ids = pages.map((p) => p.id);
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.length).toBe(new Set(ids).size);
  });

  it("strips YAML quotes from titles, sections and summaries", () => {
    const quoted = pages.filter((p) =>
      [p.title, p.summary ?? ""].some((v) => /^["']|["']$/.test(v)),
    );
    expect(quoted.map((p) => p.id)).toEqual([]);
  });

  it("lists every announcement on the What's New page", () => {
    const page = pages.find((p) => p.id === "whats-new");
    expect(page).toBeDefined();
    for (const a of ANNOUNCEMENTS) expect(page!.html).toContain(a.title);
  });

  it("gives every page a summary", () => {
    expect(pages.filter((p) => !p.summary).map((p) => p.id)).toEqual([]);
  });

  // The loader groups by section *name* and takes the section's position from
  // whichever page it meets first, so a page whose section_order disagrees with
  // its siblings silently reorders the whole sidebar. That is how Encounters
  // and Spells each ended up declared at two different positions.
  it("declares each section at one position only", () => {
    const split = manualSections
      .filter((s) => new Set(s.pages.map((p) => p.sectionOrder)).size > 1)
      .map((s) => `${s.title}: ${s.pages.map((p) => `${p.id}=${p.sectionOrder}`).join(", ")}`);
    expect(split).toEqual([]);
  });

  it("gives no two sections the same position", () => {
    const orders = manualSections.map((s) => s.order);
    expect(orders.length).toBe(new Set(orders).size);
  });

  it("gives no two pages in a section the same position", () => {
    const clashes = manualSections
      .filter((s) => new Set(s.pages.map((p) => p.order)).size < s.pages.length)
      .map((s) => s.title);
    expect(clashes).toEqual([]);
  });
});

describe("manual rendering", () => {
  // The wrapper is what scrolls a wide table on a phone; an unwrapped table
  // pushes the whole page sideways instead.
  it("wraps every table in a scroll container", () => {
    const unwrapped = pages.filter(
      (p) => p.html.split("<table>").length !== p.html.split('<div class="manual-table"><table>').length,
    );
    expect(unwrapped.map((p) => p.id)).toEqual([]);
  });
});

describe("manual cross-references", () => {
  // `[Quest Log](#quest-log)` — ManualTab treats the fragment as a page id.
  it("resolves every in-manual link to a real page", () => {
    const valid = new Set(pages.map((p) => p.id));
    const dangling = pages.flatMap((p) =>
      [...p.html.matchAll(/href="#([^"]*)"/g)]
        .filter(([, id]) => !valid.has(id))
        .map(([, id]) => `${p.id} → #${id}`),
    );
    expect(dangling).toEqual([]);
  });
});
