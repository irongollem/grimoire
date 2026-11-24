import { describe, expect, it } from "vitest";
import { askGenerator } from "@edge-shared/agent/askContract";
import { readAskInputs } from "./askInputs";

const IDS = ["class", "subclass", "recipe"] as const;

describe("the class, archetype and recipe cards (#1270)", () => {
  // Bug caught: a card with no box to describe the thing in, so Create could never be pressed.
  it("opens each with a concept box worded for it, as its panel's was", () => {
    for (const id of IDS) {
      const concept = askGenerator(id)?.concept;
      expect(concept?.required, id).toBe(true);
      expect(concept?.max, id).toBe(1000);
      expect(concept?.placeholder.length, id).toBeGreaterThan(20);
    }
  });

  // Bug caught: an input with no label, which the form would show as its key ("caster progression") instead of the DM's word.
  it("labels every input", () => {
    for (const id of IDS) {
      for (const [key, schema] of Object.entries(askGenerator(id)?.inputs ?? {})) expect(schema.label, `${id}.${key}`).toBeTruthy();
    }
  });

  // Bug caught: hit die kept as a number, which the form draws as a typed box where the panel offered four dice.
  it("offers the hit die as the page's four dice, worded d6 to d12", () => {
    const die = askGenerator("class")?.inputs.hit_die;
    if (die?.type !== "string" || !die.enum) throw new Error("the hit die is a short list");
    expect(die.enum.map((d) => die.optionLabels?.[d])).toEqual(["d6", "d8", "d10", "d12"]);
    expect(readAskInputs("class", { hit_die: "10" })).toEqual({ hit_die: "10" });
    expect(readAskInputs("class", { hit_die: "7" })).toEqual({});
  });

  // Bug caught: a spellcasting word outside the page's list reaching the generator as a constraint.
  it("offers spellcasting as the page's five progressions and drops any other", () => {
    expect(readAskInputs("class", { caster_progression: "Pact" })).toEqual({ caster_progression: "pact" });
    expect(readAskInputs("class", { caster_progression: "arcane" })).toEqual({});
  });

  // Bug caught: the parent class left as free text, so a typo made a quote that could never run.
  it("takes the parent class from a searchable list and asks for it when it was not said", () => {
    const parent = askGenerator("subclass")?.inputs.parent_class;
    expect(parent).toMatchObject({ type: "string", list: "parent_class" });
    expect(askGenerator("subclass")?.ask).toEqual(["parent_class"]);
  });

  // Bug caught: the recipe's Output item typed as a name, which the old panel's picker never did.
  it("picks the output item as a record and the discipline from a list", () => {
    expect(askGenerator("recipe")?.inputs.output_item_id).toMatchObject({ type: "string", record: "item", placeholder: "Let the AI invent one" });
    expect(askGenerator("recipe")?.inputs.discipline).toMatchObject({ type: "string", list: "crafting_discipline" });
  });
});
