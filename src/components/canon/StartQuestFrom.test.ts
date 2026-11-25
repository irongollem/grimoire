import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { ref } from "vue";
import { canonEntry } from "@/test/canonEntry";
import type { CanonClue } from "@/types/canon.types";

const m = vi.hoisted(() => ({ start: vi.fn(), push: vi.fn() }));
vi.mock("vue-router", () => ({ useRouter: () => ({ push: m.push }) }));
vi.mock("@/composables/canon/useStartQuestFrom", () => ({ useStartQuestFrom: () => ({ start: m.start, starting: ref(false) }) }));

import StartQuestFrom from "./StartQuestFrom.vue";

const entry = canonEntry({ id: "s1", part: "secret" });
const clues = [{ id: "k1", title: "A locket" }, { id: "k2", title: "A ledger" }] as CanonClue[];

beforeEach(() => { m.start.mockReset(); m.push.mockReset(); m.start.mockResolvedValue("q1"); });

describe("StartQuestFrom", () => {
  // Bug caught: a force (no clues) asking a question first, or the DM left on the entry after the quest is made.
  it("with no clues, makes the quest at once and lands on it", async () => {
    const w = mount(StartQuestFrom, { props: { entry } });
    await w.get("[data-testid=start-quest-button]").trigger("click");
    await flushPromises();
    expect(m.start).toHaveBeenCalledWith([]);
    expect(m.push).toHaveBeenCalledWith("/quests/q1");
  });

  // Bug caught: the clues made beats without being asked, or an unticked one still made.
  it("with clues, offers them all ticked and makes beats of only the ones left ticked", async () => {
    const w = mount(StartQuestFrom, { props: { entry, clues } });
    await w.get("[data-testid=start-quest-button]").trigger("click");
    expect(m.start).not.toHaveBeenCalled();
    await w.findAll("input[type=checkbox]")[1]!.setValue(false);
    await w.get("[data-testid=start-quest-go]").trigger("click");
    await flushPromises();
    expect(m.start.mock.calls[0]![0].map((c: CanonClue) => c.id)).toEqual(["k1"]);
  });

  // Bug caught: navigating to a quest that was never made.
  it("stays put when the quest could not be made", async () => {
    m.start.mockResolvedValue(null);
    const w = mount(StartQuestFrom, { props: { entry } });
    await w.get("[data-testid=start-quest-button]").trigger("click");
    await flushPromises();
    expect(m.push).not.toHaveBeenCalled();
  });
});
