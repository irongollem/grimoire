import { describe, expect, it } from "vitest";
import { masteryWeaponsFor, weaponAllowed, type MasteryWeapon } from "./masteryWeapons";

const w = (id: string, name: string, subtype: string, properties: string[] = []): MasteryWeapon => ({ id, name, subtype, properties });
const club = w("club", "Club", "Simple Melee Weapons", ["light"]);
const rapier = w("rapier", "Rapier", "Martial Melee Weapons", ["finesse"]);
const greataxe = w("greataxe", "Greataxe", "Martial Melee Weapons", ["heavy", "two-handed"]);

describe("weaponAllowed", () => {
  it("a Fighter may take any simple or martial weapon", () => {
    const profs = ["Simple weapons", "Martial weapons"];
    expect([club, rapier, greataxe].every((x) => weaponAllowed(profs, x))).toBe(true);
  });

  it("a Rogue's martial weapons are limited to Finesse or Light", () => {
    const profs = ["Simple weapons", "Martial weapons that have the Finesse or Light property"];
    expect(weaponAllowed(profs, rapier)).toBe(true);
    expect(weaponAllowed(profs, greataxe)).toBe(false);
  });

  it("a class with no weapon proficiencies offers nothing", () => {
    expect(weaponAllowed([], club)).toBe(false);
  });
});

describe("masteryWeaponsFor", () => {
  it("lists one weapon per name, sorted", () => {
    const twin = w("club-2", "Club", "Simple Melee Weapons");
    const list = masteryWeaponsFor([rapier, twin, club], ["Simple weapons", "Martial weapons"]);
    expect(list.map((x) => x.name)).toEqual(["Club", "Rapier"]);
  });
});
