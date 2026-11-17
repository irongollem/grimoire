import { describe, expect, it } from "vitest";
import { bystandersOf } from "./bystandersOf";
import type { Npc } from "@/types/npc.types";

type Source = Parameters<typeof bystandersOf>[0][number];

function npc(id: string, over: Partial<Source> = {}): Source {
  return {
    id, name: `Name ${id}`, stat_block: null, portrait_url: `${id}.png`, portrait_focal_point: null, cutout_url: null,
    size: "medium" as Npc["size"], location_id: "room", disguise_name: null, disguise_portrait_url: null,
    is_revealed: false, unmasked_at: null, ...over,
  };
}

describe("bystandersOf", () => {
  it("seats every NPC of the fight's place, as an unplaced, unrolled, neutral token that never acts", () => {
    const [b] = bystandersOf([npc("a"), npc("elsewhere", { location_id: "other" })], "room", []);
    expect(b).toMatchObject({ instance_id: "b-a", npc_id: "a", bystander: true, faction_id: "neutral", initiative: null, position: null, reveal_state: "revealed", type: "monster" });
    expect(bystandersOf([npc("a"), npc("elsewhere", { location_id: "other" })], "room", [])).toHaveLength(1);
  });

  // Bug caught: every NPC with no place matching an encounter with no place.
  it("adds no one when the encounter has no place", () => {
    expect(bystandersOf([npc("a", { location_id: null })], null, [])).toEqual([]);
  });

  // Bug caught: a second token for an NPC who is already a combatant.
  it("skips an NPC who already fights", () => {
    expect(bystandersOf([npc("a")], "room", [{ npc_id: "a" }])).toEqual([]);
  });

  // Bug caught: a disguised NPC's true name and portrait on the roster and map.
  it("shows a concealed NPC under the disguise", () => {
    const [b] = bystandersOf([npc("a", { disguise_name: "Old Beggar", disguise_portrait_url: "beggar.png", cutout_url: "true-figure.png" })], "room", []);
    // The cut-out figure is their true look, so the token falls back to the disguise's portrait.
    expect(b.token_url).toBeUndefined();
    expect(b.name).toBe("Old Beggar");
    expect(b.portrait_url).toBe("beggar.png");
  });

  // Bug caught: a statless NPC given no hit points (the roster would show a dead token).
  it("gives a character with no stat block stand-in numbers", () => {
    const [b] = bystandersOf([npc("a")], "room", []);
    expect(b).toMatchObject({ hp: 10, max_hp: 10, placeholder_stats: true });
  });
});
