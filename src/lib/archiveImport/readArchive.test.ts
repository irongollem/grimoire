// @vitest-environment happy-dom
import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { buildMarkdownVault } from "@/lib/campaignExport/markdownVault";
import type { Faction } from "@/types/faction.types";
import type { Location } from "@/types/location.types";
import type { Npc } from "@/types/npc.types";
import type { Note } from "@/types/notes.types";
import type { PartyMember } from "@/types/party.types";
import type { Quest, QuestObjective } from "@/types/quest.types";
import { fieldsForKind } from "./fields";
import { findPageForLink, resolveArchiveLinks } from "./links";
import { ArchiveReadError, MAX_ARCHIVE_PAGES, readArchive } from "./readArchive";

const zip = (files: Record<string, string>, name = "export.zip") => ({
  name,
  bytes: zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)]))),
});
const loose = (name: string, text: string) => ({ name, bytes: strToU8(text) });
const doc = (text: string) => JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });
/** Test fixtures carry only the columns the vault reads; the cast stands in for the other thirty. */
const row = <T>(over: Partial<T>): T => over as T;

describe("round trip: our own Markdown vault", () => {
  const vault = buildMarkdownVault({
    campaignName: "Ashen Vale",
    exportedAt: new Date("2026-10-01T00:00:00Z"),
    npcs: [
      row<Npc>({
        id: "n1", name: "Elminster", race: "Human", tags: ["wizard"],
        appearance: doc("Grey beard."), personality: doc("Wry."), notes: doc("Knows the secret."),
        backstory: JSON.stringify({
          type: "doc",
          content: [{ type: "paragraph", content: [{ type: "text", text: "Born in " }, { type: "entityMention", attrs: { id: "l1", entityType: "location" } }, { type: "text", text: "." }] }],
        }),
      }),
    ],
    locations: [
      row<Location>({ id: "l1", name: "Shadowdale", location_type: "region", description: doc("A quiet dale."), tags: [] }),
      row<Location>({ id: "l2", name: "Old Mill", location_type: "building", parent_id: "l1", description: doc("Creaks."), tags: [] }),
    ],
    factions: [row<Faction>({ id: "f1", name: "Harpers", faction_type: "guild", alignment: null, description: doc("Secret agents."), tags: [] })],
    quests: [row<Quest>({ id: "q1", title: "The Bell", status: "active", summary: "Something rings under the tide.", parent_quest_id: null, tags: [] })],
    questObjectives: [row<QuestObjective>({ id: "o1", quest_id: "q1", description: "Find the bell", status: "pending", sort_order: 0 })],
    partyMembers: [row<PartyMember>({ id: "p1", name: "Aria", level: 5, notes: doc("Hero.") })],
    notes: [row<Note>({ id: "no1", title: "Session 1", category: "session", content: doc("They met."), tags: [], session_id: null })],
    sessions: [],
  });

  const result = readArchive([zip(vault)]);
  const page = (path: string) => {
    const p = result.pages.find((x) => x.path === path);
    if (!p) throw new Error(`no page ${path}`);
    return p;
  };

  it("detects our export, skips the README, and finds every entity file", () => {
    expect(result.source).toBe("grimoire");
    expect(result.skipped).toContainEqual({ path: "README.md", reason: "Grimoire export index" });
    expect(result.pages.map((p) => p.path).sort()).toEqual([
      "Factions/Harpers.md", "Locations/Old Mill.md", "Locations/Shadowdale.md", "NPCs/Elminster.md",
      "Notes/Session 1.md", "Party/Aria.md", "Quests/The Bell.md",
    ]);
  });

  it("recovers kinds, titles and the player-character skip", () => {
    expect(page("NPCs/Elminster.md")).toMatchObject({ kind: "npc", title: "Elminster", kindReason: "Grimoire export: npc" });
    expect(page("Locations/Shadowdale.md").kind).toBe("location");
    expect(page("Factions/Harpers.md").kind).toBe("faction");
    expect(page("Quests/The Bell.md").kind).toBe("quest");
    expect(page("Notes/Session 1.md").kind).toBe("note");
    expect(page("Party/Aria.md")).toMatchObject({ kind: "skip", kindReason: "player characters are not imported" });
  });

  it("recovers the parent from frontmatter and the h1-free body", () => {
    expect(page("Locations/Old Mill.md").parentRef).toBe("Locations/Shadowdale.md");
    expect(page("Locations/Shadowdale.md").parentRef).toBeNull();
    expect(JSON.stringify(page("NPCs/Elminster.md").body)).not.toContain('"heading","attrs":{"level":1}');
  });

  it("splits sections into the NPC columns", () => {
    const f = fieldsForKind(page("NPCs/Elminster.md"), "npc");
    if (f.kind !== "npc") throw new Error("kind");
    expect(JSON.stringify(f.appearance)).toContain("Grey beard.");
    expect(JSON.stringify(f.personality)).toContain("Wry.");
    expect(JSON.stringify(f.notes)).toContain("Knows the secret.");
    expect(JSON.stringify(f.backstory)).toContain("Born in");
    expect(page("NPCs/Elminster.md").tags).toEqual(["wizard"]);
  });

  it("recovers the wikilink and resolves it into a mention", () => {
    const elminster = page("NPCs/Elminster.md");
    expect(elminster.links).toEqual(["Locations/Shadowdale"]);
    const target = findPageForLink("Locations/Shadowdale", result.pages);
    expect(target?.ref).toBe("Locations/Shadowdale.md");
    const f = fieldsForKind(elminster, "npc");
    if (f.kind !== "npc" || !f.backstory) throw new Error("kind");
    const resolved = resolveArchiveLinks(f.backstory, (t) => (t === "Locations/Shadowdale" ? { id: "L1", entityType: "location" } : null));
    expect(JSON.stringify(resolved)).toContain('"entityMention","attrs":{"id":"L1","entityType":"location"}');
    expect(JSON.stringify(resolved)).not.toContain("archiveLink");
  });

  it("splits a quest into a plain summary and beat content", () => {
    const f = fieldsForKind(page("Quests/The Bell.md"), "quest");
    if (f.kind !== "quest") throw new Error("kind");
    expect(f.summary).toBe("Something rings under the tide.");
    expect(JSON.stringify(f.beatContent)).toContain("Find the bell");
  });
});

describe("Obsidian vault", () => {
  const files = {
    "My Vault/.obsidian/app.json": "{}",
    "My Vault/.DS_Store": "x",
    "My Vault/Characters/Bob.md": "---\naliases: [Bobby]\ntags: [ally]\n---\n# Bob\n\nFriend of [[Alice#History|Al]]. ![[map.png]] > see\n\n> [!note] Heads up\n> careful\n",
    "My Vault/Characters/Alice.md": "Alice knows [[Bob]] and [Town](../Places/Town.md).",
    "My Vault/Places/Town.md": "A town.\n\n- [x] visited",
    "My Vault/Places/Town/Inn.md": "# The Inn\n\nCosy.",
    "My Vault/Empty.md": "---\ntitle: Nothing\n---\n\n",
    "My Vault/map.png": "png",
    "My Vault/Stuff.canvas": "{}",
  };
  const result = readArchive([zip(files)]);
  const by = (path: string) => result.pages.find((p) => p.path === path);

  it("detects Obsidian, strips the vault root, and records skip reasons", () => {
    expect(result.source).toBe("obsidian");
    expect(result.sourceEvidence[0]).toMatch(/obsidian/i);
    expect(result.pages.map((p) => p.path).sort()).toEqual(["Characters/Alice.md", "Characters/Bob.md", "Places/Town.md", "Places/Town/Inn.md"]);
    const reasons = Object.fromEntries(result.skipped.map((s) => [s.path.split("/").pop(), s.reason]));
    expect(reasons).toMatchObject({ "app.json": "Obsidian settings", ".DS_Store": "hidden file", "map.png": "image attachment", "Empty.md": "empty page" });
    expect(reasons["Stuff.canvas"]).toBeDefined();
  });

  it("guesses kinds from folders and keeps aliases and tags", () => {
    expect(by("Characters/Bob.md")).toMatchObject({ kind: "npc", kindReason: "folder: Characters", aliases: ["Bobby"], tags: ["ally"], title: "Bob" });
    expect(by("Places/Town.md")?.kind).toBe("location");
    expect(by("Places/Town/Inn.md")?.title).toBe("The Inn");
  });

  it("builds wikilink and markdown-link placeholders, drops embeds with a note", () => {
    expect(by("Characters/Bob.md")?.links).toEqual(["Alice"]);
    expect(by("Characters/Bob.md")?.notes).toEqual(["1 embed dropped"]);
    expect(by("Characters/Alice.md")?.links).toEqual(["Bob", "Places/Town"]);
    expect(JSON.stringify(by("Characters/Bob.md")?.body)).toContain('"label":"Al"');
  });

  it("nests a page under its folder note", () => {
    expect(by("Places/Town/Inn.md")?.parentRef).toBe("Places/Town.md");
    expect(by("Places/Town.md")?.parentRef).toBeNull();
  });

  it("accepts loose files with and without folders", () => {
    const r = readArchive([loose("Locations/Keep.md", "A keep."), loose("note.md", "Hello")]);
    expect(r.pages.map((p) => [p.path, p.kind])).toEqual([["Locations/Keep.md", "location"], ["note.md", "note"]]);
  });
});

describe("HTML exports", () => {
  const index = `<html><body><nav>x</nav><h1>World</h1><a href="npcs/bob.html">Bob</a><a href="places/town.html">Town</a><a href="a.html">A</a></body></html>`;
  const bob = `<html><head><title>Bob - World</title></head><body>
    <header>Site</header><nav><a href="../index.html">Home</a></nav>
    <main><h1>Bob the Bold</h1><p>Lives in <a href="../places/town.html#top">Town</a>, hates <a href="https://ex.test">spam</a>.</p><img src="a.png"><h2>Secrets</h2><ul><li>one</li></ul></main>
    <footer>©</footer><script>alert(1)</script></body></html>`;
  const town = `<html><body><article><h1>Town</h1><p>A town.</p></article></body></html>`;
  const files = { "export/index.html": index, "export/css/site.css": "x", "export/js/a.js": "x", "export/npcs/bob.html": bob, "export/places/town.html": town };
  const result = readArchive([zip(files)]);

  it("detects LegendKeeper by layout and skips the navigation index", () => {
    expect(result.source).toBe("legendkeeper");
    expect(result.skipped).toContainEqual({ path: "index.html", reason: "index page (navigation only)" });
    expect(result.pages.map((p) => p.path)).toEqual(["npcs/bob.html", "places/town.html"]);
  });

  it("takes main content, the h1 as title, and strips chrome and scripts", () => {
    const p = result.pages[0];
    expect(p.title).toBe("Bob the Bold");
    const body = JSON.stringify(p.body);
    expect(body).not.toContain("Site");
    expect(body).not.toContain("alert");
    expect(body).not.toContain("Bob the Bold");
    expect(body).toContain("Secrets");
    expect(p.kind).toBe("npc");
    expect(p.notes).toEqual(["1 image not imported"]);
  });

  it("turns internal links into placeholders and external links into plain text", () => {
    const p = result.pages[0];
    expect(p.links).toEqual(["places/town"]);
    expect(findPageForLink("places/town", result.pages)?.title).toBe("Town");
    expect(JSON.stringify(p.body)).toContain("spam");
    expect(JSON.stringify(p.body)).not.toContain("ex.test");
  });
});

describe("World Anvil", () => {
  it("uses article JSON only as a classification hint for the page with the same title", () => {
    const article = JSON.stringify({ articles: [{ title: "Waterdeep", slug: "waterdeep", entityClass: "Settlement" }] });
    const result = readArchive([
      zip({
        "wa/articles/waterdeep.json": article,
        "wa/html/waterdeep.html": "<html><body><main><h1>Waterdeep</h1><p>City of Splendours.</p></main></body></html>",
        "wa/html/lore.html": "<html><body><main><h1>Lore</h1><p>Old.</p></main></body></html>",
      }),
    ]);
    expect(result.source).toBe("worldanvil");
    const city = result.pages.find((p) => p.title === "Waterdeep");
    expect(city).toMatchObject({ kind: "location", kindReason: "World Anvil template: Settlement" });
    expect(result.pages.find((p) => p.title === "Lore")?.kind).toBe("note");
    expect(result.skipped.some((s) => s.path.endsWith("waterdeep.json") && /World Anvil/.test(s.reason))).toBe(true);
  });
});

describe("limits", () => {
  it("refuses more pages than an archive row may hold", () => {
    const files: Record<string, string> = {};
    for (let i = 0; i <= MAX_ARCHIVE_PAGES; i++) files[`p${i}.md`] = `Page ${i}`;
    expect(() => readArchive([zip(files)])).toThrowError(ArchiveReadError);
    try {
      readArchive([zip(files)]);
    } catch (e) {
      expect(e).toMatchObject({ code: "too_many_pages" });
    }
  });

  it("refuses an archive that unpacks past the size guard, before inflating it", () => {
    const big = "a".repeat(1024 * 1024);
    const files: Record<string, string> = {};
    for (let i = 0; i < 101; i++) files[`p${i}.md`] = big;
    expect(() => readArchive([zip(files)])).toThrowError(expect.objectContaining({ code: "too_large" }));
  });

  it("reports a corrupt zip clearly", () => {
    expect(() => readArchive([{ name: "x.zip", bytes: strToU8("not a zip") }])).toThrowError(expect.objectContaining({ code: "unreadable_zip" }));
  });
});
