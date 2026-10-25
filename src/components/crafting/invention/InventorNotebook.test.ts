import { flushPromises, mount } from "@vue/test-utils";
import { computed, ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import InventorNotebook from "./InventorNotebook.vue";

const mocks = vi.hoisted(() => ({
  available: { value: true },
  list: { value: [] as unknown[] },
  inventFromIdea: vi.fn(),
  revise: vi.fn(),
  submit: vi.fn(),
  discard: vi.fn(),
  confirm: vi.fn(),
  requireCredits: vi.fn(),
  query: {} as Record<string, string>,
}));

vi.mock("vue-router", () => ({
  useRoute: () => ({ query: mocks.query }),
  useRouter: () => ({ push: vi.fn() }),
  RouterLink: { props: ["to"], template: "<a><slot /></a>" },
}));
vi.mock("@/composables/useConfirm", () => ({ useConfirm: () => ({ confirm: mocks.confirm }) }));
vi.mock("@/composables/ai/useAiCredits", () => ({ useAiCredits: () => ({ costOf: () => 1 }) }));
vi.mock("@/composables/ai/useOutOfCredits", () => ({ useOutOfCredits: () => ({ requireCredits: mocks.requireCredits }) }));
vi.mock("@/composables/crafting/useCraftInventions", () => ({
  INVENTION_COST_KEY: "recipe_invention",
  INVENTION_NOTE_LIMIT: 500,
  INVENTION_WISH_LIMIT: 1000,
  useInventionAvailable: () => computed(() => mocks.available.value),
  useMyInventions: () => ({ data: mocks.list, isLoading: ref(false), error: ref(null) }),
  useCraftInventions: () => ({
    busy: ref(false),
    ideaPending: ref(false),
    revisePending: ref(false),
    submitPending: ref(false),
    ideaError: ref(null),
    reviseError: ref(null),
    submitError: ref(null),
    discardError: ref(null),
    inventFromIdea: mocks.inventFromIdea,
    revise: mocks.revise,
    submit: mocks.submit,
    discard: mocks.discard,
    resetRevise: vi.fn(),
    resetSubmit: vi.fn(),
  }),
}));
vi.mock("@/components/common/ai/GenerationCostBadge.vue", () => ({ default: { template: "<span>cost</span>" } }));
vi.mock("@/components/crafting/invention/InventionDraftCard.vue", () => ({
  default: {
    props: ["invention"],
    template: '<article><slot name="note" /><slot name="actions" /></article>',
  },
}));

function inv(status: string, over: Record<string, unknown> = {}) {
  return { id: "i1", status, recipe_id: null, draft: { item: { name: "Lantern" } }, ...over };
}

function mountIt(props: Record<string, unknown> = {}) {
  return mount(InventorNotebook, {
    props: { disciplineId: "tinkering", member: { id: "m1", name: "Nessa" }, ...props },
  });
}
const button = (w: ReturnType<typeof mountIt>, label: string) =>
  w.findAll("button").find((b) => b.text().includes(label));

beforeEach(() => {
  mocks.available.value = true;
  mocks.list.value = [];
  mocks.requireCredits.mockReturnValue(true);
  mocks.confirm.mockResolvedValue(true);
  for (const f of [mocks.inventFromIdea, mocks.revise, mocks.submit, mocks.discard]) f.mockReset();
  mocks.query = {};
});

describe("InventorNotebook", () => {
  it("explains when inventing is off, with no form", () => {
    mocks.available.value = false;
    const w = mountIt();
    expect(w.find("[data-testid=unavailable]").exists()).toBe(true);
    expect(w.find("textarea").exists()).toBe(false);
  });

  it("says so when the notebook is empty", () => {
    expect(mountIt().find("[data-testid=empty]").exists()).toBe(true);
  });

  it("keeps Invent off until there is a wish, then asks with the trimmed wish", async () => {
    mocks.inventFromIdea.mockResolvedValue(null);
    const w = mountIt();
    expect(button(w, "Invent")?.attributes("disabled")).toBeDefined();
    await w.find("textarea").setValue("  a lantern  ");
    await button(w, "Invent")?.trigger("click");
    expect(mocks.inventFromIdea).toHaveBeenCalledWith("m1", "tinkering", "a lantern");
  });

  it("does not ask when the player cannot pay", async () => {
    mocks.requireCredits.mockReturnValue(false);
    const w = mountIt();
    await w.find("textarea").setValue("a lantern");
    await button(w, "Invent")?.trigger("click");
    expect(mocks.inventFromIdea).not.toHaveBeenCalled();
  });

  it("offers send, revise and discard on a draft, and sends it", async () => {
    mocks.list.value = [inv("draft")];
    const w = mountIt();
    expect(button(w, "Discard")).toBeDefined();
    expect(button(w, "Revise")).toBeDefined();
    await button(w, "Send to your DM")?.trigger("click");
    expect(mocks.submit).toHaveBeenCalledWith("i1");
  });

  it("opens a note field to revise and sends the note", async () => {
    mocks.list.value = [inv("draft")];
    mocks.revise.mockResolvedValue(null);
    const w = mountIt();
    await button(w, "Revise")?.trigger("click");
    const notes = w.findAll("textarea");
    await notes[notes.length - 1]?.setValue("lighter");
    await button(w, "Revise")?.trigger("click");
    expect(mocks.revise).toHaveBeenCalledWith("i1", "lighter");
  });

  it("only deletes after the player confirms", async () => {
    mocks.list.value = [inv("pending")];
    mocks.confirm.mockResolvedValue(false);
    const w = mountIt();
    await button(w, "Withdraw")?.trigger("click");
    await flushPromises();
    expect(mocks.discard).not.toHaveBeenCalled();
    mocks.confirm.mockResolvedValue(true);
    await button(w, "Withdraw")?.trigger("click");
    await flushPromises();
    expect(mocks.discard).toHaveBeenCalledWith("i1");
  });

  it("links an approved draft to its recipe", () => {
    mocks.list.value = [inv("approved", { recipe_id: "r1" })];
    const w = mountIt();
    expect(button(w, "Clear from notebook")).toBeDefined();
    expect(w.text()).toContain("Open the recipe");
  });

  it("is read-only in a DM preview", () => {
    mocks.list.value = [inv("draft")];
    const w = mountIt({ previewing: true });
    expect(w.find("textarea").exists()).toBe(false);
    expect(button(w, "Send to your DM")).toBeUndefined();
    expect(w.text()).toContain("Only the player can invent");
  });
});
