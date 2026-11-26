import { beforeEach, describe, expect, it, vi } from "vitest";
import { canonEntry } from "@/test/canonEntry";
import type { CanonClue } from "@/types/canon.types";

const m = vi.hoisted(() => ({ quest: vi.fn(), beat: vi.fn(), clue: vi.fn(), link: vi.fn(), toast: vi.fn() }));
vi.mock("@/composables/quests/useQuests", () => ({ useCreateQuest: () => ({ mutateAsync: m.quest }) }));
vi.mock("@/composables/quests/useQuestFlow", () => ({ useCreateQuestBeatWithRoute: () => ({ mutateAsync: m.beat }) }));
vi.mock("@/composables/canon/useCanonClues", () => ({ useUpdateCanonClue: () => ({ mutateAsync: m.clue }) }));
vi.mock("@/composables/canon/useCanonEntryQuests", () => ({ createEntryQuests: m.link }));
vi.mock("@tanstack/vue-query", () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
vi.mock("@/lib/toast", () => ({ toast: { error: m.toast, fromError: (e: Error) => e.message } }));

import { useStartQuestFrom } from "./useStartQuestFrom";

const secret = canonEntry({ id: "s1", campaign_id: "c1", part: "secret", title: "The Stain is a wound", arc_id: "arc1" });
const clue = (id: string, title: string) => ({ id, title }) as CanonClue;

beforeEach(() => {
  for (const f of Object.values(m)) f.mockReset();
  m.quest.mockResolvedValue({ id: "q1" });
  m.beat.mockImplementation(async (i: { title: string }) => ({ id: `b-${i.title}` }));
});

describe("useStartQuestFrom", () => {
  // Bug caught (#1279 item 32): the quest made outside the entry's arc, untied from the entry, or with the entry's words as a player-facing summary.
  it("makes a quest named for the entry, in its arc, tied to it, with no summary", async () => {
    expect(await useStartQuestFrom(() => secret).start()).toBe("q1");
    expect(m.quest).toHaveBeenCalledWith(expect.objectContaining({ title: "The Stain is a wound", arc_id: "arc1", summary: null }));
    expect(m.link).toHaveBeenCalledWith([{ campaign_id: "c1", entry_id: "s1", quest_id: "q1" }]);
  });

  // Bug caught: a clue left unplaced after its beat is made, or a beat made for a clue the DM unticked.
  it("makes one beat per given clue, in order, and places each clue at its beat", async () => {
    await useStartQuestFrom(() => secret).start([clue("k1", "A locket"), clue("k2", "A ledger")]);
    expect(m.beat.mock.calls.map(([i]) => [i.questId, i.title])).toEqual([["q1", "A locket"], ["q1", "A ledger"]]);
    expect(m.clue.mock.calls.map(([c]) => [c.id, c.patch.quest_beat_id])).toEqual([["k1", "b-A locket"], ["k2", "b-A ledger"]]);
  });

  // Bug caught: a failed quest still tied and landed on (a link to a quest that does not exist).
  it("returns null and writes nothing more when the quest could not be made", async () => {
    m.quest.mockRejectedValue(new Error("no"));
    expect(await useStartQuestFrom(() => secret).start([clue("k1", "A locket")])).toBeNull();
    expect(m.link).not.toHaveBeenCalled();
    expect(m.beat).not.toHaveBeenCalled();
    expect(m.toast).toHaveBeenCalled();
  });

  // Bug caught: one lost beat abandoning the quest (and the other clues) that already landed.
  it("tells the DM of a beat that failed and still lands on the quest with the rest", async () => {
    m.beat.mockRejectedValueOnce(new Error("no")).mockResolvedValueOnce({ id: "b2" });
    expect(await useStartQuestFrom(() => secret).start([clue("k1", "A"), clue("k2", "B")])).toBe("q1");
    expect(m.toast).toHaveBeenCalledOnce();
    expect(m.clue).toHaveBeenCalledExactlyOnceWith({ id: "k2", patch: { quest_beat_id: "b2" } });
  });

  // Bug caught: a double tap making two quests.
  it("makes no second quest while the first is being made", async () => {
    const { start } = useStartQuestFrom(() => secret);
    const first = start();
    expect(await start()).toBeNull();
    await first;
    expect(m.quest).toHaveBeenCalledOnce();
  });
});
