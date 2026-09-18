import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import ImportKindReview from "./ImportKindReview.vue";
import type { EntityCandidate, ImportDecision } from "@/lib/documentImport/entityMatching";
import type { UsableEntity } from "@/lib/documentImport/sanitizeEntities";

// The row renders the full field editor and its own primitives; this file is
// about when the group seeds decisions, not how a row looks.
vi.mock("@/components/campaign/ImportEntityReviewRow.vue", () => ({
  default: { name: "ImportEntityReviewRow", props: ["entity"], template: "<div class='row-stub' />" },
}));
vi.mock("@/composables/monsters/useMonsterGenerationCost", async () => {
  const { computed } = await import("vue");
  return { useMonsterGenerationCost: () => ({ credits: computed(() => 1) }) };
});

const kobold: UsableEntity = { ref: "npc1", page: null, confidence: "complete", data: { name: "Trex" } };
const existing: EntityCandidate = {
  targetId: "npc-existing",
  source: "campaign",
  name: "Trex",
  matchKind: "exact",
  detail: null,
  distance: null,
};

function mountReview(matchesReady: boolean, candidates: Map<string, EntityCandidate[]>) {
  const decisions = new Map<string, ImportDecision>();
  const wrapper = mount(ImportKindReview, {
    props: {
      kind: "npcs" as const,
      entities: [kobold],
      label: "NPCs",
      candidatesByRef: candidates,
      matchesReady,
      decisions,
      edits: new Map<string, Record<string, unknown>>(),
      "onUpdate:decisions": (next: Map<string, ImportDecision>) => wrapper.setProps({ decisions: next }),
    },
  });
  return wrapper;
}

describe("ImportKindReview", () => {
  it("seeds nothing while the duplicate check has not succeeded", () => {
    const wrapper = mountReview(false, new Map());
    const decisions = wrapper.props("decisions") as Map<string, ImportDecision>;
    expect(decisions.size).toBe(0);
    expect(wrapper.findAll(".row-stub")).toHaveLength(0);
  });

  it("links to the existing entry once a retried check succeeds — a failed check never locks rows onto create", async () => {
    // The failure mode this guards: a failed check treated as "no matches"
    // seeded every entity as create, and seeding never overwrites a choice,
    // so a successful Retry left duplicates queued.
    const wrapper = mountReview(false, new Map());
    await wrapper.setProps({ matchesReady: true, candidatesByRef: new Map([["npc1", [existing]]]) });
    await nextTick();
    const decisions = wrapper.props("decisions") as Map<string, ImportDecision>;
    expect(decisions.get("npc1")).toEqual({ action: "link", candidate: existing });
  });
});
