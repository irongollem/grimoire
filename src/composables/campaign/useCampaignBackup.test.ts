import { beforeEach, describe, expect, it, vi } from "vitest";

type Inserted = { table: string; rows: Record<string, unknown>[] };
const inserted: Inserted[] = [];

// The restore writes through supabase; record each insert so the remap can be
// read back instead of reaching a database.
vi.mock("@/lib/supabase", () => ({
  getCurrentUser: () => ({ id: "restorer" }),
  supabase: {
    from: (table: string) => ({
      insert: (rows: Record<string, unknown> | Record<string, unknown>[]) => {
        inserted.push({ table, rows: Array.isArray(rows) ? rows : [rows] });
        const result = { data: Array.isArray(rows) ? null : rows, error: null };
        return Object.assign(Promise.resolve(result), {
          select: () => ({ single: async () => result }),
        });
      },
    }),
  },
}));
vi.mock("@/composables/campaign/useCampaigns", () => ({
  disposeHomebrewAndDeleteCampaign: vi.fn(),
}));

import {
  assertBackupCarriesCharacterEditions,
  executeImport,
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

describe("executeImport class definitions", () => {
  beforeEach(() => {
    inserted.length = 0;
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
  });

  it("remaps player_visible_to onto the restored party, exactly as notes do", async () => {
    const backup = backupWith({
      party_members: [member],
      notes: [{ id: "note-1", player_visible_to: ["pm-1", "pm-gone"] }],
      scriptorium_documents: [
        { id: "doc-1", title: "Handout", content: null, player_visible_to: ["pm-1", "pm-gone"] },
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

describe("executeImport session log", () => {
  beforeEach(() => {
    inserted.length = 0;
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
