// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { computed } from "vue";
import { mount } from "@vue/test-utils";
import { ASK_GENERATORS } from "@edge-shared/agent/askContract";
import AskForm from "./AskForm.vue";

const FACTION = "00000000-0000-4000-8000-0000000000e1";

vi.mock("@/ai/ask/askOptions", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/ai/ask/askOptions")>(),
  ASK_LISTS: {
    species: () => computed(() => [{ value: "Elf", label: "Elf" }, { value: "Tiefling", label: "Tiefling" }]),
    alignment: () => computed(() => []),
    faction_role: () => computed(() => [{ value: "Envoy", label: "Envoy" }]),
    npc_stat_template: () => computed(() => []),
  },
  useAskRecordOptions: () => ({
    npc: computed(() => []), party_member: computed(() => []), location: computed(() => []),
    faction: computed(() => [{ id: "00000000-0000-4000-8000-0000000000e1", name: "Tidewardens" }]),
  }),
}));
vi.mock("@/ai/ask/adapters/askLinkRecords", () => ({ useAskLinkRecords: () => ({ names: computed(() => undefined), loading: computed(() => false), failed: computed(() => false) }) }));

const npc = ASK_GENERATORS.find((g) => g.id === "npc")!;
const form = (inputs: Record<string, unknown> = {}) => mount(AskForm, { props: { generator: npc, inputs }, global: { stubs: { GeneratorLinksField: true } } });

describe("AskForm", () => {
  // Bug caught: the six extras of the NPC form laid out open, which is the wall of controls the fold rows exist to remove.
  it("folds the group's inputs into one row that says what it holds, and opens it in place", async () => {
    const w = form({ faction_id: FACTION, faction_role: "Envoy" });
    expect(w.find('[data-testid="ask-field-faction_id"]').exists()).toBe(false);
    expect(w.get('[data-testid="ask-group-summary-Where they stand"]').text()).toBe("Tidewardens · Envoy");
    await w.get('[data-testid="ask-group-Where they stand"] button').trigger("click");
    expect(w.find('[data-testid="ask-field-faction_id"]').exists()).toBe(true);
  });

  // Bug caught: a role for no faction shown, then sent.
  it("shows the faction role only once there is a faction", async () => {
    const w = form();
    await w.get('[data-testid="ask-group-Where they stand"] button').trigger("click");
    expect(w.find('[data-testid="ask-field-faction_role"]').exists()).toBe(false);
    await w.setProps({ inputs: { faction_id: FACTION } });
    expect(w.find('[data-testid="ask-field-faction_role"]').exists()).toBe(true);
  });

  // Bug caught: clearing the faction leaving its role in the inputs, so the quote still names a role nobody can see.
  it("clears the role when the faction is cleared", async () => {
    const w = form({ faction_id: FACTION, faction_role: "Envoy" });
    await w.get('[data-testid="ask-group-Where they stand"] button').trigger("click");
    await w.get('[data-testid="ask-field-faction_id"] button[type="button"]').trigger("mousedown");
    expect(w.emitted("update")?.[0]?.[0]).toEqual({});
  });

  // Bug caught: a short fixed set drawn as a pick instead of chips, or a chip press emitting something other than the word.
  it("draws a short enum as chips and emits the whole inputs on a press", async () => {
    const w = form({ race: "Elf" });
    await w.get('[data-testid="ask-group-At the table"] button').trigger("click");
    const friendly = w.findAll("button").find((b) => b.text() === "Friendly");
    await friendly?.trigger("click");
    expect(w.emitted("update")?.[0]?.[0]).toEqual({ race: "Elf", attitude: "friendly" });
  });

  // Bug caught: the model's own instructions ("ask unless the DM said") printed under a switch for the DM to read.
  it("never shows a switch's model description, only its DM hint", () => {
    const w = form();
    expect(w.text()).not.toContain("ask unless the DM said");
    expect(w.text()).toContain("A disguised name and portrait");
  });

  // Bug caught: a species typed into a free text box, so nothing guarantees it is one of the world's.
  it("draws a list input as a searchable pick, never a text box", () => {
    const w = form();
    const field = w.get('[data-testid="ask-field-race"]');
    expect(field.find('input[data-field="combobox"]').exists()).toBe(true);
  });
});
