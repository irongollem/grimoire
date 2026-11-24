import { describe, expect, it } from "vitest";
import { canonEntry } from "@/test/canonEntry";
import { isThreadTie, openThreads, paidOffThreads, type BackstoryThreadLink } from "./backstoryThreads";

const link = (from_id: string, to_id: string, type = "related_to", over: Partial<BackstoryThreadLink> = {}): BackstoryThreadLink => ({ from_kind: "canon", from_id, to_kind: "canon", to_id, type, ...over });
const entries = [
  canonEntry({ id: "q1", part: "question", title: "Who burned the mill?" }),
  canonEntry({ id: "q2", part: "question", title: "Answered", closed_as: "answered", closed_at: "2026-11-01T00:00:00Z", closed_note: "Maren" }),
  canonEntry({ id: "s1", part: "secret", title: "Hidden" }),
  canonEntry({ id: "s2", part: "secret", title: "Revealed", revealed_at: "2026-11-01T00:00:00Z" }),
  canonEntry({ id: "t1", part: "truth", title: "A truth" }),
];

describe("openThreads", () => {
  // Bug caught: an answered question or a revealed secret still listed as something the past leaves open.
  it("leaves out an answered question and a revealed secret", () => {
    const links = ["q1", "q2", "s1", "s2"].map((id) => link("b1", id));
    expect(openThreads("b1", entries, links).map((e) => e.id)).toEqual(["q1", "s1"]);
  });

  // Bug caught: only links written from the backstory counted, so one written from the question's side was missed.
  it("counts a link from either end, and led_to as well as related_to", () => {
    expect(openThreads("b1", entries, [link("q1", "b1", "led_to"), link("b1", "s1")]).map((e) => e.id)).toEqual(["q1", "s1"]);
  });

  // Bug caught: another backstory's threads, a truth, or a world tie (about) counted.
  it("ignores another backstory's links, entries that are not threads and other link types", () => {
    const links = [link("b2", "q1"), link("b1", "t1"), link("b1", "q1", "about"), link("b1", "q1", "related_to", { to_kind: "npc" })];
    expect(openThreads("b1", entries, links)).toEqual([]);
  });

  it("lists a thread once however many links name it", () => {
    expect(openThreads("b1", entries, [link("b1", "q1"), link("q1", "b1", "led_to")])).toHaveLength(1);
  });
});

describe("paidOffThreads", () => {
  // Bug caught: a thread that was answered or revealed vanishing from the backstory instead of being kept as paid off.
  it("keeps the answered question and the revealed secret, and not the open ones", () => {
    const links = ["q1", "q2", "s1", "s2"].map((id) => link("b1", id));
    expect(paidOffThreads("b1", entries, links).map((e) => e.id)).toEqual(["q2", "s2"]);
  });

  // Bug caught: a paid-off lore or truth entry (not a question or secret) counted as a thread because it is "not open".
  it("never counts an entry that is not a question or a secret", () => {
    expect(paidOffThreads("b1", entries, [link("b1", "t1")])).toEqual([]);
  });
});

describe("isThreadTie", () => {
  const row = (over: Partial<Parameters<typeof isThreadTie>[0]> = {}) => ({ source: "link", type: "related_to", other_kind: "canon", other_id: "q1", ...over });
  const ids = new Set(["q1"]);

  // Bug caught: a thread listed in Connections as well as under Threads left open.
  it("is true for a canon link of a thread type to a thread", () => {
    expect(isThreadTie(row(), ids)).toBe(true);
    expect(isThreadTie(row({ type: "led_to" }), ids)).toBe(true);
  });

  // Bug caught: hiding every canon tie, so a related lore entry or an about tie vanished from Connections.
  it("is false for another canon entry, another type, another kind or a record row", () => {
    expect(isThreadTie(row({ other_id: "lore1" }), ids)).toBe(false);
    expect(isThreadTie(row({ type: "about" }), ids)).toBe(false);
    expect(isThreadTie(row({ other_kind: "npc" }), ids)).toBe(false);
    expect(isThreadTie(row({ source: "membership" }), ids)).toBe(false);
  });
});
