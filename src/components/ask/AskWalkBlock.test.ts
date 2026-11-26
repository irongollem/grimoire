// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { ref } from "vue";
import type { WalkStepId } from "@/lib/canon/canonWalk";
import type { AskItem } from "@/composables/ask/askItems";

const price = vi.hoisted(() => ({ total: 3 as number | null }));
vi.mock("@/composables/ai/quotes/canonSuggestionsQuote", () => ({
  useCanonSuggestionsQuote: () => () => ({ lines: [], total: price.total, block: null }),
}));
vi.mock("@/composables/canon/useCanonEntries", () => ({
  useCanonEntries: () => ({ data: ref([{ id: "e1", part: "premise" }, { id: "e2", part: "truth" }]) }),
}));

import CanonReview from "@/components/canon/CanonReview.vue";
import AskWalkBlock from "./AskWalkBlock.vue";

type Block = Extract<AskItem, { kind: "walk-block" }>;
function block(step: WalkStepId, over: Partial<Block> = {}, props: { pitchWritten?: boolean; memberId?: string } = {}) {
  const stop = { step, memberId: props.memberId ?? null, memberName: props.memberId ? "Mira" : null };
  const item: Block = { kind: "walk-block", id: 7, stop, answer: "dry and warm", phase: "open", ...over };
  return mount(AskWalkBlock, {
    props: { item, pitchWritten: props.pitchWritten ?? true },
    global: { stubs: { CanonReview: { props: ["mode", "scope", "entries", "partyMemberId", "lore"], template: "<div data-testid='review' />" }, RouterLink: { props: ["to"], template: "<a :href='to'><slot /></a>" } } },
  });
}

describe("AskWalkBlock", () => {
  // Bug caught: the price missing from the gilt button (a spend with no number on it), or read from the wrong mode.
  it("prices Enhance on its button and sends the edited words", async () => {
    price.total = 3;
    const w = block("voice");
    expect(w.get("[data-testid=walk-enhance]").text()).toBe("Enhance with AI · 3 credits");
    await w.get("[data-testid=walk-answer]").setValue("dry, a little sly");
    await w.get("[data-testid=walk-enhance]").trigger("click");
    expect(w.emitted("enhance")).toEqual([["dry, a little sly"]]);
  });

  // Bug caught: Enhance pressable before the price is known, so the engine fails it with "price not known".
  it("waits for a price", () => {
    price.total = null;
    expect(block("voice").get("[data-testid=walk-enhance]").attributes("disabled")).toBeDefined();
    price.total = 3;
  });

  // Bug caught: the gilt button shown before the pitch, so every draft would be written cold.
  it("shows why instead of the button while the pitch is unwritten", () => {
    const w = block("voice", {}, { pitchWritten: false });
    expect(w.find("[data-testid=walk-enhance]").exists()).toBe(false);
    expect(w.get("[data-testid=walk-held]").text()).toBe("Write the pitch first: every draft is written from it.");
  });

  // Bug caught: Write it myself enabled on nothing (an empty entry), or sending the original answer instead of the edit.
  it("disables Write it myself on an empty field and writes the edited text", async () => {
    const w = block("voice", { answer: "" });
    expect(w.get("[data-testid=walk-write]").attributes("disabled")).toBeDefined();
    await w.get("[data-testid=walk-answer]").setValue("  warm  ");
    await w.get("[data-testid=walk-write]").trigger("click");
    expect(w.emitted("write")).toEqual([["  warm  "]]);
  });

  // Bug caught: Write it myself offered where it cannot write (peoples are made in their own chapter), saving nothing.
  it("offers the chapter instead of Write it myself where the answer cannot become the section", () => {
    const w = block("peoples");
    expect(w.find("[data-testid=walk-write]").exists()).toBe(false);
    expect(w.get("[data-testid=walk-open-chapter]").text()).toBe("Open Peoples");
  });

  // Bug caught: Skip on the pitch, which every draft is written from.
  it("has no Skip on the pitch", () => {
    expect(block("pitch").find("[data-testid=walk-skip]").exists()).toBe(false);
    expect(block("voice").find("[data-testid=walk-skip]").exists()).toBe(true);
  });

  // Bug caught: a draft reviewed on a different scope than it was made under (proposals never appear), or a backstory
  // review with no character to write the passages for.
  it("reviews a draft on the walk's own mode and scope", () => {
    const w = block("voice", { phase: "drafted", credits: 2 });
    const review = w.getComponent(CanonReview).props();
    expect(review).toMatchObject({ mode: "premise", scope: "walk:voice" });
    expect(review.entries).toEqual([{ id: "e1", part: "premise" }]);
  });

  // Bug caught: a 1-credit draft carrying its price on every button, the meter anxiety the maintainer ruled out ("if its
  // like 1 we dont"); or a notable price (a pricier provider's multiple) hidden from the press that spends it.
  it("names a draft's price on its buttons only when it is notable", () => {
    price.total = 1;
    const cheap = block("voice", { phase: "drafted" });
    expect(cheap.get("[data-testid=walk-again]").text()).toBe("Again");
    expect(block("voice").get("[data-testid=walk-enhance]").text()).toBe("Enhance with AI");
    price.total = 3;
    expect(block("voice", { phase: "drafted" }).get("[data-testid=walk-again]").text()).toBe("Again · 3 credits");
    expect(block("voice").get("[data-testid=walk-enhance]").text()).toBe("Enhance with AI · 3 credits");
  });

  it("reviews a character's backstory under that character's scope", () => {
    const w = block("backstories", { phase: "drafted" }, { memberId: "m1" });
    expect(w.getComponent(CanonReview).props()).toMatchObject({ mode: "backstory", scope: "walk:backstories:m1", partyMemberId: "m1" });
  });

  // Bug caught: Again and Next missing after a draft, leaving the DM no way on.
  it("emits again and next from a drafted block", async () => {
    const w = block("voice", { phase: "drafted" });
    await w.get("[data-testid=walk-again]").trigger("click");
    await w.get("[data-testid=walk-next]").trigger("click");
    expect([w.emitted("again")?.length, w.emitted("next")?.length]).toEqual([1, 1]);
  });

  // Bug caught: the pitch's "needed first" word set on the block but never shown, so Next looks dead.
  it("shows the notice a block carries over its draft", () => {
    const w = block("pitch", { phase: "drafted", notice: "The pitch is needed before anything else can be drafted." });
    expect(w.get("[data-testid=walk-notice]").text()).toContain("pitch is needed");
  });

  // Bug caught: a failure that hides the field, so the DM cannot retry; or an error not shown.
  it("shows the failure and keeps the field and the answers", () => {
    const w = block("voice", { phase: "failed", error: "Out of credits." });
    expect(w.get("[data-testid=walk-error]").text()).toBe("Out of credits.");
    expect(w.find("[data-testid=walk-answer]").exists()).toBe(true);
    expect(w.find("[data-testid=walk-enhance]").exists()).toBe(true);
  });

  // Bug caught: a saved block still editable (a second write), or its link going to the wrong place for a character.
  it("links a saved block to its chapter, and a character's to their backstory", () => {
    expect(block("voice", { phase: "saved" }).find("[data-testid=walk-answer]").exists()).toBe(false);
    expect(block("voice", { phase: "saved" }).get("[data-testid=walk-saved]").text()).toContain("Written into your canon.");
    const w = block("backstories", { phase: "saved" }, { memberId: "m1" });
    expect(w.get("[data-testid=walk-saved] a").attributes("href")).toBe("/canon/backstories?backstory=m1");
  });

  it("shows work in progress and the skipped line without the answers", () => {
    expect(block("voice", { phase: "drafting" }).find("[data-testid=walk-enhance]").exists()).toBe(false);
    expect(block("voice", { phase: "skipped" }).get("[data-testid=walk-skipped]").text()).toContain("progress list");
  });
});
