import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import StatBlockSaveFields from "./StatBlockSaveFields.vue";
import type { SaveStructure } from "@/types/statBlock.types";

function mountFields(save: SaveStructure) {
  return mount(StatBlockSaveFields, {
    props: { save },
    global: { stubs: { StatBlockDamagePartsEditor: true } },
  });
}

const base = (conditions: SaveStructure["conditions"]): SaveStructure => ({
  ability: "con",
  dc: 15,
  fail: [],
  success: "none",
  conditions,
});

describe("StatBlockSaveFields", () => {
  it("gives each ticked condition its own ends row", async () => {
    const save = base([
      { name: "Restrained", ends: { kind: "save", at: "end" } },
      { name: "Frightened" },
    ]);
    const w = mountFields(save);
    const selects = w
      .findAll("select")
      .filter((s) => s.text().includes("Save ends"));
    expect(selects).toHaveLength(2);
    await selects[1].setValue("rounds");
    expect(save.conditions[1].ends).toEqual({ kind: "rounds", remaining: 10 });
    expect(save.conditions[0].ends).toEqual({ kind: "save", at: "end" });
  });

  it("unticking removes only that condition and keeps the others' ends", async () => {
    const save = base([
      { name: "Blinded", ends: { kind: "save", at: "end" } },
      { name: "Prone" },
    ]);
    const w = mountFields(save);
    const box = w
      .findAll("label")
      .find((l) => l.text() === "Prone")
      ?.find("input");
    await box?.setValue(false);
    expect(save.conditions).toEqual([
      { name: "Blinded", ends: { kind: "save", at: "end" } },
    ]);
  });

  it("ticking adds a bare condition", async () => {
    const save = base([]);
    const w = mountFields(save);
    const box = w
      .findAll("label")
      .find((l) => l.text() === "Prone")
      ?.find("input");
    await box?.setValue(true);
    expect(save.conditions).toEqual([{ name: "Prone" }]);
  });

  it("sets and clears the round cap on a save end, keeping ability and DC", async () => {
    const save = base([
      {
        name: "Paralyzed",
        ends: { kind: "save", at: "end", ability: "wis", dc: 12 },
      },
    ]);
    const w = mountFields(save);
    const cap = w.find("input[placeholder='No cap']");
    await cap.setValue("10");
    expect(save.conditions[0].ends).toEqual({
      kind: "save",
      at: "end",
      ability: "wis",
      dc: 12,
      remaining: 10,
    });
    await cap.setValue("");
    expect(save.conditions[0].ends).toEqual({
      kind: "save",
      at: "end",
      ability: "wis",
      dc: 12,
    });
  });

  describe("changing what ends a condition", () => {
    const endsSelect = (w: ReturnType<typeof mountFields>, i = 0) =>
      w.findAll("select").filter((s) => s.text().includes("Save ends"))[i];

    it("moving a save-ends repeat from the end to the start of the turn keeps its ability, DC and cap", async () => {
      const save = base([
        { name: "Paralyzed", ends: { kind: "save", at: "end", ability: "wis", dc: 12, remaining: 10 } },
      ]);
      await endsSelect(mountFields(save)).setValue("save-start");
      expect(save.conditions[0].ends).toEqual({ kind: "save", at: "start", ability: "wis", dc: 12, remaining: 10 });
    });

    it("'When someone removes it' leaves the condition with no end at all", async () => {
      const save = base([{ name: "Paralyzed", ends: { kind: "save", at: "end" } }]);
      await endsSelect(mountFields(save)).setValue("none");
      expect("ends" in save.conditions[0]).toBe(false);
    });

    it.each([
      ["self-end", { kind: "turn", at: "end", of: "self" }],
      ["self-start", { kind: "turn", at: "start", of: "self" }],
      ["source-end", { kind: "turn", at: "end", of: "source" }],
      ["source-start", { kind: "turn", at: "start", of: "source" }],
    ])("%s ends it on that creature's turn", async (choice, expected) => {
      const save = base([{ name: "Blinded" }]);
      await endsSelect(mountFields(save)).setValue(choice);
      expect(save.conditions[0].ends).toEqual(expected);
    });

    it("shows a turn-based end as that choice when the row is drawn", () => {
      const save = base([{ name: "Blinded", ends: { kind: "turn", at: "start", of: "source" } }]);
      expect((endsSelect(mountFields(save)).element as HTMLSelectElement).value).toBe("source-start");
    });

    it("a rounds field below one is raised to one", async () => {
      const save = base([{ name: "Blinded", ends: { kind: "rounds", remaining: 5 } }]);
      await mountFields(save).find("input[type=number][min='1']").setValue("0");
      expect(save.conditions[0].ends).toEqual({ kind: "rounds", remaining: 1 });
    });

    it("a round cap below one is raised to one", async () => {
      const save = base([{ name: "Paralyzed", ends: { kind: "save", at: "end" } }]);
      await mountFields(save).find("input[placeholder='No cap']").setValue("0");
      expect(save.conditions[0].ends).toEqual({ kind: "save", at: "end", remaining: 1 });
    });
  });
});
