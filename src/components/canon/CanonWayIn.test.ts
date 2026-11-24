import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import type { CanonClue, CanonEntry } from "@/types/canon.types";

const create = vi.fn();
vi.mock("@/composables/canon/useCanonEntries", () => ({ useCreateCanonEntry: () => ({ mutateAsync: create }) }));
vi.mock("@/composables/ask/useCanAsk", () => ({ useCanAsk: () => ({ value: true }) }));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ activeCampaignId: "camp-1" }) }));

import { useCanonUiStore } from "@/stores/ui/canon";
import CanonWayIn from "./CanonWayIn.vue";

const entry = (over: Partial<CanonEntry>) => ({ id: "e", part: "truth", premise_kind: null, body: null, ...over }) as CanonEntry;
const stubs = { AppButton: { props: ["label", "to"], template: "<button @click=\"$emit('click')\">{{ label }}</button>" } };
const mountIt = (entries: CanonEntry[] = [], clues: CanonClue[] = []) =>
  mount(CanonWayIn, { props: { entries, clues }, global: { stubs, plugins: [createPinia()] } });

describe("CanonWayIn", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    create.mockReset().mockResolvedValue({ id: "new-1" });
    localStorage.clear();
  });

  // Bug caught: every step showing its add row at once (or none), so a new DM faces a form wall instead of one next thing.
  it("opens only the first step that is not done", () => {
    const w = mountIt();
    expect(w.get("[data-testid=way-in-pitch]").attributes("data-state")).toBe("open");
    expect(w.get("[data-testid=way-in-truths]").attributes("data-state")).toBe("later");
    expect(w.find("[data-testid=way-in-truths] form").exists()).toBe(false);
  });

  // Bug caught: a truth made without "known to all", leaving it marked secret or unmarked in a list that reads it.
  it("adds a truth as known to everyone, numbered after the truths there are", async () => {
    const pitch = entry({ id: "p", part: "premise", premise_kind: "pitch", body: JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "x" }] }] }) });
    const w = mountIt([pitch, entry({ id: "t1" })]);
    expect(w.get("[data-testid=way-in-pitch]").attributes("data-state")).toBe("done");
    await w.get("[data-testid=way-in-truths] input").setValue("Magic tastes of salt");
    await w.get("[data-testid=way-in-truths] form").trigger("submit");
    await flushPromises();
    expect(create).toHaveBeenCalledWith({ part: "truth", knowledge: "all", title: "Magic tastes of salt", sort_order: 1 });
  });

  // Bug caught: a made secret leaving the DM with no way to its clue, so the last step could never be finished.
  it("offers the clue link once the secret is made", async () => {
    const steps = [
      entry({ id: "p", part: "premise", premise_kind: "pitch", body: JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "x" }] }] }) }),
      entry({ id: "t1" }), entry({ id: "t2" }), entry({ id: "t3" }), entry({ id: "f", part: "force" }),
    ];
    const w = mountIt(steps);
    expect(w.find("[data-testid=way-in-clue]").exists()).toBe(false);
    await w.get("[data-testid=way-in-secret] input").setValue("The king is dead");
    await w.get("[data-testid=way-in-secret] form").trigger("submit");
    await flushPromises();
    expect(create).toHaveBeenCalledWith({ part: "secret", title: "The king is dead", sort_order: 0 });
    expect(w.find("[data-testid=way-in-clue]").exists()).toBe(true);
  });

  // Bug caught: Skip dismissing every campaign (or none), instead of only the one the DM is in.
  it("remembers the skip for this campaign only", async () => {
    const w = mountIt();
    await w.get("[data-testid=way-in-skip]").trigger("click");
    expect(useCanonUiStore().wayInDismissed).toEqual({ "camp-1": true });
  });
});
