import { describe, expect, it, vi } from "vitest";
import { computed, ref } from "vue";
import type { Monster } from "@/types/monster.types";

const LORE = "A shaggy black bear that forages at the forest edge.";
const asked: Array<string | null> = [];

vi.mock("@/composables/monsters/useMonsters", () => ({
  useLibraryMonsterDescription: (id: () => string | null) => ({
    data: computed(() => {
      asked.push(id());
      return id() ? LORE : undefined;
    }),
  }),
}));

import { useMonsterDescription } from "./useMonsterDescription";

const base = { id: "srd_bear_black_bf", name: "Bear, Black", description: null } as Monster;

describe("useMonsterDescription", () => {
  it("reads a library creature's lore by id, ignoring the row", () => {
    const description = useMonsterDescription(() => ({ ...base, is_shared: true }));
    expect(description.value).toBe(LORE);
    expect(asked).toContain("srd_bear_black_bf");
  });

  it("takes a DM's own monster's description from the row and asks for no lore", () => {
    asked.length = 0;
    const description = useMonsterDescription(() => ({ ...base, id: "m1", is_shared: false, description: "Homebrew bear." }));
    expect(description.value).toBe("Homebrew bear.");
    expect(asked.every((id) => id === null)).toBe(true);
  });

  it("follows the monster when the sheet switches to another one", () => {
    const current = ref<Monster>({ ...base, id: "m1", is_shared: false, description: "Homebrew bear." });
    const description = useMonsterDescription(() => current.value);
    expect(description.value).toBe("Homebrew bear.");
    current.value = { ...base, is_shared: true };
    expect(description.value).toBe(LORE);
  });
});
