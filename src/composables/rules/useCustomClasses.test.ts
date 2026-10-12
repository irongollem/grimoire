import { describe, expect, it, vi, beforeEach } from "vitest";
import type { CustomClass, SystemClass } from "@/levelup/customTypes";

const mocks = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("@/lib/supabase", () => ({
  supabase: { from: mocks.from },
  getCurrentUser: () => ({ id: "u1" }),
}));

import { customClassFromSystem, fetchClassRecord, isCustomClass } from "./useCustomClasses";

/** A chainable select().eq().maybeSingle()/single() that resolves to `result`. */
function table(result: { data: unknown; error: unknown }) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: () => Promise.resolve(result),
    single: () => Promise.resolve(result),
  };
  return chain;
}

const library = {
  id: "11111111-0000-4000-8000-000000000001",
  class_name: "Barbarian",
  hit_die: 12,
  primary_ability: "Strength",
  saving_throws: ["str", "con"],
  armor_proficiencies: [],
  weapon_proficiencies: [],
  subclass_level: 3,
  features: { "1": ["f1"] },
  spell_slots: null,
  spells_known: null,
  cantrips_known: null,
  slot_recovery: "long",
  caster_type: "none",
  prepared_ability: null,
  prepared_divisor: null,
  image_url: null,
  focal_point: null,
} as unknown as SystemClass;

describe("fetchClassRecord", () => {
  beforeEach(() => mocks.from.mockReset());

  it("returns the homebrew row when custom_classes holds the id", async () => {
    const custom = { id: "c1", user_id: "u1", class_name: "Witch Hunter" };
    mocks.from.mockImplementation(() => table({ data: custom, error: null }));
    expect(await fetchClassRecord("c1")).toEqual({ kind: "custom", cls: custom });
    expect(mocks.from).toHaveBeenCalledTimes(1);
    expect(mocks.from).toHaveBeenCalledWith("custom_classes");
  });

  it("falls through to system_classes when no homebrew row has the id", async () => {
    mocks.from.mockImplementation((name: string) =>
      name === "custom_classes"
        ? table({ data: null, error: null })
        : table({ data: library, error: null }),
    );
    expect(await fetchClassRecord(library.id)).toEqual({ kind: "library", cls: library });
  });

  it("throws a read error rather than treating it as a missing row", async () => {
    const boom = new Error("boom");
    mocks.from.mockImplementation(() => table({ data: null, error: boom }));
    await expect(fetchClassRecord("x")).rejects.toBe(boom);
  });
});

describe("isCustomClass and customClassFromSystem", () => {
  it("tells a library row (no owner) from a homebrew one", () => {
    expect(isCustomClass(library)).toBe(false);
    expect(isCustomClass({ ...library, user_id: "u1" } as unknown as CustomClass)).toBe(true);
  });

  it("copies a library class as an unscoped homebrew draft", () => {
    expect(customClassFromSystem(library)).toMatchObject({
      class_name: "Barbarian (copy)",
      campaign_id: null,
      hit_die: 12,
      source: null,
      features: { "1": ["f1"] },
    });
  });
});
