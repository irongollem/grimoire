import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import type { AskItem } from "@/composables/ask/askItems";

vi.mock("vue-router", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import AskResultCard from "./AskResultCard.vue";

type ResultItem = Extract<AskItem, { kind: "result" }>;
const item = (over: Partial<ResultItem> = {}): ResultItem => ({
  kind: "result", id: 1, name: "Rime cub", noun: "monster", review: false, record: { type: "monster", id: "m1", name: "Rime cub" }, route: "/monsters/m1", parts: [{ label: "Monster", ok: true, credits: 5 }], ...over,
});
const mountIt = (over?: Partial<ResultItem>) => mount(AskResultCard, { props: { item: item(over) }, global: { stubs: { AiImageBadge: true, AppButton: true } } });

describe("AskResultCard: the bound note", () => {
  // Bug caught: a tie the card was asked to make never shown (the DM cannot tell the stat block reached the form), or
  // shown on every result that asked for nothing.
  it("says how tying the record went, and says nothing when nothing was asked", () => {
    expect(mountIt({ bound: { ok: true, text: "Bound to Young." } }).get("[data-testid=ask-result-bound]").text()).toBe("Bound to Young.");
    expect(mountIt().find("[data-testid=ask-result-bound]").exists()).toBe(false);
  });

  // Bug caught: a failed tie drawn with the success tick, so a monster left unbound reads as bound.
  it("marks a failed tie as not done", () => {
    const w = mountIt({ bound: { ok: false, text: "Rime cub was made, but could not be tied to Young." } });
    expect(w.get("[data-testid=ask-result-bound]").find('[aria-label="Not done"]').exists()).toBe(true);
    expect(w.get("[data-testid=ask-result-bound]").find('[aria-label="Done"]').exists()).toBe(false);
  });
});
