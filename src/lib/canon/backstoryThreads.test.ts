import { describe, expect, it } from "vitest";
import { canonEntry } from "@/test/canonEntry";
import { openThreads, type BackstoryThreadLink } from "./backstoryThreads";

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
