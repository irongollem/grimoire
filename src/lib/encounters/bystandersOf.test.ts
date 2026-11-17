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
  it("seats every NPC of the fight's place, as an unplaced, unrolled token on the party's side that never acts", () => {
    const [b] = bystandersOf([npc("a"), npc("elsewhere", { location_id: "other" })], "room", []);
    expect(b).toMatchObject({ instance_id: "b-a", npc_id: "a", bystander: true, faction_id: "players", initiative: null, position: null, reveal_state: "revealed", type: "monster" });
    expect(bystandersOf([npc("a"), npc("elsewhere", { location_id: "other" })], "room", [])).toHaveLength(1);
  });

  // Bug caught: every NPC with no place matching an encounter with no place.
  it("adds no one when the encounter has no place", () => {
    expect(bystandersOf([npc("a", { location_id: null })], null, [])).toEqual([]);
  });

  // Bug caught: a second token for an NPC who is already a combatant.
  it("skips an NPC who already fights", () => {
    expect(bystandersOf([npc("a")], "room", [{ npc_id: "a", faction_id: "enemy" }])).toEqual([]);
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

  // Bug caught: a bystander in a faction of her own, where the party's foes are not hers (never attacked) or the
  // party itself reads as her foe; and a party given another faction by the DM leaving her behind in "players".
  it("stands in the played character's faction, whatever the DM called it", () => {
    const [b] = bystandersOf([npc("a")], "room", [{ npc_id: undefined, party_member_id: "m1", faction_id: "the-wardens" }]);
    expect(b.faction_id).toBe("the-wardens");
  });

  // Bug caught (the maintainer: "if they have a profile they can fight on my side"): someone with a stat block
  // marked as a helper, so the rules never play their turn; or a commoner sent to the rules, which refuse them.
  it("makes someone with a stat block a fighter the rules play, and someone without one a helper", () => {
    const [fighter] = bystandersOf([npc("a", { stat_block: { hit_points: "22 (4d8 + 4)", armor_class: "15" } as unknown as Source["stat_block"] })], "room", []);
    expect(fighter.bystander).toBeUndefined();
    const [helper] = bystandersOf([npc("b", { stat_block: null })], "room", []);
    expect(helper.bystander).toBe(true);
  });
});
