import { afterEach, describe, expect, it, vi } from "vitest";
import { manualSections, whatsNewPage } from "@/lib/rules/manualLoader";
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

  it("lists the announcements newest first, each with its action link", () => {
    const html = whatsNewPage().html;
    const byNewest = [...ANNOUNCEMENTS].sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : a.publishedAt > b.publishedAt ? -1 : 0));
    const positions = byNewest.map((a) => html.indexOf(`<h2>${a.title.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")}</h2>`));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    for (const a of ANNOUNCEMENTS.filter((x) => x.action)) expect(html).toContain(`href="${a.action!.to}"`);
    expect(html.split("<h2>").length - 1).toBe(ANNOUNCEMENTS.length);
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

  it("lists sections and the pages within them in ascending position", () => {
    const ascending = (list: number[]) => list.every((n, i) => i === 0 || list[i - 1]! <= n);
    expect(ascending(manualSections.map((s) => s.order))).toBe(true);
    expect(manualSections.filter((s) => !ascending(s.pages.map((p) => p.order))).map((s) => s.title)).toEqual([]);
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

describe("the What's New page, from a chosen list of announcements", () => {
  afterEach(() => {
    vi.doUnmock("@/lib/announcements");
    vi.resetModules();
  });

  async function pageFor(announcements: unknown[]) {
    vi.resetModules();
    vi.doMock("@/lib/announcements", () => ({ ANNOUNCEMENTS: announcements }));
    return (await import("@/lib/rules/manualLoader")).whatsNewPage();
  }

  it("puts the newest notice first and links an action", async () => {
    const page = await pageFor([
      { id: "old", title: "Older", body: "Old body", publishedAt: "2026-09-01" },
      { id: "new", title: "Newer", body: "New body", publishedAt: "2026-10-01", action: { label: "See it", to: "/quests" } },
    ]);
    expect(page.html.indexOf("Newer")).toBeLessThan(page.html.indexOf("Older"));
    expect(page.html).toContain('<a href="/quests">See it');
    expect(page.html.match(/<a href/g)).toHaveLength(1);
  });

  it("says so when nothing has been announced", async () => {
    expect((await pageFor([])).html).toBe("<p>Nothing announced yet.</p>");
  });
});
