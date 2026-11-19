import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { ref } from "vue";
import type { PremiseSuggestion, TruthSuggestion } from "@/ai/useCanonSuggestions";
import type { CanonEntry } from "@/types/canon.types";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  nameKnower: vi.fn(),
  suggest: vi.fn(),
  dismiss: vi.fn(),
  dismissAll: vi.fn(),
  confirm: vi.fn(),
  toastError: vi.fn(),
  aiEnabled: { value: true },
}));
const suggestions = ref<(PremiseSuggestion | TruthSuggestion)[]>([]);
const setAside = ref<{ claim: string; reason: string }[]>([]);
const provenance = ref<{ generatorType: string } | null>({ generatorType: "canon_premise_suggestion" });

vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ get isAiEnabled() { return mocks.aiEnabled.value; } }) }));
vi.mock("@/composables/canon/useCanonEntries", () => ({
  useCreateCanonEntry: () => ({ mutateAsync: mocks.create }),
  useUpdateCanonEntry: () => ({ mutateAsync: mocks.update }),
}));
vi.mock("@/composables/canon/useKnownTo", () => ({ useKnownTo: () => ({ nameKnower: mocks.nameKnower }) }));
vi.mock("@/composables/ai/useAiCredits", () => ({ useAiCredits: () => ({ costOf: () => 1 }) }));
vi.mock("@/composables/ai/useGenerationGate", () => ({ useGenerationGate: () => ({ canSpend: () => true }) }));
vi.mock("@/composables/ai/useCampaignProviders", () => ({ useCampaignProviders: () => ({ textCredits: (n: number) => n, textIsByok: ref(false) }) }));
vi.mock("@/composables/useToast", () => ({ useToast: () => ({ error: mocks.toastError }) }));
vi.mock("@/composables/useConfirm", () => ({ useConfirm: () => ({ confirm: mocks.confirm }) }));
vi.mock("@/ai/useCanonSuggestions", () => ({
  useCanonSuggestions: () => ({
    suggest: mocks.suggest,
    suggestions,
    setAside,
    provenance,
    isGenerating: ref(false),
    error: ref(null),
    dismiss: mocks.dismiss,
    dismissAll: mocks.dismissAll,
  }),
}));

import CanonSuggestions from "./CanonSuggestions.vue";

const entry = (over: Partial<CanonEntry>): CanonEntry => ({
  id: "e1", user_id: "u", campaign_id: "c1", part: "premise", premise_kind: "theme", knowledge: null, title: "x",
  body: null, sort_order: 0, player_visible_to: [], image_url: null, ai_provenance: null, created_at: "", updated_at: "", ...over,
});

function mountIt(mode: "premise" | "truths", entries: CanonEntry[] = []) {
  return mount(CanonSuggestions, { props: { mode, entries } });
}
const click = async (w: ReturnType<typeof mountIt>, label: string) => {
  await w.findAll("button").find((b) => b.text() === label)!.trigger("click");
  await flushPromises();
};

beforeEach(() => {
  for (const m of [mocks.create, mocks.update, mocks.nameKnower, mocks.suggest, mocks.dismiss, mocks.dismissAll, mocks.confirm, mocks.toastError]) m.mockReset();
  mocks.aiEnabled.value = true;
  mocks.create.mockResolvedValue({ id: "new1" });
  mocks.confirm.mockResolvedValue(true);
  suggestions.value = [];
  setAside.value = [];
});

describe("CanonSuggestions", () => {
  it("renders nothing when AI is off for the campaign, so no spend can start", () => {
    mocks.aiEnabled.value = false;
    expect(mountIt("premise").find("button").exists()).toBe(false);
  });

  it("writes nothing when the proposals arrive; only Accept writes", () => {
    suggestions.value = [{ kind: "theme", text: "Mercy" }];
    const w = mountIt("premise");
    expect(w.text()).toContain("Mercy");
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("Dismiss removes the proposal and writes nothing", async () => {
    const s: PremiseSuggestion = { kind: "theme", text: "Mercy" };
    suggestions.value = [s];
    const w = mountIt("premise");
    await click(w, "Dismiss");
    expect(mocks.dismiss).toHaveBeenCalledWith(s);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("accepts a theme as a new premise entry carrying the run's provenance", async () => {
    suggestions.value = [{ kind: "theme", text: "Mercy" }];
    const w = mountIt("premise", [entry({ id: "t0", premise_kind: "theme" })]);
    await click(w, "Accept");
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      part: "premise", premise_kind: "theme", title: "Mercy", sort_order: 1, ai_provenance: { generatorType: "canon_premise_suggestion" },
    }));
  });

  it("asks before replacing an existing pitch, and updates that row rather than adding a second", async () => {
    suggestions.value = [{ kind: "pitch", text: "A drowned kingdom." }];
    const w = mountIt("premise", [entry({ id: "p1", premise_kind: "pitch" })]);
    await click(w, "Accept");
    expect(mocks.confirm).toHaveBeenCalledWith("Replace the existing text?", expect.anything());
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.update).toHaveBeenCalledWith({ id: "p1", patch: expect.objectContaining({ body: expect.stringContaining("A drowned kingdom."), ai_provenance: expect.anything() }) });
  });

  it("writes nothing when the DM declines the replacement, and keeps the proposal", async () => {
    mocks.confirm.mockResolvedValue(false);
    suggestions.value = [{ kind: "voice", text: "Dry and warm." }];
    const w = mountIt("premise", [entry({ id: "v1", premise_kind: "voice" })]);
    await click(w, "Accept");
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.dismiss).not.toHaveBeenCalled();
  });

  it("accepting a truth creates it with its mark, then names each knower", async () => {
    suggestions.value = [{ title: "The bell tolls for the drowned", knowledge: "some", knowers: [{ kind: "npc", id: "n1", name: "Mara Voss" }, { kind: "faction", id: "f1", name: "The Iron Concord" }] }];
    const w = mountIt("truths");
    await click(w, "Accept");
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ part: "truth", knowledge: "some", title: "The bell tolls for the drowned" }));
    expect(mocks.nameKnower).toHaveBeenCalledTimes(2);
    // The tie carries the run's provenance too, as every accepted AI link does.
    expect(mocks.nameKnower).toHaveBeenCalledWith("new1", { kind: "npc", id: "n1", name: "Mara Voss" }, expect.objectContaining({ generatorType: expect.any(String) }));
  });

  it("names nobody when the truth could not be created", async () => {
    mocks.create.mockRejectedValue(new Error("boom"));
    suggestions.value = [{ title: "T", knowledge: "some", knowers: [{ kind: "npc", id: "n1", name: "Mara" }] }];
    const w = mountIt("truths");
    await click(w, "Accept");
    expect(mocks.nameKnower).not.toHaveBeenCalled();
    expect(mocks.dismiss).not.toHaveBeenCalled();
    expect(mocks.toastError).toHaveBeenCalledWith("boom");
  });

  it("shows a refused claim as set aside", () => {
    setAside.value = [{ claim: "No war", reason: "lines are agreed at the table" }];
    expect(mountIt("premise").text()).toContain('Set aside: "No war". Lines are agreed at the table.');
  });
});
