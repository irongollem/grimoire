import { createPinia, setActivePinia } from "pinia";
import { effectScope, nextTick } from "vue";
import { beforeEach, describe, expect, it } from "vitest";
import { safeLocalStorage } from "@/lib/safeLocalStorage";
import { useAuthStore } from "@/stores/auth";
import { useCampaignStore } from "@/stores/campaign";
import { readScratch, scratchKey, useJournalScratch, writeScratch } from "./useJournalScratch";

function memory(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    key: (i) => Array.from(m.keys())[i] ?? null,
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
    clear: () => m.clear(),
  };
}

const doc = (text: string) =>
  JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });

describe("journal scratch pad storage", () => {
  it("keys per user and per campaign", () => {
    expect(scratchKey("u1", "c1")).not.toBe(scratchKey("u1", "c2"));
    expect(scratchKey("u1", "c1")).not.toBe(scratchKey("u2", "c1"));
  });

  it("reads back what was written", () => {
    const s = memory();
    writeScratch(s, "k", doc("a clue"));
    expect(readScratch(s, "k")).toBe(doc("a clue"));
  });

  it("removes the key when the pad is blank", () => {
    const s = memory();
    writeScratch(s, "k", doc("x"));
    writeScratch(s, "k", "");
    expect(s.getItem("k")).toBeNull();
    expect(readScratch(s, "k")).toBe("");
  });

  it("treats an empty rich text document as blank", () => {
    const s = memory();
    s.setItem("k", JSON.stringify({ type: "doc", content: [{ type: "paragraph" }] }));
    expect(readScratch(s, "k")).toBe("");
  });

  it("survives storage that throws", () => {
    const s = memory();
    s.getItem = () => {
      throw new Error("denied");
    };
    s.setItem = () => {
      throw new Error("full");
    };
    expect(readScratch(s, "k")).toBe("");
    expect(() => writeScratch(s, "k", doc("x"))).not.toThrow();
  });
});

describe("useJournalScratch", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    safeLocalStorage().clear();
    useAuthStore().user = { id: "u1" } as never;
    useCampaignStore().activeCampaignId = "c1";
  });

  function mountPad() {
    return effectScope().run(() => useJournalScratch())!;
  }

  it("keeps each campaign's pad apart: switching campaign shows that campaign's draft, not the last one's", async () => {
    safeLocalStorage().setItem(scratchKey("u1", "c1"), doc("clue in c1"));
    safeLocalStorage().setItem(scratchKey("u1", "c2"), doc("clue in c2"));
    const pad = mountPad();
    expect(pad.content.value).toBe(doc("clue in c1"));
    useCampaignStore().activeCampaignId = "c2";
    await nextTick();
    expect(pad.content.value).toBe(doc("clue in c2"));
  });

  it("saves typing under the user's key, and clear empties the pad and removes the saved draft", async () => {
    const pad = mountPad();
    pad.content.value = doc("a clue");
    await nextTick();
    expect(safeLocalStorage().getItem(scratchKey("u1", "c1"))).toBe(doc("a clue"));
    expect(pad.isBlank.value).toBe(false);
    pad.clear();
    expect(pad.content.value).toBe("");
    expect(safeLocalStorage().getItem(scratchKey("u1", "c1"))).toBeNull();
  });

  it.each([
    ["no one is signed in", null, "c1"],
    ["no campaign is active", { id: "u1" }, null],
  ])("stores nothing when %s", async (_label, user, campaign) => {
    useAuthStore().user = user as never;
    useCampaignStore().activeCampaignId = campaign;
    const pad = mountPad();
    pad.content.value = doc("orphan");
    await nextTick();
    const stored = Array.from({ length: safeLocalStorage().length }, (_, i) => safeLocalStorage().key(i));
    expect(stored.filter((k) => k?.startsWith("grimoire:journal-scratch"))).toEqual([]);
  });
});
