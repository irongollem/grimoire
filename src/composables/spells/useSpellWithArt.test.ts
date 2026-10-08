import { describe, expect, it, vi, beforeEach } from "vitest";
import { ref } from "vue";
import type { Spell } from "@/types/spell.types";

const mocks = vi.hoisted(() => ({
  resolved: { value: undefined as unknown },
  art: { value: undefined as unknown },
  artEnabled: undefined as (() => boolean) | undefined,
}));

vi.mock("@/composables/spells/useSpells", () => ({
  useResolvedSpell: () => ({
    data: { get value() { return mocks.resolved.value; } },
    isLoading: { value: false },
    error: { value: null },
  }),
}));
vi.mock("@/composables/library/useLibrarySpellArt", () => ({
  useLibrarySpellArtEntry: (_id: unknown, enabled: () => boolean) => {
    mocks.artEnabled = enabled;
    return { data: { get value() { return mocks.art.value; } } };
  },
}));

import { useSpellWithArt, withSpellArt } from "./useSpellWithArt";

const row = { id: "fireball", name: "Fireball", image_url: "row.webp", image_focal_point: { x: 1, y: 1 } } as unknown as Spell;
const UUID = "123e4567-e89b-12d3-a456-426614174000";

beforeEach(() => {
  mocks.resolved.value = undefined;
  mocks.art.value = undefined;
});

describe("withSpellArt", () => {
  it("keeps the row's art when there is no art entry", () => {
    expect(withSpellArt(row, null)).toBe(row);
  });

  it("lays the art entry over the row's image and focal point", () => {
    const out = withSpellArt(row, { image_url: "art.webp", portrait_focal_point: { x: 0.2, y: 0.4 } });
    expect(out.image_url).toBe("art.webp");
    expect(out.image_focal_point).toEqual({ x: 0.2, y: 0.4 });
  });

  it("falls back per field when the entry leaves one empty", () => {
    const out = withSpellArt(row, { image_url: null, portrait_focal_point: null });
    expect(out.image_url).toBe("row.webp");
    expect(out.image_focal_point).toEqual({ x: 1, y: 1 });
  });
});

describe("useSpellWithArt", () => {
  it("overlays art on a library spell", () => {
    mocks.resolved.value = { spell: row, isShared: true };
    mocks.art.value = { image_url: "art.webp", portrait_focal_point: null };
    const { spell, isLibrarySpell } = useSpellWithArt(ref("fireball"));
    expect(isLibrarySpell.value).toBe(true);
    expect(spell.value?.image_url).toBe("art.webp");
  });

  it("leaves a custom spell on its own art", () => {
    mocks.resolved.value = { spell: row, isShared: false };
    mocks.art.value = { image_url: "art.webp", portrait_focal_point: null };
    const { spell, isLibrarySpell } = useSpellWithArt(ref(UUID));
    expect(isLibrarySpell.value).toBe(false);
    expect(spell.value).toBe(row);
  });

  it("only asks for an art entry when the id is not a uuid", () => {
    useSpellWithArt(ref(UUID));
    expect(mocks.artEnabled?.()).toBe(false);
    useSpellWithArt(ref("fireball"));
    expect(mocks.artEnabled?.()).toBe(true);
  });

  it("is null until the row has arrived", () => {
    expect(useSpellWithArt(ref("fireball")).spell.value).toBeNull();
  });
});
