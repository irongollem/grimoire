import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ create: vi.fn(), createPassage: vi.fn(), deletePassage: vi.fn() }));
vi.mock("@/composables/canon/useCanonEntries", () => ({ useCreateCanonEntry: () => ({ mutateAsync: mocks.create }) }));
vi.mock("@/composables/canon/useCanonPassages", () => ({
  useCreateCanonPassage: () => ({ mutateAsync: mocks.createPassage }),
  useDeleteCanonPassage: () => ({ mutateAsync: mocks.deletePassage }),
}));

import { splitReplacement, useAcceptLore } from "./useAcceptLore";
import type { CanonLorePassage } from "@/types/canon.types";
import type { LoreSuggestion } from "@/ai/useCanonSuggestions";

const passage = (id: string, sort_order: number, told_at: string | null = null) => ({ id, sort_order, told_at }) as unknown as CanonLorePassage;
const suggestion = { title: "T", kind: "history", passages: [{ title: "New", body: "text", spot: null }] } as unknown as LoreSuggestion;

describe("splitReplacement", () => {
  // Bug caught: a split replaced a told passage (players already heard it) or a clue's passage (its link goes null).
  it("keeps told passages and clue passages, and replaces only the rest", () => {
    const { replace, kept } = splitReplacement(
      [passage("told", 0, "2026-11-01"), passage("clued", 1), passage("free", 2)],
      new Set(["clued"]),
    );
    expect(kept.map((p) => p.id)).toEqual(["told", "clued"]);
    expect(replace.map((p) => p.id)).toEqual(["free"]);
  });
});

describe("split", () => {
  it("deletes only what it was told to replace, and places the new passages after every existing one", async () => {
    mocks.createPassage.mockClear();
    mocks.deletePassage.mockClear();
    const existing = [passage("told", 0, "2026-11-01"), passage("free", 4)];
    await useAcceptLore().split(suggestion, "l1", null, existing, [existing[1]]);
    expect(mocks.deletePassage.mock.calls).toEqual([["free"]]);
    expect(mocks.createPassage).toHaveBeenCalledWith(expect.objectContaining({ entry_id: "l1", sort_order: 5 }));
  });
});
