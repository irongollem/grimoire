import { describe, it, expect } from "vitest";
import {
  resolveGeneratedComplication,
  buildComplicationEvent,
  type CombatantPoolRow,
  type ComplicationPools,
  type ResolvedComplication,
  type ResolvedReinforcement,
} from "./resolveGeneratedComplication";
import type { ComplicationAiResult } from "./types";
import type { EventAction, FactionDef } from "@/types/encounter.types";

const MONSTERS: CombatantPoolRow[] = [
  { id: "uuid-goblin", name: "Goblin" },
  { id: "uuid-ogre", name: "Ogre" },
];

const NPCS: CombatantPoolRow[] = [
  { id: "uuid-guard-captain", name: "Guard Captain" },
  // Shadowing pair: this name also exists in the bestiary, so the monster
  // stat block must win the lookup — see the comment in the module.
  { id: "uuid-ogre-npc", name: "Ogre" },
];

const FACTIONS: FactionDef[] = [
  { id: "players", name: "Players", color: "#1C2A4A", hostile_to: ["enemy"] },
  { id: "enemy", name: "Enemy", color: "#6B1C1C", hostile_to: ["players"] },
  { id: "faction-cultists-001", name: "Cultists", color: "#442266", hostile_to: ["players"] },
];

function makePools(overrides: Partial<ComplicationPools> = {}): ComplicationPools {
  return { monsters: MONSTERS, npcs: NPCS, factions: FACTIONS, ...overrides };
}

type RawReinforcement = { name: string; count?: number; side?: string; role?: string | null };

function reinforcement(overrides: Partial<RawReinforcement> = {}): RawReinforcement {
  return { name: "Goblin", count: 2, side: "enemy", ...overrides };
}

function complicationResult(overrides: Partial<ComplicationAiResult> = {}): ComplicationAiResult {
  return { name: "Ambush", narration: "Shadows move in the trees.", ...overrides };
}

describe("resolveGeneratedComplication — reinforcement name matching", () => {
  it("resolves a monster name against the bestiary pool, carrying the roster row's id and canonical name", () => {
    const result = resolveGeneratedComplication(
      complicationResult({ reinforcements: [reinforcement()] }),
      makePools(),
    );
    expect(result.reinforcements[0]).toMatchObject({ kind: "monster", id: "uuid-goblin", name: "Goblin" });
  });

  it("matches a name case- and whitespace-insensitively", () => {
    const result = resolveGeneratedComplication(
      complicationResult({ reinforcements: [reinforcement({ name: "  goblin  " })] }),
      makePools(),
    );
    expect(result.reinforcements[0]).toMatchObject({ kind: "monster", id: "uuid-goblin", name: "Goblin" });
  });

  it("resolves a name present only in the npc pool with kind npc", () => {
    const result = resolveGeneratedComplication(
      complicationResult({ reinforcements: [reinforcement({ name: "Guard Captain" })] }),
      makePools(),
    );
    expect(result.reinforcements[0]).toMatchObject({ kind: "npc", id: "uuid-guard-captain", name: "Guard Captain" });
  });

  it("resolves a name present in both pools to the monster — the stat block wins", () => {
    const result = resolveGeneratedComplication(
      complicationResult({ reinforcements: [reinforcement({ name: "Ogre" })] }),
      makePools(),
    );
    expect(result.reinforcements[0]).toMatchObject({ kind: "monster", id: "uuid-ogre", name: "Ogre" });
  });

  it("comes back unmatched, with a reason, rather than being dropped, for an unknown name", () => {
    const result = resolveGeneratedComplication(
      complicationResult({ reinforcements: [reinforcement({ name: "Beholder Zilyana" })] }),
      makePools(),
    );
    expect(result.reinforcements).toEqual([
      { kind: "unmatched", name: "Beholder Zilyana", reason: "not in this encounter's bestiary or cast" },
    ]);
  });

  it("comes back unmatched, never dropped, when the entry's name is blank or entirely missing", () => {
    const blank = resolveGeneratedComplication(
      complicationResult({ reinforcements: [reinforcement({ name: "   " })] }),
      makePools(),
    );
    expect(blank.reinforcements[0]).toMatchObject({ kind: "unmatched", name: "(unnamed)", reason: "no creature name given" });

    const missing = resolveGeneratedComplication(
      complicationResult({ reinforcements: [{ count: 1, side: "enemy" } as unknown as RawReinforcement] }),
      makePools(),
    );
    expect(missing.reinforcements[0]).toMatchObject({ kind: "unmatched", name: "(unnamed)", reason: "no creature name given" });
  });
});

describe("resolveGeneratedComplication — side resolution", () => {
  it("resolves side against the encounter's factions by name, case-insensitively", () => {
    const result = resolveGeneratedComplication(
      complicationResult({ reinforcements: [reinforcement({ side: "CULTISTS" })] }),
      makePools(),
    );
    expect(result.reinforcements[0]).toMatchObject({ factionId: "faction-cultists-001", factionName: "Cultists" });
  });

  it("resolves side against the encounter's factions by id", () => {
    const result = resolveGeneratedComplication(
      complicationResult({ reinforcements: [reinforcement({ side: "FACTION-CULTISTS-001" })] }),
      makePools(),
    );
    expect(result.reinforcements[0]).toMatchObject({ factionId: "faction-cultists-001", factionName: "Cultists" });
  });

  it("falls back to the enemy faction when the side is unrecognised", () => {
    const result = resolveGeneratedComplication(
      complicationResult({ reinforcements: [reinforcement({ side: "the shadow council" })] }),
      makePools(),
    );
    expect(result.reinforcements[0]).toMatchObject({ factionId: "enemy", factionName: "Enemy" });
  });

  it("falls back to any non-players faction when the encounter has no enemy faction", () => {
    const factionsNoEnemy: FactionDef[] = [
      { id: "players", name: "Players", color: "#1C2A4A", hostile_to: [] },
      { id: "ally", name: "Ally", color: "#1A4A1A", hostile_to: [] },
      { id: "neutral", name: "Neutral", color: "#3D3D3D", hostile_to: [] },
    ];
    const result = resolveGeneratedComplication(
      complicationResult({ reinforcements: [reinforcement({ side: "nonsense" })] }),
      makePools({ factions: factionsNoEnemy }),
    );
    expect(result.reinforcements[0]).toMatchObject({ factionId: "ally" });
  });

  it("makes the entry unmatched — never a spawn with a dangling faction — when the encounter has no factions at all", () => {
    const result = resolveGeneratedComplication(
      complicationResult({ reinforcements: [reinforcement()] }),
      makePools({ factions: [] }),
    );
    expect(result.reinforcements).toEqual([
      { kind: "unmatched", name: "Goblin", reason: "this encounter has no side to add them to" },
    ]);
  });
});

describe("resolveGeneratedComplication — count clamping", () => {
  it("clamps count to at most 8 and warns, naming the creature and the number asked for", () => {
    const result = resolveGeneratedComplication(
      complicationResult({ reinforcements: [reinforcement({ count: 20 })] }),
      makePools(),
    );
    expect(result.reinforcements[0]).toMatchObject({ count: 8 });
    expect(result.warnings).toContain("Goblin: the AI asked for 20, capped at 8.");
  });

  it.each([undefined, "three" as unknown as number, 0, -5])(
    "treats a count of %p as 1 rather than rejecting the entry",
    (badCount) => {
      const result = resolveGeneratedComplication(
        complicationResult({ reinforcements: [reinforcement({ count: badCount })] }),
        makePools(),
      );
      expect(result.reinforcements[0]).toMatchObject({ count: 1 });
      expect(result.warnings).toEqual([]);
    },
  );
});

describe("resolveGeneratedComplication — reinforcement entry limit", () => {
  it("truncates more than 6 reinforcement entries to 6 and warns that it did", () => {
    const many = Array.from({ length: 9 }, () => reinforcement());
    const result = resolveGeneratedComplication(complicationResult({ reinforcements: many }), makePools());
    expect(result.reinforcements).toHaveLength(6);
    expect(result.warnings).toContain(
      "The AI proposed 9 groups of reinforcements; only the first 6 are kept.",
    );
  });
});

describe("resolveGeneratedComplication — environment", () => {
  it("keeps an environment effect that has both a label and a description", () => {
    const result = resolveGeneratedComplication(
      complicationResult({ environment: { label: "Collapsing Floor", description: "The floor gives way." } }),
      makePools(),
    );
    expect(result.environment).toEqual({ label: "Collapsing Floor", description: "The floor gives way." });
    expect(result.warnings).toEqual([]);
  });

  it("drops an environment effect that has only a label, and warns that it did", () => {
    const result = resolveGeneratedComplication(
      complicationResult({ environment: { label: "Collapsing Floor", description: "" } }),
      makePools(),
    );
    expect(result.environment).toBeNull();
    expect(result.warnings).toContain("The AI's environmental effect was incomplete and has been left out.");
  });

  it("drops an environment effect that has only a description, and warns that it did", () => {
    const result = resolveGeneratedComplication(
      complicationResult({ environment: { label: "", description: "The floor gives way." } }),
      makePools(),
    );
    expect(result.environment).toBeNull();
    expect(result.warnings).toContain("The AI's environmental effect was incomplete and has been left out.");
  });

  it("treats an absent environment as fine, producing no warning", () => {
    const result = resolveGeneratedComplication(complicationResult(), makePools());
    expect(result.environment).toBeNull();
    expect(result.warnings).toEqual([]);
  });
});

describe("resolveGeneratedComplication — misc fallbacks", () => {
  it("treats absent reinforcements as fine, producing no warning", () => {
    const result = resolveGeneratedComplication(complicationResult(), makePools());
    expect(result.reinforcements).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it('falls back to "Complication" as the event name when the model omits it', () => {
    const result = resolveGeneratedComplication(complicationResult({ name: "" }), makePools());
    expect(result.name).toBe("Complication");
  });
});

function resolvedComplication(overrides: Partial<ResolvedComplication> = {}): ResolvedComplication {
  return {
    name: "Ambush",
    narration: "Shadows move in the trees.",
    reinforcements: [],
    environment: null,
    warnings: [],
    ...overrides,
  };
}

function spawnsOf(event: ReturnType<typeof buildComplicationEvent>) {
  const action = event.actions.find(
    (a): a is Extract<EventAction, { type: "spawn_combatants" }> => a.type === "spawn_combatants",
  );
  return action?.spawns;
}

describe("buildComplicationEvent — anti-surprise guarantee", () => {
  it("always builds a manual, fire-once event, so a generated event can never auto-fire on a round boundary", () => {
    const event = buildComplicationEvent(resolvedComplication(), { isPlayerVisible: false });
    expect(event.trigger).toEqual({ type: "manual" });
    expect(event.fire_once).toBe(true);
  });
});

describe("buildComplicationEvent — reinforcements", () => {
  it("produces no spawn_combatants action for unmatched reinforcements", () => {
    const unmatched: ResolvedReinforcement = {
      kind: "unmatched",
      name: "Beholder Zilyana",
      reason: "not in this encounter's bestiary or cast",
    };
    const event = buildComplicationEvent(resolvedComplication({ reinforcements: [unmatched] }), { isPlayerVisible: false });
    expect(spawnsOf(event)).toBeUndefined();
  });

  it("turns resolved reinforcements into spawn_combatants, with kind carried through and custom_name only when a role was given", () => {
    const reinforcements: ResolvedReinforcement[] = [
      { kind: "monster", id: "uuid-goblin", name: "Goblin", count: 3, factionId: "enemy", factionName: "Enemy", role: "Leader" },
      { kind: "npc", id: "uuid-guard-captain", name: "Guard Captain", count: 1, factionId: "ally", factionName: "Ally", role: null },
    ];
    const event = buildComplicationEvent(resolvedComplication({ reinforcements }), { isPlayerVisible: false });
    expect(spawnsOf(event)).toEqual([
      { monster_id: "uuid-goblin", kind: "monster", count: 3, faction_id: "enemy", custom_name: "Leader" },
      { monster_id: "uuid-guard-captain", kind: "npc", count: 1, faction_id: "ally" },
    ]);
  });
});

describe("buildComplicationEvent — narration", () => {
  it("turns narration into a broadcast_message action", () => {
    const event = buildComplicationEvent(resolvedComplication({ narration: "The ground trembles." }), { isPlayerVisible: false });
    expect(event.actions).toContainEqual({ type: "broadcast_message", message: "The ground trembles." });
  });

  it("produces no broadcast_message action for empty narration", () => {
    const event = buildComplicationEvent(resolvedComplication({ narration: "" }), { isPlayerVisible: false });
    expect(event.actions.find((a) => a.type === "broadcast_message")).toBeUndefined();
  });
});

describe("buildComplicationEvent — environment", () => {
  it("turns an environment effect into an environment_effect action", () => {
    const event = buildComplicationEvent(
      resolvedComplication({ environment: { label: "Collapsing Floor", description: "The floor gives way." } }),
      { isPlayerVisible: false },
    );
    expect(event.actions).toContainEqual({
      type: "environment_effect",
      label: "Collapsing Floor",
      description: "The floor gives way.",
    });
  });
});

describe("buildComplicationEvent — player visibility", () => {
  it("carries is_player_visible through from the passed option", () => {
    const visible = buildComplicationEvent(resolvedComplication(), { isPlayerVisible: true });
    const hidden = buildComplicationEvent(resolvedComplication(), { isPlayerVisible: false });
    expect(visible.is_player_visible).toBe(true);
    expect(hidden.is_player_visible).toBe(false);
  });
});
