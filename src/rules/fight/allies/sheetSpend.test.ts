// #1264: a fight sends what it spent from a sheet, not the sheet's new values. Each expected spend is the difference worked by hand.
import { describe, expect, it } from "vitest";
import { NO_CASTING, type PlayerSheets } from "../playerSheet";
import { sheetSpends, sheetsRead } from "./sheetSpend";
import { settleFeatureSpend } from "./features";
import { settleInnateSpend, settleSlotSpend } from "./spells";

type Member = PlayerSheets["members"][number];
type SpellRow = PlayerSheets["casting"]["spells"][number];

function sheets(members: Array<Pick<Member, "id" | "spell_slots"> & Partial<Member>>, spells: Array<Pick<SpellRow, "id" | "party_member_id" | "uses_remaining">> = []): PlayerSheets {
  return {
    members: members as Member[],
    inventory: [],
    items: [],
    beasts: [],
    casting: { ...NO_CASTING, spells: spells as SpellRow[] },
  };
}

describe("sheetSpends (#1264)", () => {
  // Two casts at 3rd level from one row, and one more from a second row of the same level and pool (a sheet can hold two), are one spend of 3;
  // a pact slot is its own spend, so the database takes it from that pool.
  // Bugs caught: a cast in the batch lost (the last row counted wins), a pact slot charged to the ordinary pool.
  it("fails if casts are not counted per level and pool", () => {
    const now = sheets([{ id: "pm", spell_slots: [{ level: 3, max: 2, used: 0 }, { level: 3, max: 2, used: 0, pool: "pact" }, { level: 3, max: 1, used: 0 }] }]);
    const read = sheetsRead(now);
    settleSlotSpend(now, "pm", [{ level: 3, max: 2, used: 2 }, { level: 3, max: 2, used: 1, pool: "pact" }, { level: 3, max: 1, used: 1 }]);
    expect(sheetSpends(read, now)).toEqual([{ memberId: "pm", slots: [{ level: 3, pool: null, count: 3 }, { level: 3, pool: "pact", count: 1 }], resources: [], innate: [] }]);
  });

  // Second Wind stored at 1 of 2, spent to 0: one use. Action Surge never stored (the sheet reads it as full, 1 of 1) and written at 0: one use, with the
  // full entry for the database to start from. Bugs caught: a pool first written by the spend counted as nothing spent, or sent without its entry.
  it("fails if a resource use is miscounted, or a pool never stored is not counted from full", () => {
    const now = sheets([{ id: "pm", spell_slots: [], class_resources: { second_wind: { current: 1, max: 2, rest: "short" } } }]);
    const read = sheetsRead(now);
    settleFeatureSpend(now, "pm", { second_wind: { current: 0, max: 2, rest: "short" }, action_surge: { current: 0, max: 1, rest: "short" } });
    expect(sheetSpends(read, now)).toEqual([{
      memberId: "pm",
      slots: [],
      resources: [
        { key: "second_wind", count: 1, fresh: { current: 2, max: 2, rest: "short" } },
        { key: "action_surge", count: 1, fresh: { current: 1, max: 1, rest: "short" } },
      ],
      innate: [],
    }]);
  });

  // An innate grant at 2 uses spent to 1 is one use of that row; another member's grant and an unlimited one (null) are not spent.
  // Bug caught: an innate use written to the wrong member's spend, so the database refuses it or charges the wrong sheet.
  it("fails if an innate use is not charged to its own member", () => {
    const now = sheets(
      [{ id: "pm", spell_slots: [] }, { id: "other", spell_slots: [] }],
      [{ id: "row-a", party_member_id: "pm", uses_remaining: 2 }, { id: "row-b", party_member_id: "other", uses_remaining: 1 }, { id: "row-c", party_member_id: "pm", uses_remaining: null }],
    );
    const read = sheetsRead(now);
    settleInnateSpend(now, { memberId: "pm", spellRowId: "row-a", remaining: 1 });
    expect(sheetSpends(read, now)).toEqual([{ memberId: "pm", slots: [], resources: [], innate: [{ spellRowId: "row-a", count: 1 }] }]);
  });

  // A member the batch spent nothing from sends nothing. Bug caught: every ally in the fight getting a spend call (and a ring) on every batch.
  it("fails if a member nothing was spent from is sent a spend", () => {
    const now = sheets([{ id: "pm", spell_slots: [{ level: 1, max: 2, used: 1 }], class_resources: { rage: { current: 2, max: 3, rest: "long" } } }]);
    expect(sheetSpends(sheetsRead(now), now)).toEqual([]);
  });

  // The read is a copy: a sheet changed in place after it was taken still counts from what was read.
  // Bug caught: the read sharing the slot objects, so an in-place spend shows in both and the difference is nothing.
  it("fails if the read follows a later in-place change to the sheet", () => {
    const now = sheets([{ id: "pm", spell_slots: [{ level: 1, max: 2, used: 0 }] }]);
    const read = sheetsRead(now);
    now.members[0].spell_slots[0].used = 1;
    expect(sheetSpends(read, now)).toEqual([{ memberId: "pm", slots: [{ level: 1, pool: null, count: 1 }], resources: [], innate: [] }]);
  });
});
