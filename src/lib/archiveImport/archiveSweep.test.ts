import { describe, expect, it, vi } from "vitest";
import type { EntityCandidate } from "@/lib/documentImport/entityMatching";
import type { InsertRowOutcome } from "@/lib/documentImport/runImportKind";
import type { LocationType } from "@/types/location.types";
import {
  runArchiveSweep,
  type ArchiveDecision,
  type ArchiveRecordKind,
  type ArchiveSweepDeps,
  type ArchiveSweepEntry,
  type ArchiveTable,
} from "./archiveSweep";
import type { ArchivePage, FrontmatterValue, TiptapNode } from "./types";

const CAMPAIGN = "11111111-1111-1111-1111-111111111111";

const text = (t: string): TiptapNode => ({ type: "text", text: t });
const link = (target: string, label: string): TiptapNode => ({ type: "archiveLink", attrs: { target, label } });
const para = (...content: TiptapNode[]): TiptapNode => ({ type: "paragraph", content });

function page(
  path: string,
  over: Partial<ArchivePage> & { content?: TiptapNode[]; fm?: Record<string, FrontmatterValue> } = {},
): ArchivePage {
  const { content, fm, ...rest } = over;
  const title = rest.title ?? (path.split("/").pop() ?? path).replace(/\.md$/, "");
  const body = { type: "doc" as const, content: content ?? [para(text(`About ${title}.`))] };
  return {
    ref: path,
    path,
    title,
    folders: path.split("/").slice(0, -1),
    parentRef: null,
    kind: "note",
    kindReason: "",
    tags: [],
    aliases: [],
    frontmatter: fm ?? {},
    body,
    links: [],
    notes: [],
    format: "markdown",
    ...rest,
  };
}

const entry = (p: ArchivePage, kind: ArchiveRecordKind, decision: ArchiveDecision = { action: "create" }): ArchiveSweepEntry => ({
  page: p,
  kind,
  decision,
});

interface Call {
  table: ArchiveTable;
  row: Record<string, unknown>;
  id: string;
}

function fakeDeps(over: Partial<ArchiveSweepDeps> = {}) {
  const inserts: Call[] = [];
  const updates: { table: ArchiveTable; id: string; patch: Record<string, unknown> }[] = [];
  let n = 0;
  const deps: ArchiveSweepDeps = {
    insertRow: vi.fn(async (table, row): Promise<InsertRowOutcome> => {
      const id = `${table}-${++n}`;
      inserts.push({ table, row, id });
      return { status: "inserted", id };
    }),
    updateRow: vi.fn(async (table, id, patch) => {
      updates.push({ table, id, patch });
      return { ok: true as const };
    }),
    locationTypes: vi.fn(async () => new Map<string, LocationType>()),
    ...over,
  };
  return { deps, inserts, updates };
}

const run = (entries: ArchiveSweepEntry[], deps: ArchiveSweepDeps, allPages?: ArchivePage[]) =>
  runArchiveSweep({ campaignId: CAMPAIGN, entries, allPages: allPages ?? entries.map((e) => e.page) }, deps);

describe("runArchiveSweep: order and parents", () => {
  it("creates places parent-first even when the child is listed first, with parent_id on the insert", async () => {
    const town = page("Places/Dunmere.md", { kind: "location", fm: { location_type: "town" } });
    const inn = page("Places/Dunmere/Fox Inn.md", { kind: "location", parentRef: town.ref, fm: { location_type: "tavern" } });
    const { deps, inserts } = fakeDeps();
    await run([entry(inn, "location"), entry(town, "location")], deps);
    expect(inserts.map((c) => c.row.name)).toEqual(["Dunmere", "Fox Inn"]);
    expect(inserts[0].row.parent_id).toBeUndefined();
    expect(inserts[1].row.parent_id).toBe(inserts[0].id);
  });

  it("creates places, factions, NPCs, items, quests, then notes", async () => {
    const pages = [
      entry(page("n.md", { kind: "note" }), "note"),
      entry(page("q.md", { kind: "quest" }), "quest"),
      entry(page("i.md", { kind: "item" }), "item"),
      entry(page("p.md", { kind: "npc" }), "npc"),
      entry(page("f.md", { kind: "faction" }), "faction"),
      entry(page("l.md", { kind: "location" }), "location"),
    ];
    const { deps, inserts } = fakeDeps();
    await run(pages, deps);
    expect(inserts.filter((c) => c.table !== "quest_beats").map((c) => c.table)).toEqual([
      "locations",
      "factions",
      "npcs",
      "items",
      "quests",
      "notes",
    ]);
  });

  it("survives a cycle of parents without looping", async () => {
    const a = page("a.md", { kind: "location", parentRef: "b.md" });
    const b = page("b.md", { kind: "location", parentRef: "a.md" });
    const { deps, inserts } = fakeDeps();
    await run([entry(a, "location"), entry(b, "location")], deps);
    expect(inserts).toHaveLength(2);
  });

  it("puts an NPC in the place its page nests under, created or linked", async () => {
    const town = page("Dunmere.md", { kind: "location" });
    const npc = page("Dunmere/Mara.md", { kind: "npc", parentRef: town.ref });
    const made = fakeDeps();
    await run([entry(npc, "npc"), entry(town, "location")], made.deps);
    expect(made.inserts.find((c) => c.table === "npcs")?.row.location_id).toBe("locations-1");

    const candidate: EntityCandidate = { targetId: "existing-place", source: "campaign", name: "Dunmere", matchKind: "exact", detail: null, distance: null };
    const linked = fakeDeps();
    await run([entry(npc, "npc"), entry(town, "location", { action: "link", candidate })], linked.deps);
    expect(linked.inserts).toHaveLength(1);
    expect(linked.inserts[0].row.location_id).toBe("existing-place");
  });

  it("downgrades an interior place with no building to sit in, and keeps one that has", async () => {
    const orphan = page("Cellar.md", { kind: "location", fm: { location_type: "room" } });
    const { deps, inserts } = fakeDeps();
    const report = await run([entry(orphan, "location")], deps);
    expect(inserts[0].row.location_type).toBe("other");
    expect(inserts[0].row.parent_id).toBeUndefined();
    expect(report.notes[0]).toContain("Cellar");

    const hall = page("Hall.md", { kind: "location", fm: { location_type: "building" } });
    const room = page("Hall/Cellar.md", { kind: "location", parentRef: hall.ref, fm: { location_type: "room" } });
    const ok = fakeDeps();
    await run([entry(hall, "location"), entry(room, "location")], ok.deps);
    expect(ok.inserts[1].row.location_type).toBe("room");
    expect(ok.inserts[1].row.parent_id).toBe(ok.inserts[0].id);
  });

  it("asks for the type of a linked place before deciding about an interior child", async () => {
    const hall = page("Hall.md", { kind: "location" });
    const room = page("Hall/Cellar.md", { kind: "location", parentRef: hall.ref, fm: { location_type: "room" } });
    const candidate: EntityCandidate = { targetId: "old-hall", source: "campaign", name: "Hall", matchKind: "exact", detail: null, distance: null };
    const { deps, inserts } = fakeDeps({ locationTypes: vi.fn(async () => new Map<string, LocationType>([["old-hall", "dungeon"]])) });
    await run([entry(hall, "location", { action: "link", candidate }), entry(room, "location")], deps);
    expect(inserts[0].row.location_type).toBe("room");
    expect(inserts[0].row.parent_id).toBe("old-hall");
  });
});

describe("runArchiveSweep: columns", () => {
  it("is DM-only and carries no AI provenance on any row", async () => {
    const { deps, inserts } = fakeDeps();
    await run(
      [
        entry(page("a.md", { kind: "npc" }), "npc"),
        entry(page("b.md", { kind: "location" }), "location"),
        entry(page("c.md", { kind: "faction" }), "faction"),
        entry(page("d.md", { kind: "item" }), "item"),
        entry(page("e.md", { kind: "quest" }), "quest"),
        entry(page("f.md", { kind: "note" }), "note"),
      ],
      deps,
    );
    for (const call of inserts) {
      expect(call.row).not.toHaveProperty("player_visible_to");
      expect(call.row).not.toHaveProperty("ai_provenance");
      expect(call.row.campaign_id).toBe(CAMPAIGN);
    }
  });

  it("stores bodies uncapped as Tiptap JSON and reads the frontmatter our own export writes", async () => {
    const long = "word ".repeat(400);
    const npc = page("Mara.md", {
      kind: "npc",
      content: [para(text(long))],
      tags: ["innkeeper"],
      fm: { race: "Halfling", occupation: "Innkeeper", alignment: "Neutral good", status: "Dead" },
    });
    const { deps, inserts } = fakeDeps();
    await run([entry(npc, "npc")], deps);
    const row = inserts[0].row;
    expect(row).toMatchObject({ name: "Mara", race: "Halfling", occupation: "Innkeeper", alignment: "Neutral good", status: "dead", tags: ["innkeeper"] });
    const backstory = JSON.parse(row.backstory as string) as { type: string; content: { content: { text: string }[] }[] };
    expect(backstory.type).toBe("doc");
    expect(backstory.content[0].content[0].text.length).toBeGreaterThan(1500);
  });

  it("ignores an enum value the table does not allow rather than inventing one", async () => {
    const npc = page("Mara.md", { kind: "npc", fm: { status: "retired" } });
    const item = page("Blade.md", { kind: "item", fm: { item_type: "weapon", rarity: "very rare" } });
    const { deps, inserts } = fakeDeps();
    await run([entry(npc, "npc"), entry(item, "item")], deps);
    expect(inserts[0].row).not.toHaveProperty("status");
    expect(inserts[1].row).toMatchObject({ item_type: "weapon", rarity: "very_rare" });
  });

  it("files a note under its frontmatter category when valid, else lore", async () => {
    const { deps, inserts } = fakeDeps();
    await run(
      [entry(page("a.md", { fm: { category: "session" } }), "note"), entry(page("b.md", { fm: { category: "dinner" } }), "note")],
      deps,
    );
    expect(inserts.map((c) => c.row.category)).toEqual(["session", "lore"]);
  });

  it("creates a quest with a one-line summary and puts the prose on an opening beat", async () => {
    const q = page("The Bell.md", {
      kind: "quest",
      content: [para(text("Something rings under the tide.")), para(text("Long prose for the DM."))],
    });
    const { deps, inserts } = fakeDeps();
    await run([entry(q, "quest")], deps);
    const quest = inserts.find((c) => c.table === "quests")!;
    const beat = inserts.find((c) => c.table === "quest_beats")!;
    expect(quest.row.summary).toBe("Something rings under the tide.");
    expect(quest.row.status).toBe("undiscovered");
    expect(beat.row).toMatchObject({ quest_id: quest.id, campaign_id: CAMPAIGN, visibility: "hidden" });
    expect(beat.row.dm_content).toContain("Long prose for the DM.");
  });
});

describe("runArchiveSweep: mentions", () => {
  it("writes labels in pass 1 and resolves links to place, NPC and faction mentions in pass 2", async () => {
    const town = page("Places/Dunmere.md", { kind: "location" });
    const guild = page("Factions/Harpers.md", { kind: "faction" });
    const mara = page("NPCs/Mara.md", {
      kind: "npc",
      content: [para(text("Lives in "), link("Places/Dunmere", "Dunmere"), text(" and serves "), link("Harpers", "the Harpers"), text("."))],
    });
    const { deps, inserts, updates } = fakeDeps();
    const report = await run([entry(mara, "npc"), entry(town, "location"), entry(guild, "faction")], deps);

    const pass1 = inserts.find((c) => c.table === "npcs")!;
    expect(pass1.row.backstory as string).toContain("Dunmere");
    expect(pass1.row.backstory as string).not.toContain("archiveLink");

    expect(updates).toHaveLength(1);
    const patch = JSON.parse(updates[0].patch.backstory as string) as { content: { content: TiptapNode[] }[] };
    const mentions = patch.content[0].content.filter((n) => n.type === "entityMention");
    expect(mentions.map((m) => m.attrs)).toEqual([
      { id: "locations-1", entityType: "location" },
      { id: "factions-2", entityType: "faction" },
    ]);
    expect(report.unresolvedLinks).toEqual([]);
  });

  it("points a mention at an existing record when the page was linked to one", async () => {
    const town = page("Dunmere.md", { kind: "location" });
    const mara = page("Mara.md", { kind: "npc", content: [para(link("Dunmere", "Dunmere"))] });
    const candidate: EntityCandidate = { targetId: "existing-place", source: "campaign", name: "Dunmere", matchKind: "exact", detail: null, distance: null };
    const { deps, updates } = fakeDeps();
    await run([entry(mara, "npc"), entry(town, "location", { action: "link", candidate })], deps);
    expect(updates[0].patch.backstory as string).toContain("existing-place");
  });

  it("leaves quests, items, notes, ignored pages and unknown targets as plain text, and reports them", async () => {
    const quest = page("Bell.md", { kind: "quest" });
    const sword = page("Blade.md", { kind: "item" });
    const gone = page("Gone.md", { kind: "npc" });
    const mara = page("Mara.md", {
      kind: "npc",
      content: [para(link("Bell", "the Bell"), link("Blade", "a blade"), link("Gone", "Gone"), link("Nowhere", "Nowhere"))],
    });
    const { deps, updates } = fakeDeps();
    const report = await run(
      [entry(mara, "npc"), entry(quest, "quest"), entry(sword, "item"), entry(gone, "npc", { action: "ignore" })],
      deps,
    );
    // Nothing resolved to a mention, so there is nothing to rewrite.
    expect(updates).toEqual([]);
    expect(report.unresolvedLinks.map((u) => [u.target, u.reason])).toEqual([
      ["Bell", "a quest cannot be mentioned"],
      ["Blade", "an item cannot be mentioned"],
      ["Gone", "that page was not imported"],
      ["Nowhere", "not found in this export"],
    ]);
  });

  it("resolves links in a quest's opening beat, and never writes a placeholder anywhere", async () => {
    const town = page("Dunmere.md", { kind: "location" });
    const quest = page("Bell.md", {
      kind: "quest",
      content: [para(text("A bell rings.")), para(text("Go to "), link("Dunmere", "Dunmere"), text("."))],
    });
    const { deps, inserts, updates } = fakeDeps();
    await run([entry(quest, "quest"), entry(town, "location")], deps);
    const beatUpdate = updates.find((u) => u.table === "quest_beats");
    expect(beatUpdate?.patch.dm_content as string).toContain("entityMention");
    const everything = JSON.stringify([...inserts, ...updates]);
    expect(everything).not.toContain("archiveLink");
  });

  it("does not touch pages linked to an existing record", async () => {
    const candidate: EntityCandidate = { targetId: "x", source: "campaign", name: "Mara", matchKind: "exact", detail: null, distance: null };
    const mara = page("Mara.md", { kind: "npc", content: [para(link("Mara", "Mara"))] });
    const { deps, inserts, updates } = fakeDeps();
    const report = await run([entry(mara, "npc", { action: "link", candidate })], deps);
    expect(inserts).toEqual([]);
    expect(updates).toEqual([]);
    expect(report.perKind.npc.linked).toBe(1);
  });
});

describe("runArchiveSweep: failures and quota", () => {
  it("reports a failed row and carries on with the rest", async () => {
    let calls = 0;
    const { deps } = fakeDeps({
      insertRow: vi.fn(async (): Promise<InsertRowOutcome> => {
        calls++;
        return calls === 1 ? { status: "failed", message: "boom" } : { status: "inserted", id: `id-${calls}` };
      }),
    });
    const report = await run([entry(page("a.md"), "note"), entry(page("b.md"), "note")], deps);
    expect(report.perKind.note).toMatchObject({ created: 1, failed: 1 });
    expect(report.failures).toEqual([{ ref: "a.md", title: "a", kind: "note", message: "boom" }]);
  });

  it("stops a kind at the plan limit without trying the rest, and imports the other kinds", async () => {
    const { deps } = fakeDeps({
      insertRow: vi.fn(async (table): Promise<InsertRowOutcome> =>
        table === "npcs" ? { status: "quota_exceeded" } : { status: "inserted", id: `${table}-ok` },
      ),
    });
    const report = await run(
      [entry(page("a.md"), "npc"), entry(page("b.md"), "npc"), entry(page("c.md"), "npc"), entry(page("d.md"), "note")],
      deps,
    );
    expect(deps.insertRow).toHaveBeenCalledTimes(2); // the first NPC (refused) and the note
    expect(report.perKind.npc).toMatchObject({ created: 0, failed: 3, stoppedAtQuota: true });
    expect(report.perKind.note.created).toBe(1);
  });

  it("reports a pass-2 write that fails against the page, not silently", async () => {
    const town = page("Dunmere.md", { kind: "location" });
    const mara = page("Mara.md", { kind: "npc", content: [para(link("Dunmere", "Dunmere"))] });
    const { deps } = fakeDeps({ updateRow: vi.fn(async () => ({ ok: false as const, message: "nope" })) });
    const report = await run([entry(mara, "npc"), entry(town, "location")], deps);
    expect(report.failures[0].message).toContain("nope");
    expect(report.perKind.npc.created).toBe(1);
  });

  it("counts ignored pages and writes nothing for them", async () => {
    const { deps, inserts } = fakeDeps();
    const report = await run([entry(page("a.md"), "note", { action: "ignore" })], deps);
    expect(inserts).toEqual([]);
    expect(report.perKind.note.ignored).toBe(1);
  });
});
