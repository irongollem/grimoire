import { describe, expect, it } from "vitest";
import { canonEntry } from "@/test/canonEntry";
import type { CanonClue, CanonEntryQuest, CanonForceTick } from "@/types/canon.types";
import { questCanonGroups, questCanonOptions } from "./questCanonRows";

const link = (id: string, entry_id: string, quest_id = "q1"): CanonEntryQuest => ({ id, user_id: "u", campaign_id: "c1", entry_id, quest_id, created_at: "" });
const tick = (force_id: string, delta: number): CanonForceTick => ({ id: `t${force_id}${delta}${Math.random()}`, user_id: "u", campaign_id: "c1", force_id, delta, note: "", session_id: null, step_id: null, world_year: null, world_month: null, world_day: null, created_at: "" });
const clue = (secret_id: string, found: boolean): CanonClue => ({ id: `k${secret_id}${found}`, secret_id, found_at: found ? "2026-11-01T00:00:00Z" : null }) as CanonClue;

const entries = [
  canonEntry({ id: "b1", part: "backstory", title: "", party_member_id: "m1" }),
  canonEntry({ id: "l1", part: "lore", title: "The Fall" }),
  canonEntry({ id: "t1", part: "truth", title: "The river gives back" }),
  canonEntry({ id: "s1", part: "secret", title: "Sift's mother" }),
  canonEntry({ id: "f1", part: "force", title: "The Ferrymen", clock_size: 6 }),
  canonEntry({ id: "p1", part: "premise", premise_kind: "pitch", title: "A pitch" }),
  canonEntry({ id: "qq", part: "question", title: "Who rang the bell?" }),
];
const base = { questId: "q1", entries, ticks: [tick("f1", 1), tick("f1", 1), tick("f1", 1)], clues: [clue("s1", true)], characterNames: new Map([["m1", "Tansy"]]) };

describe("questCanonGroups", () => {
  // Bug caught: groups in the order the links were made (or alphabetically) instead of force, secret, truth, lore, backstory.
  it("groups by part in the stated order, whatever order the links were made in", () => {
    const links = [link("a", "b1"), link("b", "l1"), link("c", "t1"), link("d", "s1"), link("e", "f1")];
    expect(questCanonGroups({ ...base, links }).map((g) => g.part)).toEqual(["force", "secret", "truth", "lore", "backstory"]);
  });

  // Bug caught: another quest's canon listed on this one, now that the links are the whole campaign's.
  it("lists only the entries tied to this quest", () => {
    const groups = questCanonGroups({ ...base, links: [link("a", "l1"), link("b", "t1", "q2")] });
    expect(groups.flatMap((g) => g.rows.map((r) => r.entryId))).toEqual(["l1"]);
  });

  it("says a force's clock, and how an ended force ended instead", () => {
    const [clock] = questCanonGroups({ ...base, links: [link("a", "f1")] });
    expect(clock!.rows[0]!.fact).toBe("3 of 6");
    const ended = [canonEntry({ id: "f1", part: "force", title: "The Ferrymen", clock_size: 6, closed_as: "stopped", closed_at: "2026-11-02T00:00:00Z" })];
    const [over] = questCanonGroups({ ...base, entries: ended, links: [link("a", "f1")] });
    expect(over!.rows[0]!.fact).toBe("Ended: it was stopped");
  });

  it("says a secret's state and nothing for the other parts", () => {
    const groups = questCanonGroups({ ...base, links: [link("a", "s1"), link("b", "t1"), link("c", "l1")] });
    expect(groups.map((g) => g.rows[0]!.fact)).toEqual(["Partly known", null, null]);
  });

  // Bug caught: a backstory listed under its entry's empty title.
  it("names a backstory by its character", () => {
    expect(questCanonGroups({ ...base, links: [link("a", "b1")] })[0]!.rows[0]!.name).toBe("Tansy");
  });

  // Bug caught: a link to a premise entry or a question (a stale row) drawn as canon behind the quest.
  it("leaves out an entry of a part a quest cannot be tied to, and a link to an entry that is gone", () => {
    expect(questCanonGroups({ ...base, links: [link("a", "p1"), link("b", "qq"), link("c", "gone")] })).toEqual([]);
  });
});

describe("questCanonOptions", () => {
  // Bug caught: an entry offered again once tied, or a premise entry or open question offered at all.
  it("offers the five parts' entries that are not yet tied, and nothing else", () => {
    const names = questCanonOptions({ ...base, links: [link("a", "l1")] }).map((o) => o.id);
    expect(names).toEqual(["b1", "t1", "s1", "f1"]);
  });

  it("still offers an entry that is tied to a different quest", () => {
    expect(questCanonOptions({ ...base, links: [link("a", "l1", "q2")] }).map((o) => o.id)).toContain("l1");
  });
});
