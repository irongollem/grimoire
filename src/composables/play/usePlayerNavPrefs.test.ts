import { describe, it, expect, beforeEach } from "vitest";
import { ALL_PLAYER_NAV } from "@/lib/playerNav";
import { applyNavOrder, loadNavOrder } from "./usePlayerNavPrefs";

const ids = (order: readonly string[]) => applyNavOrder(ALL_PLAYER_NAV, order).map((i) => i.id);
const defaults = ALL_PLAYER_NAV.map((i) => i.id);

beforeEach(() => localStorage.clear());

describe("loadNavOrder", () => {
  it("is empty for a fresh user, giving defaults", () => {
    expect(loadNavOrder()).toEqual([]);
    expect(ids([])).toEqual(defaults);
  });

  it("converts the legacy path order once: /play is the character, hearth goes first", () => {
    localStorage.setItem("grimoire_nav_order", JSON.stringify(["/play/spells", "/play", "/play/journal"]));
    expect(loadNavOrder()).toEqual(["hearth", "spells", "character", "journal"]);
    expect(localStorage.getItem("grimoire_nav_order")).toBeNull();
    expect(JSON.parse(localStorage.getItem("grimoire_nav_order_v2") ?? "null")).toEqual([
      "hearth", "spells", "character", "journal",
    ]);
    // Second read comes from the new key.
    expect(loadNavOrder()).toEqual(["hearth", "spells", "character", "journal"]);
  });

  it("drops unknown legacy entries", () => {
    localStorage.setItem("grimoire_nav_order", JSON.stringify(["/play/gone", "/play/atlas"]));
    expect(loadNavOrder()).toEqual(["hearth", "atlas"]);
  });

  it("ignores corrupt storage", () => {
    localStorage.setItem("grimoire_nav_order_v2", "{nope");
    expect(loadNavOrder()).toEqual([]);
  });
});

describe("applyNavOrder", () => {
  it("drops unknown ids and keeps saved order", () => {
    const out = ids(["ghost", "atlas", "hearth"]);
    expect(out.indexOf("atlas")).toBeLessThan(out.indexOf("hearth"));
    expect(out).not.toContain("ghost");
    expect(out).toHaveLength(defaults.length);
  });

  it("places a newly added item after its default predecessor", () => {
    const saved = defaults.filter((id) => id !== "calendar").reverse();
    const out = ids(saved);
    expect(out.indexOf("calendar")).toBe(out.indexOf("inventory") + 1);
  });
});
