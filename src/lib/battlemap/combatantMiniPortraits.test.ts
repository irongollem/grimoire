import { describe, it, expect } from "vitest";
import {
  combatantMiniSource,
  combatantPortraitOverrides,
  type MiniPortraitRow,
} from "@/lib/battlemap/combatantMiniPortraits";
import type { RunCombatant } from "@/types/encounter.types";

function combatant(overrides: Partial<RunCombatant> & Pick<RunCombatant, "instance_id">): RunCombatant {
  return {
    type: "monster",
    name: "Test",
    faction_id: "hostile",
    initiative: null,
    hp: 10,
    max_hp: 10,
    ac: "12",
    conditions: [],
    curses: [],
    death_saves: { successes: 0, failures: 0 },
    dex_mod: 0,
    ...overrides,
  };
}

function miniRow(overrides: Partial<MiniPortraitRow>): MiniPortraitRow {
  return {
    source_table: "monsters",
    source_id: "src-1",
    format: "vtt",
    status: "ready",
    thumbnail_url: "https://cdn.example/thumb.png",
    stylized_image_url: null,
    created_at: "2026-09-01T00:00:00Z",
    ...overrides,
  };
}

describe("combatantMiniSource", () => {
  it("prefers party_member_id over npc_id and monster_id", () => {
    expect(
      combatantMiniSource({ party_member_id: "pm-1", npc_id: "npc-1", monster_id: "mon-1" }),
    ).toEqual({ table: "party_members", id: "pm-1" });
  });

  it("prefers npc_id over monster_id", () => {
    expect(combatantMiniSource({ npc_id: "npc-1", monster_id: "mon-1" })).toEqual({
      table: "npcs",
      id: "npc-1",
    });
  });

  it("falls back to monster_id", () => {
    expect(combatantMiniSource({ monster_id: "mon-1" })).toEqual({ table: "monsters", id: "mon-1" });
  });

  it("is null for a combatant with no back-reference (e.g. a hand-built builder preview)", () => {
    expect(combatantMiniSource({})).toBeNull();
  });
});

describe("combatantPortraitOverrides", () => {
  it("maps a combatant to its source's ready vtt mini image", () => {
    const combatants = [combatant({ instance_id: "m-orc-0", monster_id: "mon-1" })];
    const minis = [miniRow({ source_table: "monsters", source_id: "mon-1" })];
    const overrides = combatantPortraitOverrides(combatants, minis);
    expect(overrides.get("m-orc-0")).toBe("https://cdn.example/thumb.png");
  });

  it("ignores print-format minis — frame 13 names vtt specifically", () => {
    const combatants = [combatant({ instance_id: "m-orc-0", monster_id: "mon-1" })];
    const minis = [miniRow({ source_table: "monsters", source_id: "mon-1", format: "print" })];
    expect(combatantPortraitOverrides(combatants, minis).size).toBe(0);
  });

  it("ignores minis that are not ready — in-flight jobs are not a portrait yet", () => {
    const combatants = [combatant({ instance_id: "m-orc-0", monster_id: "mon-1" })];
    const minis = [miniRow({ source_table: "monsters", source_id: "mon-1", status: "sculpting" })];
    expect(combatantPortraitOverrides(combatants, minis).size).toBe(0);
  });

  it("picks the newest ready mini when a source has more than one", () => {
    const combatants = [combatant({ instance_id: "m-orc-0", monster_id: "mon-1" })];
    const minis = [
      miniRow({
        source_table: "monsters",
        source_id: "mon-1",
        thumbnail_url: "https://cdn.example/old.png",
        created_at: "2026-01-01T00:00:00Z",
      }),
      miniRow({
        source_table: "monsters",
        source_id: "mon-1",
        thumbnail_url: "https://cdn.example/new.png",
        created_at: "2026-06-01T00:00:00Z",
      }),
    ];
    expect(combatantPortraitOverrides(combatants, minis).get("m-orc-0")).toBe("https://cdn.example/new.png");
  });

  it("falls back to stylized_image_url when a ready mini has no thumbnail yet", () => {
    const combatants = [combatant({ instance_id: "m-orc-0", monster_id: "mon-1" })];
    const minis = [
      miniRow({
        source_table: "monsters",
        source_id: "mon-1",
        thumbnail_url: null,
        stylized_image_url: "https://cdn.example/stylized.png",
      }),
    ];
    expect(combatantPortraitOverrides(combatants, minis).get("m-orc-0")).toBe(
      "https://cdn.example/stylized.png",
    );
  });

  it("omits a combatant whose source has no matching mini row", () => {
    const combatants = [combatant({ instance_id: "m-orc-0", monster_id: "mon-1" })];
    expect(combatantPortraitOverrides(combatants, []).size).toBe(0);
  });

  it("distinguishes sources by table, not id alone", () => {
    const combatants = [
      combatant({ instance_id: "p-1", party_member_id: "shared-id" }),
      combatant({ instance_id: "m-1", monster_id: "shared-id" }),
    ];
    const minis = [miniRow({ source_table: "party_members", source_id: "shared-id" })];
    const overrides = combatantPortraitOverrides(combatants, minis);
    expect(overrides.get("p-1")).toBe("https://cdn.example/thumb.png");
    expect(overrides.has("m-1")).toBe(false);
  });
});
