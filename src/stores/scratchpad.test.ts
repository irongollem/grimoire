import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useScratchpadStore } from "./scratchpad";

const npc = { type: "npc", id: "n1", label: "Brenna" } as const;
const quest = { type: "quest", id: "q1", label: "The Mine" } as const;

describe("scratchpad store", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("follows the newest registered subject and falls back when it leaves", () => {
    const s = useScratchpadStore();
    const offNpc = s.register(npc);
    const offQuest = s.register(quest);
    expect(s.pageSubject).toMatchObject({ id: "q1" });
    offQuest();
    expect(s.pageSubject).toMatchObject({ id: "n1" });
    offNpc();
    expect(s.pageSubject).toBeNull();
  });

  it("removes exactly its own entry when the same entity registers twice", () => {
    const s = useScratchpadStore();
    const first = s.register(npc);
    s.register(npc);
    first();
    expect(s.pageSubjects).toHaveLength(1);
  });

  it("pins what is shown and prefers it over the page", () => {
    const s = useScratchpadStore();
    s.register(npc);
    s.pin();
    s.register(quest);
    expect(s.shown).toMatchObject({ id: "n1" });
    s.unpin();
    expect(s.shown).toMatchObject({ id: "q1" });
  });

  it("answers isShowing only while open", () => {
    const s = useScratchpadStore();
    s.register(npc);
    expect(s.isShowing("npc", "n1")).toBe(false);
    s.toggle({ top: 1, left: 2, width: 3, height: 4 });
    expect(s.isShowing("npc", "n1")).toBe(true);
    expect(s.isShowing("npc", "other")).toBe(false);
    expect(s.launchRect).toMatchObject({ top: 1 });
    s.toggle();
    expect(s.open).toBe(false);
    expect(s.launchRect).toMatchObject({ top: 1 });
  });
});
