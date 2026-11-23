// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { ref } from "vue";
import { AI_PROMPT_LIMIT_SHORT } from "@/ai/utils";

const mocks = vi.hoisted(() => ({ generate: vi.fn(), clearResult: vi.fn() }));

vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ isAiEnabled: true }) }));
vi.mock("@/stores/encounterRun", () => ({ useEncounterRunStore: () => ({ availableNpcs: [], factions: [] }) }));
vi.mock("@/composables/monsters/useMonsterIndex", () => ({ useMonsterIndex: () => ({ data: ref([]) }) }));
vi.mock("@/ai/useComplicationGeneration", () => ({
  useComplicationGeneration: () => ({
    isGenerating: ref(false), error: ref(null), result: ref(null), generate: mocks.generate, clearResult: mocks.clearResult,
  }),
}));
vi.mock("@/composables/ai/useAiCredits", () => ({ useAiCredits: () => ({ costOf: () => 1 }) }));
vi.mock("@/composables/ai/useOutOfCredits", () => ({ useOutOfCredits: () => ({ requireCredits: () => true }) }));
vi.mock("@/composables/ai/useCampaignProviders", () => ({
  useCampaignProviders: () => ({ textCredits: (n: number) => n, textIsByok: ref(false) }),
}));
vi.mock("@/lib/supabase", () => ({ supabase: {} }));

import ComplicationGeneratorDialog from "./ComplicationGeneratorDialog.vue";

function mountDialog(props: { mode?: "complication" | "reinforcements"; steerSeed?: { text: string } | null } = {}) {
  return mount(ComplicationGeneratorDialog, {
    props: { modelValue: true, mode: "complication", ...props },
    global: { stubs: { Transition: false, GenerationCostBadge: true, AiOffNotice: true, AppCheckbox: true } },
    attachTo: document.body,
  });
}

describe("ComplicationGeneratorDialog", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    mocks.generate.mockReset();
    mocks.clearResult.mockReset();
  });

  // Bug caught: Ask Grimoire opened the fight's complication dialog with an empty steer, so the DM typed it again.
  it("fills the steer from the request Ask Grimoire left and does not generate by itself", () => {
    const w = mountDialog({ steerSeed: { text: "a rope bridge starts to fray" } });
    expect((w.get("textarea").element as HTMLTextAreaElement).value).toBe("a rope bridge starts to fray");
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  // Bug caught: asking twice with the same words did nothing the second time (the prop looked unchanged).
  it("takes a second request even when its words are the same", async () => {
    const w = mountDialog({ steerSeed: { text: "same" } });
    await w.get("textarea").setValue("edited by the DM");
    await w.setProps({ steerSeed: { text: "same" } });
    expect((w.get("textarea").element as HTMLTextAreaElement).value).toBe("same");
  });

  // Bug caught: a long request rode to the server uncut and was refused for its length.
  it("cuts the request to the steer's limit", () => {
    const w = mountDialog({ steerSeed: { text: "x".repeat(AI_PROMPT_LIMIT_SHORT + 40) } });
    expect((w.get("textarea").element as HTMLTextAreaElement).value).toHaveLength(AI_PROMPT_LIMIT_SHORT);
  });

  it("leaves the steer empty when nothing was asked", () => {
    const w = mountDialog();
    expect((w.get("textarea").element as HTMLTextAreaElement).value).toBe("");
  });
});
