// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { computed, ref } from "vue";
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

vi.mock("@/ai/ask/askAsides", () => ({ ASK_ASIDES: { encounter_where: () => computed(() => "Uses Coast road encounters here") } }));

const usable = ref(false);
vi.mock("@/ai/ask/askAvailable", () => ({ ASK_AVAILABLE: { group_portrait: () => computed(() => usable.value) } }));

const encounter = ASK_GENERATORS.find((g) => g.id === "encounter")!;
const npc = ASK_GENERATORS.find((g) => g.id === "npc")!;
const form = (inputs: Record<string, unknown> = {}) => mount(AskForm, { props: { generator: npc, inputs }, global: { stubs: { GeneratorLinksField: true } } });

describe("AskForm asides", () => {
  // Bug caught: the encounter's "Uses <table> here" line lost with the panel, so the DM does not learn the place has its own table.
  it("draws the line an input's aside gives, under that input only", () => {
    const w = mount(AskForm, { props: { generator: encounter, inputs: { location_id: FACTION } }, global: { stubs: { GeneratorLinksField: true } } });
    expect(w.get('[data-testid="ask-aside-location_id"]').text()).toBe("Uses Coast road encounters here");
    expect(w.find('[data-testid="ask-aside-difficulty"]').exists()).toBe(false);
  });
});

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

describe("AskForm with a concept box above it", () => {
  // Bug caught: "Nothing here to set." under a concept box, as if the box were not the thing to set.
  it("says nothing when the form has no inputs and a concept box is above it, and keeps the line for Adjust", () => {
    const bare = { ...encounter, id: "bare", inputs: {} };
    const props = { generator: bare, inputs: {} };
    expect(mount(AskForm, { props: { ...props, boxed: true }, global: { stubs: { GeneratorLinksField: true } } }).text()).toBe("");
    expect(mount(AskForm, { props, global: { stubs: { GeneratorLinksField: true } } }).text()).toContain("Nothing here to set.");
  });
});

describe("AskForm availability", () => {
  const trap = ASK_GENERATORS.find((g) => g.id === "trap")!;
  const party = (inputs: Record<string, unknown>) => mount(AskForm, { props: { generator: trap, inputs }, global: { stubs: { GeneratorLinksField: true } } });

  // Bug caught: the party switch shown for a campaign with no group portrait, where the quote then had to refuse it in a sentence.
  it("hides an input the campaign cannot use, and shows it once it can", async () => {
    usable.value = false;
    const w = party({ image: true });
    expect(w.find('[data-testid="ask-field-party_in_picture"]').exists()).toBe(false);
    usable.value = true;
    await w.vm.$nextTick();
    expect(w.find('[data-testid="ask-field-party_in_picture"]').exists()).toBe(true);
  });

  // Bug caught: a value for a hidden input riding along into the quote (a model-typed request for the party with no portrait to send).
  it("drops the value of an input the campaign cannot use, on the form's first read of it", () => {
    usable.value = false;
    const w = party({ image: true, party_in_picture: true });
    expect(w.emitted("update")?.at(-1)).toEqual([{ image: true }]);
  });

  it("emits nothing when no unusable input holds a value", () => {
    usable.value = false;
    expect(party({ image: true }).emitted("update")).toBeUndefined();
  });
});
