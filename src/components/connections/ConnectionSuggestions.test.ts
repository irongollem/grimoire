import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { ref } from "vue";
import type { ResolvedSuggestion } from "@/ai/useConnectionSuggestions";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  suggest: vi.fn(),
  dismiss: vi.fn(),
  dismissAll: vi.fn(),
  toastError: vi.fn(),
  aiEnabled: { value: true },
}));
const suggestions = ref<ResolvedSuggestion[]>([]);
const setAside = ref<{ target_name: string; claim: string; reason: string }[]>([]);
const provenance = ref<{ generatorType: string } | null>({ generatorType: "npc_relationship_suggestion" });

vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => ({ get isAiEnabled() { return mocks.aiEnabled.value; } }),
}));
vi.mock("@/composables/connections/useConnections", () => ({
  useCreateConnection: () => ({ mutateAsync: mocks.create }),
}));
vi.mock("@/composables/ai/useAiCredits", () => ({ useAiCredits: () => ({ costOf: () => 1 }) }));
vi.mock("@/composables/ai/useGenerationGate", () => ({ useGenerationGate: () => ({ canSpend: () => true }) }));
vi.mock("@/composables/ai/useCampaignProviders", () => ({
  useCampaignProviders: () => ({ textCredits: (n: number) => n, textIsByok: ref(false) }),
}));
vi.mock("@/composables/useToast", () => ({ useToast: () => ({ error: mocks.toastError, success: vi.fn() }) }));
vi.mock("@/ai/useConnectionSuggestions", () => ({
  useConnectionSuggestions: () => ({
    suggest: mocks.suggest,
    forSubject: () => ({
      isGenerating: ref(false),
      error: ref(null),
      suggestions,
      setAside,
      provenance,
      dismiss: mocks.dismiss,
      dismissAll: mocks.dismissAll,
    }),
  }),
}));

import ConnectionSuggestions from "./ConnectionSuggestions.vue";

const npcSubject = { kind: "npc", id: "n1" } as const;

function mountFor(subject: { kind: "npc" | "item" | "faction"; id: string } = npcSubject, subjectName = "Mara Voss") {
  return mount(ConnectionSuggestions, {
    props: { subject, subjectName },
    global: { stubs: { GenerationCostBadge: true } },
  });
}

describe("ConnectionSuggestions", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => typeof m === "function" && m.mockReset());
    mocks.create.mockResolvedValue(undefined);
    mocks.aiEnabled.value = true;
    suggestions.value = [];
    setAside.value = [];
    provenance.value = { generatorType: "npc_relationship_suggestion" };
  });

  it("renders nothing when AI is off for the campaign", () => {
    mocks.aiEnabled.value = false;
    expect(mountFor().html()).toBe("<!--v-if-->");
  });

  it("opens a steer box and asks for the subject with the steer", async () => {
    const w = mountFor();
    expect(w.text()).not.toContain("Steer the suggestions");
    await w.findAll("button").find((b) => b.text() === "Suggest")!.trigger("click");
    expect(w.text()).toContain("Steer the suggestions");
    await w.find("input").setValue("a grudge");
    mocks.suggest.mockResolvedValue(true);
    await w.findAll("button").find((b) => b.text().includes("Suggest connections"))!.trigger("click");
    expect(mocks.suggest).toHaveBeenCalledWith(npcSubject, "a grudge");
  });

  it("accepts a link with the direction the suggestion names, and the provenance", async () => {
    suggestions.value = [
      { kind: "link", target_kind: "deity", target_name: "The Drowned Lady", target_id: "d1", type: "worships", subject_is_from: true, notes: "Prays at the weir." },
    ];
    const w = mountFor();
    expect(w.text()).toContain("The Drowned Lady");
    expect(w.text()).toContain("worships");
    await w.findAll("button").find((b) => b.text() === "Accept")!.trigger("click");
    await flushPromises();
    expect(mocks.create).toHaveBeenCalledTimes(1);
    const input = mocks.create.mock.calls[0][0];
    expect(input).toMatchObject({
      subject: npcSubject,
      other: { kind: "deity", id: "d1", name: "The Drowned Lady" },
      choice: { key: "worships", subjectIsFrom: true },
      note: "Prays at the weir.",
      aiProvenance: { generatorType: "npc_relationship_suggestion" },
    });
    expect(mocks.dismiss).toHaveBeenCalledTimes(1);
  });

  it("refuses a suggestion the catalogue holds no choice for, rather than guessing one", async () => {
    suggestions.value = [
      { kind: "link", target_kind: "faction", target_name: "Dock Wardens", target_id: "f1", type: "controls", subject_is_from: false, notes: "" },
    ];
    const w = mountFor({ kind: "item", id: "i1" } as never);
    // An item has no "controls" with a faction, so the accept is refused.
    await w.findAll("button").find((b) => b.text() === "Accept")!.trigger("click");
    await flushPromises();
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.toastError).toHaveBeenCalledWith("That kind of connection is not available for this pair.");
  });

  it("accepts a membership with its role", async () => {
    suggestions.value = [
      { kind: "membership", target_kind: "faction", target_name: "Dock Wardens", target_id: "f1", role: "Informant", notes: "Sells secrets." },
    ];
    const w = mountFor();
    await w.findAll("button").find((b) => b.text() === "Accept")!.trigger("click");
    await flushPromises();
    expect(mocks.create.mock.calls[0][0]).toMatchObject({
      other: { kind: "faction", id: "f1" },
      choice: { key: "member_of", home: "membership" },
      role: "Informant",
    });
  });

  it("accepts a person to a faction from the faction's sheet", async () => {
    suggestions.value = [
      { kind: "membership", target_kind: "npc", target_name: "Harl", target_id: "n9", role: "Officer", notes: "" },
    ];
    const w = mountFor({ kind: "faction", id: "f1" } as never, "Toll-men");
    await w.findAll("button").find((b) => b.text() === "Accept")!.trigger("click");
    await flushPromises();
    expect(mocks.create.mock.calls[0][0]).toMatchObject({
      subject: { kind: "faction", id: "f1" },
      other: { kind: "npc", id: "n9" },
      choice: { home: "membership", subjectIsFrom: false },
      role: "Officer",
    });
  });

  it("accepts kin as the record the relation names: a parent is the subject's `to` end", async () => {
    suggestions.value = [
      { kind: "kin", target_name: "Brenna", target_id: "n2", target_type: "npc", relation: "parent", parent_role: "mother", notes: "Shares her surname." },
      { kind: "kin", target_name: "Tamsin", target_id: "p1", target_type: "pc", relation: "child", parent_role: null, notes: "" },
    ];
    const w = mountFor();
    const accepts = w.findAll("button").filter((b) => b.text() === "Accept");
    await accepts[0].trigger("click");
    await flushPromises();
    await accepts[1].trigger("click");
    await flushPromises();
    expect(mocks.create.mock.calls[0][0]).toMatchObject({
      other: { kind: "npc", id: "n2" },
      choice: { key: "parent_of", home: "kin", subjectIsFrom: false },
    });
    expect(mocks.create.mock.calls[1][0]).toMatchObject({
      other: { kind: "party_member", id: "p1" },
      choice: { key: "parent_of", home: "kin", subjectIsFrom: true },
    });
  });

  it("keeps the suggestion and says so when the write fails", async () => {
    suggestions.value = [
      { kind: "link", target_kind: "deity", target_name: "The Drowned Lady", target_id: "d1", type: "worships", subject_is_from: true, notes: "" },
    ];
    mocks.create.mockRejectedValue(new Error("nope"));
    const w = mountFor();
    await w.findAll("button").find((b) => b.text() === "Accept")!.trigger("click");
    await flushPromises();
    expect(mocks.toastError).toHaveBeenCalledWith("nope");
    expect(mocks.dismiss).not.toHaveBeenCalled();
  });

  it("dismisses one, and all", async () => {
    suggestions.value = [
      { kind: "link", target_kind: "deity", target_name: "The Drowned Lady", target_id: "d1", type: "worships", subject_is_from: true, notes: "" },
    ];
    const w = mountFor();
    await w.findAll("button").find((b) => b.text() === "Dismiss")!.trigger("click");
    expect(mocks.dismiss).toHaveBeenCalledWith(suggestions.value[0]);
    await w.findAll("button").find((b) => b.text() === "Dismiss all")!.trigger("click");
    expect(mocks.dismissAll).toHaveBeenCalledTimes(1);
  });

  it("shows set-aside claims as one muted line each, in plain words", () => {
    setAside.value = [{ target_name: "Weir Chapel", claim: "The Ferry Bell is kept at Weir Chapel", reason: "Brenna carries it" }];
    const w = mountFor({ kind: "item", id: "i1" } as never, "The Ferry Bell");
    expect(w.text()).toContain('Set aside: "The Ferry Bell is kept at Weir Chapel". Brenna carries it.');
    expect(w.findAll("button").filter((b) => b.text() === "Accept")).toHaveLength(0);
  });
});
