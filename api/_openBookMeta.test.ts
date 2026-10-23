import { describe, expect, it, vi } from "vitest";
import type { PublicOpenBookMeta } from "../src/types/openBook.types";
import {
  applyTags,
  canonicalPath,
  chooseCard,
  escapeHtml,
  parseBookPath,
  renderBookPage,
  robotsContent,
  roman,
  statsLine,
} from "./_openBookMeta";

const INDEX = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Dungeon Grimoire</title>
    <meta name="description" content="D&D campaign manager for Dungeon Masters and players" />
    <meta property="og:site_name" content="Dungeon Grimoire" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="Dungeon Grimoire" />
    <meta property="og:description" content="D&D campaign manager. Free to start." />
    <meta property="og:image" content="https://dungeongrimoire.com/og.png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="Dungeon Grimoire: the toolkit" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="Dungeon Grimoire" />
    <meta name="twitter:description" content="D&D campaign manager. Free to start." />
    <meta name="twitter:image" content="https://dungeongrimoire.com/og.png" />
  </head>
  <body><div id="app"></div></body>
</html>`;

function meta(over: Partial<PublicOpenBookMeta> = {}): PublicOpenBookMeta {
  return {
    slug: "the-saltreach",
    allow_pdf: false,
    indexable: false,
    release: {
      number: 7,
      note: null,
      created_at: "2026-10-23T10:00:00Z",
      pdf_url: null,
      stats: { places: 64, folk: 41, factions: 3, pantheons: 1, deities: 4, lore: 9, sessions: 14, events: 30 },
    },
    snapshot: {
      v: 1,
      book: {
        title: "The Saltreach",
        subtitle: "Being an account of the drowned coast",
        cover_art: "tooled",
        cover_image_url: null,
        leather: "oxblood",
        chapters: ["atlas"],
        campaign_name: "Saltreach",
      },
      calendar: { calendar_id: null, custom_calendar: null, current: { year: null, month: null, day: null } },
    },
    sessions: [{ id: "n1", title: "The Lamp Goes Out", number: 14, image: null }],
    ...over,
  } as PublicOpenBookMeta;
}

describe("parseBookPath", () => {
  it("reads slug, chapter and entry", () => {
    expect(parseBookPath("the-saltreach")).toEqual({ slug: "the-saltreach", chapter: null, entryId: null });
    expect(parseBookPath("the-saltreach/atlas")).toEqual({ slug: "the-saltreach", chapter: "atlas", entryId: null });
    expect(parseBookPath("the-saltreach/folk/abc-123/")).toEqual({ slug: "the-saltreach", chapter: "folk", entryId: "abc-123" });
  });
  it("refuses empty, too deep, odd or badly encoded paths", () => {
    expect(parseBookPath("")).toBeNull();
    expect(parseBookPath(null)).toBeNull();
    expect(parseBookPath("a/b/c/d")).toBeNull();
    expect(parseBookPath("../etc")).toBeNull();
    expect(parseBookPath("book/%E0%A4%A")).toBeNull();
    expect(parseBookPath("-bad")).toBeNull();
    expect(parseBookPath("book/a b")).toBeNull();
  });
});

describe("escapeHtml", () => {
  it("escapes markup and quotes", () => {
    expect(escapeHtml(`<script>"a" & 'b'</script>`)).toBe("&lt;script&gt;&quot;a&quot; &amp; &#39;b&#39;&lt;/script&gt;");
  });
});

describe("roman / statsLine", () => {
  it("writes roman numerals", () => {
    expect([1, 4, 14, 49, 2026].map(roman)).toEqual(["I", "IV", "XIV", "XLIX", "MMXXVI"]);
    expect(roman(0)).toBe("0");
  });
  it("counts what exists", () => {
    expect(statsLine(meta().release.stats)).toBe("64 places · 41 people · 14 sessions");
    expect(statsLine({ ...meta().release.stats, places: 1, folk: 0, sessions: 0 })).toBe("1 place");
    expect(statsLine(undefined)).toBe("");
  });
});

describe("chooseCard", () => {
  it("describes the book for a book path", () => {
    const c = chooseCard({ slug: "the-saltreach", chapter: "atlas", entryId: null }, meta());
    expect(c.kind).toBe("book");
    expect(c.title).toBe("The Saltreach · an Open Book");
    expect(c.description).toBe("Being an account of the drowned coast. 64 places, 41 people, 14 sessions.");
    expect(c.imagePath).toBe("/api/open-book-card?slug=the-saltreach&v=7");
  });
  it("describes a session when chronicle/<id> is in the index", () => {
    const c = chooseCard({ slug: "the-saltreach", chapter: "chronicle", entryId: "n1" }, meta());
    expect(c.kind).toBe("session");
    expect(c.title).toBe("The Lamp Goes Out · The Saltreach");
    expect(c.description).toBe("Session XIV of The Saltreach, an Open Book.");
    expect(c.imagePath).toBe("/api/open-book-card?slug=the-saltreach&session=n1&v=7");
  });
  it("falls back to the book for an unknown session id or another chapter", () => {
    expect(chooseCard({ slug: "s", chapter: "chronicle", entryId: "zzz" }, meta()).kind).toBe("book");
    expect(chooseCard({ slug: "s", chapter: "folk", entryId: "n1" }, meta()).kind).toBe("book");
  });
  it("copes with a book that has no subtitle", () => {
    const m = meta();
    m.snapshot.book.subtitle = null;
    expect(chooseCard({ slug: "s", chapter: null, entryId: null }, m).description).toMatch(/^An Open Book of The Saltreach\./);
  });
});

describe("robotsContent", () => {
  it("is noindex unless the owner made the book indexable", () => {
    expect(robotsContent(meta())).toBe("noindex");
    expect(robotsContent(null)).toBe("noindex");
    expect(robotsContent(meta({ indexable: true }))).toBeNull();
  });
});

describe("applyTags", () => {
  const tags = {
    title: `Tom & "Jerry" <b>`,
    description: "It costs $& more",
    url: "https://app.example/w/x",
    image: "https://app.example/api/open-book-card?slug=x&v=1",
    imageAlt: "alt",
    robots: "noindex" as const,
  };
  const out = applyTags(INDEX, tags);

  it("replaces title, description and the og/twitter set, escaped", () => {
    expect(out).toContain("<title>Tom &amp; &quot;Jerry&quot; &lt;b&gt;</title>");
    expect(out).toContain('<meta property="og:title" content="Tom &amp; &quot;Jerry&quot; &lt;b&gt;" />');
    expect(out).toContain('<meta name="twitter:image" content="https://app.example/api/open-book-card?slug=x&amp;v=1" />');
    expect(out).toContain('<meta name="description" content="It costs $&amp; more" />');
    expect(out).not.toContain("dungeongrimoire.com/og.png");
    expect(out).not.toContain("<b>");
  });
  it("adds the tags index.html lacks, robots and canonical, each once", () => {
    expect(out.match(/property="og:url"/g)).toHaveLength(1);
    expect(out.match(/name="twitter:image:alt"/g)).toHaveLength(1);
    expect(out.match(/property="og:title"/g)).toHaveLength(1);
    expect(out.match(/name="robots" content="noindex"/g)).toHaveLength(1);
    expect(out).toContain('<link rel="canonical" href="https://app.example/w/x" />');
    expect(out.indexOf('name="robots"')).toBeLessThan(out.indexOf("</head>"));
  });
  it("leaves robots out for an indexable book and keeps the body", () => {
    const open = applyTags(INDEX, { ...tags, robots: null });
    expect(open).not.toContain('name="robots"');
    expect(open).toContain('<div id="app"></div>');
  });
});

describe("canonicalPath", () => {
  it("rebuilds the reader path", () => {
    expect(canonicalPath({ slug: "s", chapter: "chronicle", entryId: "n 1" })).toBe("/w/s/chronicle/n%201");
    expect(canonicalPath({ slug: "s", chapter: null, entryId: null })).toBe("/w/s");
  });
});

describe("renderBookPage", () => {
  const origin = "https://app.example";
  function upstream(metaBody: unknown, metaStatus = 200) {
    return vi.fn(async (input: string) => {
      if (input.endsWith("/index.html")) return new Response(INDEX, { status: 200 });
      return new Response(JSON.stringify(metaBody), { status: metaStatus });
    });
  }
  const req = (p: string) => new Request(`${origin}/api/open-book-page?path=${encodeURIComponent(p)}`);

  it("serves index.html with the book's tags and cache headers", async () => {
    const fetchImpl = upstream(meta());
    const res = await renderBookPage(req("the-saltreach"), "https://proj.supabase.co/", fetchImpl);
    const html = await res.text();
    expect(fetchImpl).toHaveBeenCalledWith("https://proj.supabase.co/functions/v1/open-book/the-saltreach?part=meta", expect.anything());
    expect(res.headers.get("Cache-Control")).toBe("public, s-maxage=300, stale-while-revalidate=600");
    expect(html).toContain("<title>The Saltreach · an Open Book</title>");
    expect(html).toContain('<meta property="og:image" content="https://app.example/api/open-book-card?slug=the-saltreach&amp;v=7" />');
    expect(html).toContain('href="https://app.example/w/the-saltreach"');
    expect(html).toContain('name="robots" content="noindex"');
  });
  it("uses the session and drops noindex for an indexable book", async () => {
    const res = await renderBookPage(req("the-saltreach/chronicle/n1"), "https://proj.supabase.co", upstream(meta({ indexable: true })));
    const html = await res.text();
    expect(html).toContain("<title>The Lamp Goes Out · The Saltreach</title>");
    expect(html).not.toContain('name="robots"');
  });
  it("returns the untouched page with noindex for a closed book", async () => {
    const res = await renderBookPage(req("nope"), "https://proj.supabase.co", upstream({ error: "not_found" }, 404));
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain("<title>Dungeon Grimoire</title>");
    expect(html).toContain('name="robots" content="noindex"');
    expect(html).not.toContain("canonical");
  });
  it("fails open when the meta call throws or the path is unusable", async () => {
    const boom = vi.fn(async (input: string) => {
      if (input.endsWith("/index.html")) return new Response(INDEX);
      throw new Error("down");
    });
    expect(await (await renderBookPage(req("the-saltreach"), "https://p.supabase.co", boom)).text()).toContain("<title>Dungeon Grimoire</title>");
    expect(await (await renderBookPage(req("../x"), "https://p.supabase.co", boom)).text()).toContain('name="robots"');
    expect(boom).toHaveBeenCalledTimes(3); // two index.html reads and one meta call (the bad path never reaches the network)
  });
  it("answers 503 if index.html itself cannot be had, and 405 for other methods", async () => {
    const dead = vi.fn(async () => new Response("", { status: 500 }));
    expect((await renderBookPage(req("x"), "https://p.supabase.co", dead)).status).toBe(503);
    expect((await renderBookPage(new Request(`${origin}/api/open-book-page`, { method: "POST" }), undefined, dead)).status).toBe(405);
  });
});
