import { describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import { ASK_GENERATORS } from "@edge-shared/agent/askContract";
vi.mock("@/composables/deities/useDeities", () => ({
  useAllPantheons: () => ({ data: ref([{ id: "00000000-0000-4000-8000-0000000000d1", name: "The Seven" }]) }),
}));

import { ASK_LISTS, ASK_RECORD_PICKERS, isRecordPicker } from "./askOptions";

const inputs = ASK_GENERATORS.flatMap((g) => Object.entries(g.inputs).map(([key, schema]) => ({ id: g.id, key, schema })));

describe("the contract's form metadata", () => {
  // Bug caught: an input naming a list the browser does not have, which would render as an empty pick the DM cannot fill.
  it("names only lists the option registry has", () => {
    for (const { id, key, schema } of inputs) {
      if (schema.type === "string" && schema.list !== undefined) expect(Object.keys(ASK_LISTS), `${id}.${key}`).toContain(schema.list);
    }
  });

  // Bug caught: a record input naming a kind no picker serves, so the id could only be typed by hand.
  it("names only records a picker serves", () => {
    for (const { id, key, schema } of inputs) {
      if (schema.type === "string" && schema.record !== undefined) expect(isRecordPicker(schema.record), `${id}.${key}`).toBe(true);
    }
    expect(ASK_RECORD_PICKERS.length).toBeGreaterThan(0);
  });

  // Bug caught: a `when` hanging on an input the generator does not have, which would hide the input for ever.
  it("hangs every show-when on an input of the same generator", () => {
    for (const g of ASK_GENERATORS) {
      for (const [key, schema] of Object.entries(g.inputs)) {
        if (!schema.when) continue;
        for (const on of typeof schema.when.key === "string" ? [schema.when.key] : schema.when.key) expect(Object.keys(g.inputs), `${g.id}.${key}`).toContain(on);
      }
    }
  });

  // Bug caught: a button-opened card whose defaults the schema would then drop as unknown.
  it("opens a card only with inputs the generator has", () => {
    for (const g of ASK_GENERATORS) for (const key of Object.keys(g.opened ?? {})) expect(Object.keys(g.inputs), `${g.id}.${key}`).toContain(key);
  });
});

describe("the catalogue generators' lists", () => {
  // Bug caught: the pantheon pick offered names, so the deity's adapter (which looks the pantheon up by id) joined none.
  it("offers a pantheon by its id and shows its name", () => {
    expect(ASK_LISTS.pantheon().value).toEqual([{ value: "00000000-0000-4000-8000-0000000000d1", label: "The Seven" }]);
  });

  // Bug caught: the item type list showed and sent the label ("Wondrous Item"), which the page's own select never did.
  it("sends an item type's key and shows its label", () => {
    expect(ASK_LISTS.item_type().value).toContainEqual({ value: "wondrous_item", label: "Wondrous Item" });
    expect(ASK_LISTS.location_type().value).toContainEqual({ value: "city", label: "City" });
  });

  // Bug caught: the skill focus sent the skill's key ("animal_handling"), but the page sends the label the generator reads.
  it("sends a skill by its label, as the background page does", () => {
    expect(ASK_LISTS.skill().value).toContainEqual({ value: "Animal Handling", label: "Animal Handling" });
  });

  // Bug caught: the spell's level listed a digit with no word, so the card showed "0" and "1" instead of Cantrip and 1st.
  it("words every spell level the page words", () => {
    const level = ASK_GENERATORS.find((g) => g.id === "spell")?.inputs.level;
    if (level?.type !== "string" || !level.enum) throw new Error("the spell level is a list of digits");
    expect(level.enum.map((digit) => level.optionLabels?.[digit])).toEqual(["Cantrip", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th"]);
  });
});
