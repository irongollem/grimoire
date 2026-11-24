import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { ref } from "vue";
import { canonEntry } from "@/test/canonEntry";
import type { ReadFinding } from "@/ai/useCanonSuggestions";

const mocks = vi.hoisted(() => ({ suggest: vi.fn(), dismissAll: vi.fn(), canSpend: vi.fn(() => true) }));
const findings = ref<ReadFinding[]>([]);
const setAside = ref<{ claim: string; reason: string }[]>([]);
const hasResult = ref(false);

vi.mock("@/ai/useCanonSuggestions", () => ({
  useCanonSuggestions: () => ({
    suggest: mocks.suggest, suggestions: findings, setAside, hasResult, isGenerating: ref(false), error: ref(null), dismissAll: mocks.dismissAll,
  }),
}));
vi.mock("@/composables/canon/useCanonEntries", () => ({
  useCanonEntries: () => ({ data: ref([canonEntry({ id: "a", title: "The king is dead" }), canonEntry({ id: "b", title: "The king signs a decree" })]) }),
}));
vi.mock("@/composables/ai/useAiCredits", () => ({ useAiCredits: () => ({ costOf: () => 7 }) }));
vi.mock("@/composables/ai/useGenerationGate", () => ({ useGenerationGate: () => ({ canSpend: mocks.canSpend }) }));
vi.mock("@/composables/ai/useCampaignProviders", () => ({ useCampaignProviders: () => ({ textCredits: (n: number) => n, textIsByok: ref(false) }) }));

import CanonReadThrough from "./CanonReadThrough.vue";

const mountIt = () => mount(CanonReadThrough, {
  global: { stubs: { GenerationCostBadge: { props: ["credits"], template: "<span data-testid='price'>{{ credits }}</span>" }, RouterLink: { props: ["to"], template: "<a :href='to'><slot /></a>" } } },
});

beforeEach(() => {
  mocks.suggest.mockReset();
  mocks.suggest.mockResolvedValue(true);
  mocks.canSpend.mockReset();
  mocks.canSpend.mockReturnValue(true);
  findings.value = [];
  setAside.value = [];
  hasResult.value = false;
});

describe("CanonReadThrough", () => {
  it("shows the price beside the button and runs with no steer", async () => {
    const w = mountIt();
    expect(w.get("[data-testid=price]").text()).toBe("7");
    await w.findAll("button").find((b) => b.text() === "Read it through")!.trigger("click");
    expect(mocks.suggest).toHaveBeenCalledWith("");
  });

  // Bug caught: the run started without the spend check, so a DM short of credits was charged into a refusal.
  it("does not run when the spend gate says no", async () => {
    mocks.canSpend.mockReturnValue(false);
    const w = mountIt();
    await w.findAll("button").find((b) => b.text() === "Read it through")!.trigger("click");
    expect(mocks.suggest).not.toHaveBeenCalled();
  });

  // Bug caught: a finding without its links (the DM must hunt for the entries), or a link to the wrong URL shape.
  it("lists each finding with a link to every entry it names, by title", () => {
    hasResult.value = true;
    findings.value = [
      { kind: "contradiction", text: "He cannot be dead and sign.", entry_ids: ["a", "b"] },
      { kind: "loose_end", text: "A secret with no clue.", entry_ids: ["a"] },
    ];
    const w = mountIt();
    const rows = w.findAll("[data-testid=read-through-finding]");
    expect(rows).toHaveLength(2);
    expect(rows[0].text()).toContain("Contradiction");
    expect(rows[1].text()).toContain("Loose end");
    expect(rows[0].findAll("a").map((a) => [a.attributes("href"), a.text()])).toEqual([
      ["/canon?entry=a", "The king is dead"],
      ["/canon?entry=b", "The king signs a decree"],
    ]);
  });

  // Bug caught: a clean read showed nothing at all, which reads as "never ran" or "broken".
  it("says so when a run found nothing, and shows nothing before any run", () => {
    expect(mountIt().find("[data-testid=read-through-findings]").exists()).toBe(false);
    hasResult.value = true;
    expect(mountIt().get("[data-testid=read-through-clear]").text()).toContain("Nothing contradicts");
  });
});
