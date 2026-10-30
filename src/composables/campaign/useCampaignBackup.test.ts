import { beforeEach, describe, expect, it, vi } from "vitest";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});

type Inserted = { table: string; rows: Record<string, unknown>[] };
const inserted: Inserted[] = [];
const downloads: { blob: Blob; name: string }[] = [];

// The restore writes through supabase; the fake stores what is inserted and the
// wrapper records each insert in order, so the remap can be read back.
vi.mock("@/lib/supabase", () => ({
  getCurrentUser: () => ({ id: "restorer" }),
  supabase: {
    from: (table: string) => {
      const query = fake.client.from(table);
      const insert = query.insert.bind(query);
      query.insert = (rows: Record<string, unknown> | Record<string, unknown>[], options?: unknown) => {
        inserted.push({ table, rows: Array.isArray(rows) ? rows : [rows] });
        return insert(rows, options);
      };
      return query;
    },
  },
}));
vi.mock("@/lib/downloadBlob", () => ({ downloadBlob: (blob: Blob, name: string) => void downloads.push({ blob, name }) }));
vi.mock("@/composables/campaign/useCampaigns", () => ({
  disposeHomebrewAndDeleteCampaign: vi.fn(),
}));

import { flushPromises, mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { defineComponent } from "vue";
import {
  assertBackupCarriesCharacterEditions,
  executeImport,
  useExportCampaign,
  type GrimoireBackup,
} from "./useCampaignBackup";

/** A backup with every collection empty unless a test fills it. */
function backupWith(over: Record<string, unknown>): GrimoireBackup {
  const base: Record<string, unknown> = {
    version: "2",
    file_type: "backup",
    campaign: { id: "old-camp", name: "Old" },
    ...over,
  };
  return new Proxy(base, {
    get: (t, k) => (k in t ? t[k as string] : []),
  }) as unknown as GrimoireBackup;
}

const member = { id: "pm-1", name: "Brannor", ruleset: "2024" };
const customPin = {
  id: "cc-1",
  party_member_id: "pm-1",
  class_definition_id: "def-1",
  class_definition_kind: "custom",
  subclass_definition_id: "sub-1",
  subclass_name: "Ash",
};

describe("assertBackupCarriesCharacterEditions definitions", () => {
  it("accepts a custom pin whose class and subclass are carried", () => {
    const backup = backupWith({
      party_members: [member],
      character_classes: [customPin],
      custom_classes: [{ id: "def-1" }],
      custom_subclasses: [{ id: "sub-1" }],
    });
    expect(() => assertBackupCarriesCharacterEditions(backup)).not.toThrow();
  });

  it("refuses a backup lacking the definition arrays", () => {
    const backup = {
      party_members: [member],
      character_classes: [],
    } as unknown as GrimoireBackup;
    expect(() => assertBackupCarriesCharacterEditions(backup)).toThrow(/class definitions/);
  });

  it("refuses a pin to a class the backup does not carry", () => {
    const backup = backupWith({
      party_members: [member],
      character_classes: [{ ...customPin, subclass_definition_id: null }],
      custom_classes: [{ id: "other" }],
      custom_subclasses: [],
    });
    expect(() => assertBackupCarriesCharacterEditions(backup)).toThrow(/incomplete: 1 character class/);
  });

  it("refuses a pin to a subclass the backup does not carry", () => {
    const backup = backupWith({
      party_members: [member],
      character_classes: [customPin],
      custom_classes: [{ id: "def-1" }],
      custom_subclasses: [],
    });
    expect(() => assertBackupCarriesCharacterEditions(backup)).toThrow(/incomplete/);
  });
});

describe("executeImport restored campaign", () => {
  beforeEach(() => {
    inserted.length = 0;
    fake.reset();
  });

  it("is the restorer's own new campaign: renamed, unarchived, with fresh feed token and none of the old secrets", async () => {
    const backup = backupWith({
      campaign: {
        id: "old-camp",
        name: "Old",
        user_id: "original-dm",
        is_archived: true,
        ical_token: "old-token",
        openai_api_key: "sk-old",
        anthropic_api_key: "sk-ant-old",
        gemini_api_key: "g-old",
        spotify_client_id: "sp-old",
        ruleset: "2024",
      },
    });
    const campaign = (await executeImport(backup, "Restored")) as { id: string };
    const row = inserted.find((i) => i.table === "campaigns")!.rows[0];
    expect(row).toMatchObject({
      user_id: "restorer",
      name: "Restored",
      is_archived: false,
      openai_api_key: null,
      anthropic_api_key: null,
      gemini_api_key: null,
      spotify_client_id: null,
      ruleset: "2024",
    });
    expect(row.id).not.toBe("old-camp");
    expect(row.id).toBe(campaign.id);
    expect(row.ical_token).not.toBe("old-token");
  });

  it("restores characters under the restorer with no player linked, since players re-link after an import", async () => {
    const backup = backupWith({
      party_members: [{ ...member, user_id: "original-dm", owner_user_id: "a-player", campaign_id: "old-camp" }],
    });
    const campaign = (await executeImport(backup, "Restored")) as { id: string };
    const restored = inserted.find((i) => i.table === "party_members")!.rows[0];
    expect(restored).toMatchObject({ user_id: "restorer", owner_user_id: null, campaign_id: campaign.id });
    expect(restored.id).not.toBe("pm-1");
  });
});

describe("executeImport class definitions", () => {
  beforeEach(() => {
    inserted.length = 0;
    fake.reset();
  });

  it("restores definitions into the new campaign before the characters, and remaps the pins", async () => {
    const backup = backupWith({
      party_members: [member],
      character_classes: [customPin],
      custom_classes: [{ id: "def-1", campaign_id: null, user_id: "someone", class_name: "Tinkerer", created_at: "x" }],
      custom_subclasses: [{ id: "sub-1", campaign_id: "old-camp", user_id: "someone", subclass_name: "Ash", created_at: "x" }],
    });
    const campaign = await executeImport(backup, "Restored");
    const tables = inserted.map((i) => i.table);
    expect(tables.indexOf("custom_classes")).toBeLessThan(tables.indexOf("character_classes"));
    expect(tables.indexOf("custom_subclasses")).toBeLessThan(tables.indexOf("character_classes"));

    const cls = inserted.find((i) => i.table === "custom_classes")!.rows[0];
    const sub = inserted.find((i) => i.table === "custom_subclasses")!.rows[0];
    expect(cls.id).not.toBe("def-1");
    expect(cls.campaign_id).toBe((campaign as { id: string }).id);
    expect(cls.user_id).toBe("restorer");
    expect(cls).not.toHaveProperty("created_at");
    expect(sub.campaign_id).toBe((campaign as { id: string }).id);

    const pin = inserted.find((i) => i.table === "character_classes")!.rows[0];
    expect(pin.class_definition_id).toBe(cls.id);
    expect(pin.subclass_definition_id).toBe(sub.id);
  });
});

describe("executeImport scriptorium document audience", () => {
  beforeEach(() => {
    inserted.length = 0;
    fake.reset();
  });

  it("remaps player_visible_to onto the restored party, exactly as notes do", async () => {
    const backup = backupWith({
      party_members: [member],
      notes: [{ id: "note-1", player_visible_to: ["pm-1", "pm-gone"] }],
      scriptorium_documents: [
        { id: "doc-1", title: "Handout", player_visible_to: ["pm-1", "pm-gone"] },
      ],
    });
    await executeImport(backup, "Restored");
    const pm = inserted.find((i) => i.table === "party_members")!.rows[0];
    const doc = inserted.find((i) => i.table === "scriptorium_documents")!.rows[0];
    const note = inserted.find((i) => i.table === "notes")!.rows[0];
    expect(pm.id).not.toBe("pm-1");
    expect((doc.player_visible_to as string[])[0]).toBe(pm.id);
    // An id the backup cannot map is handled the same way as on notes.
    expect(doc.player_visible_to).toEqual(note.player_visible_to);
  });
});

describe("executeImport scriptorium chapters", () => {
  beforeEach(() => {
    inserted.length = 0;
    fake.reset();
  });

  const mention = (id: string) => ({ type: "paragraph", content: [{ type: "entityMention", attrs: { entityType: "npc", id } }] });
  const bodyWith = (...blocks: unknown[]) => ({ type: "doc", content: blocks });

  it("restores the chapters under the restored book's new id, books before chapters", async () => {
    const backup = backupWith({
      scriptorium_documents: [{ id: "doc-1", title: "Handbook", kind: "book", player_visible_to: [] }],
      scriptorium_chapters: [
        { id: "ch-1", document_id: "doc-1", position: 0, title: "", word_count: 0, content: bodyWith({ type: "paragraph" }) },
        { id: "ch-2", document_id: "doc-1", position: 1, title: "", word_count: 0, content: bodyWith({ type: "paragraph" }) },
      ],
    });
    await executeImport(backup, "Restored");
    const tables = inserted.map((i) => i.table);
    expect(tables.indexOf("scriptorium_documents")).toBeLessThan(tables.indexOf("scriptorium_chapters"));
    const book = inserted.find((i) => i.table === "scriptorium_documents")!.rows[0];
    const chapters = inserted.find((i) => i.table === "scriptorium_chapters")!.rows;
    expect(book.id).not.toBe("doc-1");
    expect(chapters.map((c) => c.document_id)).toEqual([book.id, book.id]);
    expect(chapters.map((c) => c.id)).not.toContain("ch-1");
  });

  it("points a restored chapter's mention at the restored NPC, not the old campaign's", async () => {
    const backup = backupWith({
      npcs: [{ id: "npc-1", name: "Mira" }],
      scriptorium_documents: [{ id: "doc-1", title: "Handout", player_visible_to: [] }],
      scriptorium_chapters: [
        { id: "ch-1", document_id: "doc-1", position: 0, title: "", word_count: 0, content: bodyWith(mention("npc-1")) },
      ],
    });
    await executeImport(backup, "Restored");
    const npc = inserted.find((i) => i.table === "npcs")!.rows[0];
    const chapter = inserted.find((i) => i.table === "scriptorium_chapters")!.rows[0];
    const node = (chapter.content as { content: { content: { attrs: { id: string } }[] }[] }).content[0].content[0];
    expect(node.attrs.id).toBe(npc.id);
    expect(npc.id).not.toBe("npc-1");
  });

  it("a page-anchored picture follows its chapter to the new id", async () => {
    const backup = backupWith({
      scriptorium_documents: [
        {
          id: "doc-1", title: "Handbook", player_visible_to: [],
          page_furniture: [{ id: "fx", kind: "watermark", anchor: { type: "page", chapterId: "ch-2", page: 1 }, x: 0, y: 0, width: 30, z: "under", props: {} }],
        },
      ],
      scriptorium_chapters: [
        { id: "ch-1", document_id: "doc-1", position: 0, title: "", word_count: 0, content: bodyWith({ type: "paragraph" }) },
        { id: "ch-2", document_id: "doc-1", position: 1, title: "", word_count: 0, content: bodyWith({ type: "paragraph" }) },
      ],
    });
    await executeImport(backup, "Restored");
    const book = inserted.find((i) => i.table === "scriptorium_documents")!.rows[0];
    const chapters = inserted.find((i) => i.table === "scriptorium_chapters")!.rows;
    const anchor = (book.page_furniture as { anchor: { chapterId: string } }[])[0].anchor;
    expect(anchor.chapterId).toBe(chapters[1].id);
  });

  it("an old backup with document content restores as one chapter each, mentions remapped", async () => {
    const backup = backupWith({
      npcs: [{ id: "npc-1", name: "Mira" }],
      scriptorium_documents: [
        { id: "doc-old", title: "Old", player_visible_to: [], content: JSON.stringify(bodyWith(mention("npc-1"))) },
      ],
    });
    await executeImport(backup, "Restored");
    const npc = inserted.find((i) => i.table === "npcs")!.rows[0];
    const book = inserted.find((i) => i.table === "scriptorium_documents")!.rows[0];
    const chapters = inserted.find((i) => i.table === "scriptorium_chapters")!.rows;
    expect(book).not.toHaveProperty("content");
    expect(chapters).toHaveLength(1);
    expect(chapters[0].document_id).toBe(book.id);
    const node = (chapters[0].content as { content: { content: { attrs: { id: string } }[] }[] }).content[0].content[0];
    expect(node.attrs.id).toBe(npc.id);
  });
});

describe("executeImport session log", () => {
  beforeEach(() => {
    inserted.length = 0;
    fake.reset();
  });

  it("restores the log before the notes and proposals that point into it", async () => {
    const backup = backupWith({
      campaign_sessions: [{ id: "s-1", campaign_id: "old-camp", user_id: "x", number: 3, started_at: null, ended_at: null }],
      notes: [{ id: "note-1", category: "session", session_id: "s-1" }],
      session_proposals: [{ id: "sp-1", session_id: "s-1" }],
    });
    await executeImport(backup, "Restored");
    const tables = inserted.map((i) => i.table);
    expect(tables.indexOf("campaign_sessions")).toBeLessThan(tables.indexOf("notes"));
    expect(tables.indexOf("campaign_sessions")).toBeLessThan(tables.indexOf("session_proposals"));

    const session = inserted.find((i) => i.table === "campaign_sessions")!.rows[0];
    const note = inserted.find((i) => i.table === "notes")!.rows[0];
    const proposal = inserted.find((i) => i.table === "session_proposals")!.rows[0];
    expect(session.id).not.toBe("s-1");
    expect(note.session_id).toBe(session.id);
    expect(proposal.session_id).toBe(session.id);
  });

  it("remaps a discovered monster's session onto the restored log", async () => {
    const backup = backupWith({
      campaign_sessions: [{ id: "s-1", campaign_id: "old-camp", user_id: "x", number: 3, started_at: null, ended_at: null }],
      discovered_monsters: [{ id: "dm-1", campaign_id: "old-camp", visible_to: [], session_id: "s-1" }],
    });
    await executeImport(backup, "Restored");
    const session = inserted.find((i) => i.table === "campaign_sessions")!.rows[0];
    const found = inserted.find((i) => i.table === "discovered_monsters")!.rows[0];
    expect(found.session_id).toBe(session.id);
  });
});

describe("executeImport quest clocks (#1011)", () => {
  beforeEach(() => {
    inserted.length = 0;
    fake.reset();
  });

  const clock = {
    id: "clock-1", campaign_id: "old-camp", quest_id: "q-1", label: "The count", segments: 6,
    filled: 4, sort_order: 0, created_by: "someone", created_at: "x", updated_at: "x",
  };

  it("restores a clock into the new quest with only the columns a client may write", async () => {
    const backup = backupWith({ quests: [{ id: "q-1", campaign_id: "old-camp" }], quest_clocks: [clock] });
    const campaign = await executeImport(backup, "Restored");
    const quest = inserted.find((i) => i.table === "quests")!.rows[0];
    const restored = inserted.find((i) => i.table === "quest_clocks")!.rows[0];
    expect(restored.id).not.toBe("clock-1");
    expect(restored.quest_id).toBe(quest.id);
    expect(restored.campaign_id).toBe((campaign as { id: string }).id);
    expect(Object.keys(restored).sort()).toEqual(["campaign_id", "id", "label", "quest_id", "segments", "sort_order"]);
  });

  it("remaps every clock, place and faction a consequence names, after the clock exists", async () => {
    const backup = backupWith({
      quests: [{ id: "q-1", campaign_id: "old-camp" }],
      quest_clocks: [clock],
      locations: [{ id: "loc-1", campaign_id: "old-camp" }],
      factions: [{ id: "fac-1", campaign_id: "old-camp" }],
      quest_consequences: [
        { id: "qc-1", quest_id: "q-1", on_clock_id: "clock-1", on_location_id: null, action: "shift_faction_standing", target_faction_id: "fac-1", target_clock_id: null, target_location_id: null },
        { id: "qc-2", quest_id: "q-1", on_clock_id: null, on_location_id: "loc-1", action: "tick_clock", target_clock_id: "clock-1", target_faction_id: null, target_location_id: null },
      ],
    });
    await executeImport(backup, "Restored");
    const tables = inserted.map((i) => i.table);
    expect(tables.indexOf("quest_clocks")).toBeLessThan(tables.indexOf("quest_consequences"));
    const newClock = inserted.find((i) => i.table === "quest_clocks")!.rows[0];
    const newFaction = inserted.find((i) => i.table === "factions")!.rows[0];
    const newLocation = inserted.find((i) => i.table === "locations")!.rows[0];
    const [fill, tick] = inserted.find((i) => i.table === "quest_consequences")!.rows;
    expect(fill.on_clock_id).toBe(newClock.id);
    expect(fill.target_faction_id).toBe(newFaction.id);
    expect(tick.target_clock_id).toBe(newClock.id);
    expect(tick.on_location_id).toBe(newLocation.id);
  });
});

describe("executeImport NPC memories (#1019)", () => {
  beforeEach(() => {
    inserted.length = 0;
    fake.reset();
  });

  const memory = {
    id: "mem-1",
    campaign_id: "old-camp",
    npc_id: "npc-1",
    session_id: "s-1",
    kind: "promise",
    body: "Swore to keep the ferry open.",
    party_member_ids: ["pm-1", "pm-gone"],
    player_visible_to: ["pm-1"],
  };

  it("remaps the NPC, session and both audience arrays onto the restored rows", async () => {
    const backup = backupWith({
      party_members: [member],
      npcs: [{ id: "npc-1", name: "Bram" }],
      campaign_sessions: [{ id: "s-1", campaign_id: "old-camp", user_id: "x", number: 1, started_at: null, ended_at: null }],
      npc_memories: [memory],
    });
    await executeImport(backup, "Restored");
    const tables = inserted.map((i) => i.table);
    for (const parent of ["npcs", "party_members", "campaign_sessions"]) {
      expect(tables.indexOf(parent)).toBeLessThan(tables.indexOf("npc_memories"));
    }
    const pm = inserted.find((i) => i.table === "party_members")!.rows[0];
    const npc = inserted.find((i) => i.table === "npcs")!.rows[0];
    const session = inserted.find((i) => i.table === "campaign_sessions")!.rows[0];
    const row = inserted.find((i) => i.table === "npc_memories")!.rows[0];
    expect(row.id).not.toBe("mem-1");
    expect(row.user_id).toBe("restorer");
    expect(row.npc_id).toBe(npc.id);
    expect(row.session_id).toBe(session.id);
    expect((row.party_member_ids as string[])[0]).toBe(pm.id);
    expect(row.player_visible_to).toEqual([pm.id]);
  });

  it("remaps the secret's entity and keeps the block id", async () => {
    const backup = backupWith({
      locations: [{ id: "loc-1", name: "Crypt" }],
      npcs: [{ id: "npc-1", name: "Bram" }],
      npc_memories: [
        { ...memory, secret_entity_type: "location", secret_entity_id: "loc-1", secret_id: "11111111-1111-4111-8111-111111111111" },
      ],
    });
    await executeImport(backup, "Restored");
    const loc = inserted.find((i) => i.table === "locations")!.rows[0];
    const row = inserted.find((i) => i.table === "npc_memories")!.rows[0];
    expect(row.secret_entity_id).toBe(loc.id);
    expect(row.secret_id).toBe("11111111-1111-4111-8111-111111111111");
  });

  it("drops the secret reference when its entity is not part of the backup", async () => {
    const backup = backupWith({
      npcs: [{ id: "npc-1", name: "Bram" }],
      npc_memories: [
        { ...memory, secret_entity_type: "item", secret_entity_id: "item-1", secret_id: "11111111-1111-4111-8111-111111111111" },
      ],
    });
    await executeImport(backup, "Restored");
    const row = inserted.find((i) => i.table === "npc_memories")!.rows[0];
    expect(row.secret_entity_type).toBeNull();
    expect(row.secret_entity_id).toBeNull();
    expect(row.secret_id).toBeNull();
  });

  it("restores a backup that predates the ledger without writing any memories", async () => {
    const base: Record<string, unknown> = { version: "2", file_type: "backup", campaign: { id: "old-camp", name: "Old" } };
    const old = new Proxy(base, {
      get: (t, k) => (k === "npc_memories" ? undefined : k in t ? t[k as string] : []),
    }) as unknown as GrimoireBackup;
    await executeImport(old, "Restored");
    expect(inserted.some((i) => i.table === "npc_memories")).toBe(false);
  });
});

describe("executeImport kin links (#1083)", () => {
  beforeEach(() => {
    inserted.length = 0;
    fake.reset();
  });

  it("remaps both ends of a kin link onto the restored NPCs and party members", async () => {
    const backup = backupWith({
      party_members: [member],
      npcs: [{ id: "npc-1", name: "Bram" }, { id: "npc-2", name: "Wren" }],
      kin_links: [
        { id: "k-1", user_id: "x", campaign_id: "old-camp", from_npc_id: "npc-1", from_party_member_id: null, to_npc_id: "npc-2", to_party_member_id: null, kind: "parent" },
        { id: "k-2", user_id: "x", campaign_id: "old-camp", from_npc_id: "npc-1", from_party_member_id: null, to_npc_id: null, to_party_member_id: "pm-1", kind: "parent" },
      ],
    });
    await executeImport(backup, "Restored");
    const tables = inserted.map((i) => i.table);
    expect(tables.indexOf("npcs")).toBeLessThan(tables.indexOf("kin_links"));
    expect(tables.indexOf("party_members")).toBeLessThan(tables.indexOf("kin_links"));
    const [npc1, npc2] = inserted.find((i) => i.table === "npcs")!.rows;
    const pm = inserted.find((i) => i.table === "party_members")!.rows[0];
    const [a, b] = inserted.find((i) => i.table === "kin_links")!.rows;
    expect(a).toMatchObject({ from_npc_id: npc1.id, to_npc_id: npc2.id, user_id: "restorer" });
    expect(a.id).not.toBe("k-1");
    expect(b).toMatchObject({ from_npc_id: npc1.id, to_party_member_id: pm.id });
  });

  it("restores a backup from before family trees: family and sibling bonds become kin, not refused bonds", async () => {
    const backup = backupWith({
      npcs: [{ id: "npc-1", name: "Bram" }, { id: "npc-2", name: "Wren" }, { id: "npc-3", name: "Ida" }],
      npc_relationships: [
        { id: "r-1", npc_id: "npc-1", related_npc_id: "npc-2", relationship_type: "family", notes: "cousins" },
        { id: "r-2", npc_id: "npc-2", related_npc_id: "npc-3", relationship_type: "sibling", notes: null },
        { id: "r-3", npc_id: "npc-1", related_npc_id: "npc-3", relationship_type: "ally", notes: null },
      ],
    });
    await executeImport(backup, "Restored");
    expect(inserted.some((i) => i.table === "npc_relationships")).toBe(false);
    const links = inserted.find((i) => i.table === "world_links")!.rows;
    expect(links.map((l) => l.type)).toEqual(["ally"]);
    const kin = inserted.find((i) => i.table === "kin_links")!.rows;
    expect(kin.map((k) => [k.kind, k.needs_sorting, k.note])).toEqual([
      ["relative", true, "cousins"],
      ["sibling", false, ""],
    ]);
  });

  it("restores a backup that predates family trees without writing any kin", async () => {
    const base: Record<string, unknown> = { version: "2", file_type: "backup", campaign: { id: "old-camp", name: "Old" } };
    const old = new Proxy(base, {
      get: (t, k) => (k === "kin_links" ? undefined : k in t ? t[k as string] : []),
    }) as unknown as GrimoireBackup;
    await executeImport(old, "Restored");
    expect(inserted.some((i) => i.table === "kin_links")).toBe(false);
  });
});

describe("executeImport world links (#1084)", () => {
  beforeEach(() => {
    inserted.length = 0;
    fake.reset();
  });

  const npcs = [{ id: "npc-1", name: "Bram" }, { id: "npc-2", name: "Wren" }];
  const link = (id: string, to: [string, string]) => ({
    id,
    campaign_id: "old-camp",
    user_id: "x",
    from_kind: "npc",
    from_npc_id: "npc-1",
    to_kind: to[0],
    [`to_${to[0]}_id`]: to[1],
    type: "ally",
    note: "n",
    told: "",
    player_visible_to: ["pm-1", "pm-gone"],
    ai_provenance: null,
    from_id: "npc-1",
    to_id: to[1],
  });

  it("remaps both ends onto the restored rows and the audience onto the restored party", async () => {
    const backup = backupWith({ party_members: [member], npcs, world_links: [link("l-1", ["npc", "npc-2"]), link("l-2", ["party_member", "pm-1"])] });
    await executeImport(backup, "Restored");
    const tables = inserted.map((i) => i.table);
    expect(tables.indexOf("factions")).toBeLessThan(tables.indexOf("world_links"));
    const [n1, n2] = inserted.find((i) => i.table === "npcs")!.rows;
    const pm = inserted.find((i) => i.table === "party_members")!.rows[0];
    const [a, b] = inserted.find((i) => i.table === "world_links")!.rows;
    expect(a).toMatchObject({ from_npc_id: n1.id, to_npc_id: n2.id, user_id: "restorer", type: "ally" });
    expect(a.id).not.toBe("l-1");
    expect(a).not.toHaveProperty("from_id");
    expect(b).toMatchObject({ to_party_member_id: pm.id, player_visible_to: [pm.id, "pm-gone"] });
  });

  it("drops a link whose end did not restore", async () => {
    const backup = backupWith({ npcs, world_links: [link("l-1", ["npc", "npc-gone"]), link("l-2", ["npc", "npc-2"])] });
    await executeImport(backup, "Restored");
    const rows = inserted.find((i) => i.table === "world_links")!.rows;
    expect(rows).toHaveLength(1);
  });

  it("turns the old tie tables of an earlier backup into links", async () => {
    const backup = backupWith({
      npcs,
      factions: [{ id: "f-1", name: "Guild" }],
      locations: [{ id: "loc-1", name: "Keep", parent_id: null }],
      npc_relationships: [{ id: "r-1", npc_id: "npc-1", related_npc_id: "npc-2", relationship_type: "rival", notes: "feud" }],
      faction_locations: [{ id: "fl-1", faction_id: "f-1", location_id: "loc-1" }],
    });
    await executeImport(backup, "Restored");
    const rows = inserted.find((i) => i.table === "world_links")!.rows;
    expect(rows.map((r) => r.type).sort()).toEqual(["operates_in", "rival"]);
    expect(inserted.some((i) => i.table === "faction_locations" || i.table === "npc_relationships")).toBe(false);
  });
});

describe("exporting a campaign", () => {
  beforeEach(() => {
    fake.reset();
    downloads.length = 0;
  });

  async function exportBackup(campaignId: string): Promise<GrimoireBackup & { campaign: Record<string, unknown> }> {
    let mutation!: ReturnType<typeof useExportCampaign>;
    mount(
      defineComponent({ setup() { mutation = useExportCampaign(); return () => null; } }),
      { global: { plugins: [[VueQueryPlugin, { queryClient: new QueryClient() }]] } },
    );
    await mutation.mutateAsync(campaignId);
    await flushPromises();
    return JSON.parse(await downloads[0].blob.text());
  }

  const campaignRow = (id: string, name: string) => ({
    id,
    name,
    user_id: "the-dm",
    openai_api_key: "sk-secret",
    anthropic_api_key: "sk-ant-secret",
    gemini_api_key: "g-secret",
    spotify_client_id: "sp-secret",
    ical_token: "feed-secret",
  });

  it("never carries the campaign's API keys, feed token or owner, which the file is shared with other people", async () => {
    fake.seed("campaigns", [campaignRow("c1", "The Mere"), campaignRow("c2", "Other")]);
    const backup = await exportBackup("c1");
    expect(backup.campaign).toEqual({ id: "c1", name: "The Mere" });
    expect(downloads[0].name).toBe("the-mere.grimoire-backup");
  });

  it("carries the campaign's books with their chapters, and no other campaign's chapters", async () => {
    fake.seed("campaigns", [campaignRow("c1", "The Mere")]);
    fake.seed("scriptorium_documents", [
      { id: "doc-1", campaign_id: "c1", title: "Mine" },
      { id: "doc-2", campaign_id: "c2", title: "Theirs" },
    ]);
    fake.seed("scriptorium_chapters", [
      { id: "ch-1", document_id: "doc-1", position: 0 },
      { id: "ch-2", document_id: "doc-2", position: 0 },
    ]);
    const backup = await exportBackup("c1");
    expect(backup.scriptorium_chapters?.map((c) => c.id)).toEqual(["ch-1"]);
  });

  it("names the file after the campaign without stray dashes", async () => {
    fake.seed("campaigns", [campaignRow("c1", "  ~The Mere!  ")]);
    await exportBackup("c1");
    expect(downloads[0].name).toBe("the-mere.grimoire-backup");
  });

  it("holds this campaign's rows and their children only", async () => {
    fake.seed("campaigns", [campaignRow("c1", "The Mere")]);
    fake.seed("npcs", [{ id: "n1", campaign_id: "c1" }, { id: "n-other", campaign_id: "c2" }]);
    fake.seed("party_members", [{ id: "pm1", campaign_id: "c1" }, { id: "pm-other", campaign_id: "c2" }]);
    fake.seed("character_classes", [
      { id: "cc1", party_member_id: "pm1", class_definition_kind: "system", class_definition_id: "sys" },
      { id: "cc-other", party_member_id: "pm-other", class_definition_kind: "system", class_definition_id: "sys" },
    ]);
    const backup = await exportBackup("c1");
    expect(backup.npcs.map((r) => r.id)).toEqual(["n1"]);
    expect(backup.party_members.map((r) => r.id)).toEqual(["pm1"]);
    expect(backup.character_classes.map((r) => r.id)).toEqual(["cc1"]);
    expect(backup._meta.entity_counts).toMatchObject({ npcs: 1, party_members: 1 });
  });

  it("leaves out a consequence rule conditioned on a beat or an edge, which this format has nothing to restore it against", async () => {
    fake.seed("campaigns", [campaignRow("c1", "The Mere")]);
    fake.seed("quests", [{ id: "q1", campaign_id: "c1" }]);
    fake.seed("quest_consequences", [
      { id: "plain", quest_id: "q1", on_beat_id: null, on_edge_id: null },
      { id: "beat", quest_id: "q1", on_beat_id: "b1", on_edge_id: null },
      { id: "edge", quest_id: "q1", on_beat_id: null, on_edge_id: "e1" },
    ]);
    const backup = await exportBackup("c1");
    expect(backup.quest_consequences.map((r) => r.id)).toEqual(["plain"]);
  });

  it("refuses when a character plays a homebrew class the exporter cannot read, rather than writing a pin to nothing", async () => {
    fake.seed("campaigns", [campaignRow("c1", "The Mere")]);
    fake.seed("party_members", [{ id: "pm1", campaign_id: "c1" }]);
    fake.seed("character_classes", [{ id: "cc1", party_member_id: "pm1", class_definition_kind: "custom", class_definition_id: "hidden-def" }]);
    let mutation!: ReturnType<typeof useExportCampaign>;
    mount(
      defineComponent({ setup() { mutation = useExportCampaign(); return () => null; } }),
      { global: { plugins: [[VueQueryPlugin, { queryClient: new QueryClient() }]] } },
    );
    await expect(mutation.mutateAsync("c1")).rejects.toThrow("cannot be backed up");
    expect(downloads).toEqual([]);
  });

  it("includes the campaign-less class a character is pinned to, beside the campaign's own", async () => {
    fake.seed("campaigns", [campaignRow("c1", "The Mere")]);
    fake.seed("party_members", [{ id: "pm1", campaign_id: "c1" }]);
    fake.seed("character_classes", [
      { id: "cc1", party_member_id: "pm1", class_definition_kind: "custom", class_definition_id: "def-global" },
      { id: "cc2", party_member_id: "pm1", class_definition_kind: "custom", class_definition_id: "def-own" },
    ]);
    fake.seed("custom_classes", [
      { id: "def-own", campaign_id: "c1" },
      { id: "def-global", campaign_id: null },
      { id: "def-unrelated", campaign_id: null },
    ]);
    const backup = await exportBackup("c1");
    // One copy each: the campaign's own class is pinned too, and is not fetched twice.
    expect(backup.custom_classes.map((r) => r.id).sort()).toEqual(["def-global", "def-own"]);
  });
});
