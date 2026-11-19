import { describe, expect, it } from "vitest";
import type { WildshapeState } from "@/types/encounter.types";
import { ingestPartyRow, type PartyIngestContext, type PartyIngestRow } from "./partyIngest.ts";
import { broadcastEvent, combatant, deepFreeze, deps, fight, pc } from "./fightTestKit.ts";

function row(over: Partial<PartyIngestRow> = {}): PartyIngestRow {
  return {
    id: "pm-p",
    current_hp: 20,
    temp_hp: 0,
    current_initiative: null,
    conditions: [],
    concentration: null,
    wildshape_state: null,
    death_save_successes: 0,
    death_save_failures: 0,
    ...over,
  };
}

const context = (over: Partial<PartyIngestContext> = {}): PartyIngestContext => ({ live: true, lastConcentration: undefined, ...over });
const hero = (over = {}) => pc("p", { hp: 20, max_hp: 20, ...over });

describe("ingestPartyRow", () => {
  it("fails if a row identical to what the fight holds changes anything", () => {
    // The fight has already read this row once, so it remembers what it said and has nothing new to note.
    const state = deepFreeze(fight([hero({ sheet_hp: 20, sheet_temp_hp: 0, conditions: [{ name: "Poisoned", ends: { kind: "save", ability: "con", dc: 12, at: "end" } }] })]));
    const result = ingestPartyRow(
      state,
      // The same record with its keys the other way round: jsonb does not keep the order.
      row({ conditions: [{ ends: { at: "end", dc: 12, ability: "con", kind: "save" }, name: "Poisoned" }] }),
      context(),
      deps(),
    );
    expect(result.state).toBe(state);
    expect(result.effects).toEqual([]);
  });

  it("fails if a row for a character who is not in the fight is applied to someone", () => {
    const state = fight([hero()]);
    const result = ingestPartyRow(state, row({ id: "pm-nobody", current_hp: 1 }), context(), deps());
    expect(result.matched).toBe(false);
    expect(result.state).toBe(state);
  });

  it("fails if HP changed on the player's sheet is not adopted, clamped to the maximum", () => {
    const state = fight([hero({ hp: 5 })]);
    expect(ingestPartyRow(state, row({ current_hp: 9 }), context(), deps()).state.combatants[0].hp).toBe(9);
    expect(ingestPartyRow(state, row({ current_hp: 99 }), context(), deps()).state.combatants[0].hp).toBe(20);
  });

  // The fight is saved before a hit reaches the character's row. Fight 10, row still 20, and the fight last read 20 from it:
  // the row has not changed since, so the 10 stands. Adopting 20 would undo the hit.
  it("fails if a row that still says what the fight last read puts back the hit points a hit took", () => {
    const state = fight([hero({ hp: 10, sheet_hp: 20 })]);
    const result = ingestPartyRow(state, row({ current_hp: 20 }), context(), deps());
    expect(result.state.combatants[0].hp).toBe(10);
    expect(result.state.combatants[0].sheet_hp).toBe(20);
  });

  // The hit has now reached the row (10, which is not what the fight last read, 20), so it is adopted (the fight already has 10) and
  // remembered. The player then heals on their own sheet to 15: not the 10 last read, so it is their change and is adopted.
  it("fails if a player's own change to their hit points after a hit is not adopted", () => {
    const state = fight([hero({ hp: 10, sheet_hp: 20 })]);
    const landed = ingestPartyRow(state, row({ current_hp: 10 }), context(), deps());
    expect(landed.state.combatants[0]).toMatchObject({ hp: 10, sheet_hp: 10 });
    const healed = ingestPartyRow(landed.state, row({ current_hp: 15 }), context(), deps());
    expect(healed.state.combatants[0]).toMatchObject({ hp: 15, sheet_hp: 15 });
  });

  it("fails if the first read of a row, with nothing remembered yet, does not adopt it and remember it", () => {
    const state = fight([hero({ hp: 5 })]);
    const result = ingestPartyRow(state, row({ current_hp: 9 }), context(), deps());
    expect(result.state.combatants[0]).toMatchObject({ hp: 9, sheet_hp: 9 });
  });

  // Same ordering for temp HP: a hit that spent the 5 temp HP leaves the fight at 0 while the row still says 5.
  it("fails if a row that still says what the fight last read hands back temp HP a hit spent", () => {
    const state = fight([hero({ temp_hp: undefined, sheet_temp_hp: 5 })]);
    const result = ingestPartyRow(state, row({ temp_hp: 5 }), context(), deps());
    expect(result.state.combatants[0].temp_hp).toBeUndefined();
  });

  it("fails if healing from 0 on the player's own sheet leaves the death saves standing", () => {
    // PHB 2014 "Dropping to 0 Hit Points": a creature that regains any hit points stops being dying, and the saves reset.
    const state = fight([hero({ hp: 0, death_saves: { successes: 1, failures: 2 } })]);
    const result = ingestPartyRow(state, row({ current_hp: 4, death_save_successes: 1, death_save_failures: 2 }), context(), deps());
    expect(result.state.combatants[0].hp).toBe(4);
    expect(result.state.combatants[0].death_saves).toEqual({ successes: 0, failures: 0 });
  });

  it("fails if the player's own death saves are not adopted while they stay at 0", () => {
    const state = fight([hero({ hp: 0 })]);
    const result = ingestPartyRow(state, row({ current_hp: 0, death_save_successes: 2, death_save_failures: 1 }), context(), deps());
    expect(result.state.combatants[0].death_saves).toEqual({ successes: 2, failures: 1 });
  });

  it("fails if ingested HP lands on the druid instead of the beast form", () => {
    const form: WildshapeState = {
      monster_id: "bear", beast_name: "Bear", beast_image_url: null, beast_hp: 8, beast_max_hp: 12, beast_ac: "11", beast_dex: 10,
    };
    const state = fight([hero({ hp: 20, wildshape: form })]);
    const result = ingestPartyRow(state, row({ current_hp: 5, wildshape_state: form }), context(), deps());
    expect(result.state.combatants[0].wildshape?.beast_hp).toBe(5);
    expect(result.state.combatants[0].hp).toBe(20);
    // The beast's pool is at most its own maximum.
    const over = ingestPartyRow(state, row({ current_hp: 40, wildshape_state: form }), context(), deps());
    expect(over.state.combatants[0].wildshape?.beast_hp).toBe(12);
  });

  it("fails if a beast form taken to 0 HP stays on the druid", () => {
    const form: WildshapeState = {
      monster_id: "bear", beast_name: "Bear", beast_image_url: null, beast_hp: 8, beast_max_hp: 12, beast_ac: "11", beast_dex: 10,
    };
    const result = ingestPartyRow(fight([hero({ wildshape: form })]), row({ current_hp: 0, wildshape_state: form }), context(), deps());
    expect(result.state.combatants[0].wildshape).toBeUndefined();
  });

  it("fails if a form dropped on the player's own sheet stays on the combatant", () => {
    const form: WildshapeState = {
      monster_id: "bear", beast_name: "Bear", beast_image_url: null, beast_hp: 8, beast_max_hp: 12, beast_ac: "11", beast_dex: 10,
    };
    const result = ingestPartyRow(fight([hero({ wildshape: form })]), row({ wildshape_state: null }), context(), deps());
    expect(result.state.combatants[0].wildshape).toBeUndefined();
  });

  it("fails if temp HP is merged with max() instead of taken as the sheet says, with 0 clearing it", () => {
    const state = fight([hero({ temp_hp: 9 })]);
    expect(ingestPartyRow(state, row({ temp_hp: 4 }), context(), deps()).state.combatants[0].temp_hp).toBe(4);
    expect(ingestPartyRow(state, row({ temp_hp: 0 }), context(), deps()).state.combatants[0].temp_hp).toBeUndefined();
  });

  it("fails if conditions on the player's sheet are not adopted", () => {
    const result = ingestPartyRow(fight([hero()]), row({ conditions: [{ name: "Prone" }] }), context(), deps());
    expect(result.state.combatants[0].conditions).toEqual([{ name: "Prone" }]);
  });

  it("fails if initiative is adopted while the encounter is not live", () => {
    // A row read before the lobby opens still carries last session's roll.
    const state = fight([hero({ initiative: null })], [], { started: false, round: 0 });
    expect(ingestPartyRow(state, row({ current_initiative: 17 }), context({ live: false }), deps()).state.combatants[0].initiative).toBeNull();
    expect(ingestPartyRow(state, row({ current_initiative: 17 }), context({ live: true }), deps()).state.combatants[0].initiative).toBe(17);
  });

  it("fails if a null initiative on the row wipes the one the fight holds", () => {
    const result = ingestPartyRow(fight([hero({ initiative: 11 })]), row({ current_initiative: null }), context(), deps());
    expect(result.state.combatants[0].initiative).toBe(11);
  });

  it("fails if ended concentration on the sheet leaves its conditions on others, or the first read ends anything", () => {
    const held = { name: "Hold Person", source: { id: "p", spell: "Hold Person", concentration: true } };
    const state = deepFreeze(fight([hero(), combatant("g", { conditions: [held] })]));
    const ended = ingestPartyRow(state, row(), context({ lastConcentration: "Hold Person" }), deps());
    expect(ended.state.combatants[1].conditions).toEqual([]);
    expect(ended.effects.map((e) => e.type)).toContain("condition_ended");
    expect(ended.concentration).toBeNull();
    // First read of the member: it only records what they hold.
    expect(ingestPartyRow(state, row(), context({ lastConcentration: undefined }), deps()).state.combatants[1].conditions).toEqual([held]);
    // Still holding the same spell: nothing ends.
    const same = ingestPartyRow(state, row({ concentration: { spellName: "Hold Person" } }), context({ lastConcentration: "Hold Person" }), deps());
    expect(same.state.combatants[1].conditions).toEqual([held]);
    expect(same.concentration).toBe("Hold Person");
  });

  it("fails if adopting HP does not run the event check", () => {
    const event = broadcastEvent("wounded", { type: "combatant_hp_pct", combatant_def_id: "nessa", pct: 50 }, "She is hurt.");
    const state = fight([hero({ def_id: "nessa" })], [event]);
    // 8 of 20 is 40 percent, at or under the trigger's 50.
    const result = ingestPartyRow(state, row({ current_hp: 8 }), context(), deps());
    expect(result.state.eventsFired).toEqual(["wounded"]);
    expect(result.effects).toEqual([{ type: "broadcast", message: "She is hurt." }]);
  });
});
