// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import type { AskInputSchema } from "@edge-shared/agent/askContract";
import AskFormField from "./AskFormField.vue";

const field = (schema: AskInputSchema, modelValue: unknown = undefined) =>
  mount(AskFormField, { props: { inputKey: "lyrics", schema, modelValue, options: null, ties: [], noun: "this track" }, global: { stubs: { GeneratorLinksField: true } } });

describe("AskFormField multiline", () => {
  const lyrics: AskInputSchema = { type: "string", description: "d", label: "Lyrics", multiline: true };

  // Bug caught: lyrics drawn as a one-line field, so [Verse] markers on separate lines cannot be written.
  it("draws a textarea in the DM's hand that grows with its lines, and writes the text back", async () => {
    const w = field(lyrics, "a\nb\nc\nd\ne");
    const area = w.get('[data-testid="ask-multiline-lyrics"]');
    expect(area.element.tagName).toBe("TEXTAREA");
    expect(area.attributes("data-hand")).toBe("text");
    expect(area.attributes("rows")).toBe("6");
    await area.setValue("[Verse]\nsing");
    expect(w.emitted("update:modelValue")).toEqual([["[Verse]\nsing"]]);
  });

  it("an emptied box clears the input, and a plain string stays one line", async () => {
    const w = field(lyrics, "x");
    await w.get("textarea").setValue("  ");
    expect(w.emitted("update:modelValue")).toEqual([[undefined]]);
    expect(field({ type: "string", description: "d" }).find("textarea").exists()).toBe(false);
  });
});
