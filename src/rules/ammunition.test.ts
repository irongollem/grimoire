import { describe, it, expect } from "vitest";
import {
  weaponAmmoTag,
  ammoTagFromName,
  isRangedWeaponItem,
  weaponUsesChargesAsAmmo,
  ANY_AMMO_TAG,
} from "@/rules/ammunition";

type WeaponShape = Parameters<typeof weaponAmmoTag>[0];
function weapon(overrides: Partial<WeaponShape>): WeaponShape {
  return { name: "", subtype: null, tags: [], properties: [], ...overrides };
}

type ChargedWeaponShape = WeaponShape & { charges: number | null };
function chargedWeapon(overrides: Partial<ChargedWeaponShape>): ChargedWeaponShape {
  return { ...weapon({}), charges: null, ...overrides };
}

describe("weaponAmmoTag", () => {
  it("classifies a shortbow by name as arrow", () => {
    expect(weaponAmmoTag(weapon({ name: "Shortbow" }))).toBe("arrow");
  });

  it("classifies a longbow by name as arrow", () => {
    expect(weaponAmmoTag(weapon({ name: "Longbow" }))).toBe("arrow");
  });

  it("classifies a crossbow as bolt, not arrow", () => {
    expect(weaponAmmoTag(weapon({ name: "Heavy Crossbow" }))).toBe("bolt");
  });

  it("classifies a sling as bullet", () => {
    expect(weaponAmmoTag(weapon({ name: "Sling" }))).toBe("bullet");
  });

  it("classifies a blowgun as needle", () => {
    expect(weaponAmmoTag(weapon({ name: "Blowgun" }))).toBe("needle");
  });

  it("prefers an explicit ammo tag over the name", () => {
    expect(weaponAmmoTag(weapon({ name: "Mystery Weapon", tags: ["bolt"] }))).toBe("bolt");
  });

  it("maps a firearm tag to firearm-bullet", () => {
    expect(weaponAmmoTag(weapon({ name: "Musket", tags: ["firearm"] }))).toBe("firearm-bullet");
  });

  it("resolves from subtype before name", () => {
    expect(weaponAmmoTag(weapon({ name: "Elvish Deathwind", subtype: "shortbow" }))).toBe("arrow");
  });

  it("returns null for a melee weapon", () => {
    expect(weaponAmmoTag(weapon({ name: "Longsword" }))).toBeNull();
  });

  it("classifies a renamed/homebrew bow with the ammunition property as the generic 'any' tag", () => {
    expect(weaponAmmoTag(weapon({ name: "Elvish Deathwind", properties: ["ammunition"] }))).toBe(ANY_AMMO_TAG);
  });
});

describe("isRangedWeaponItem", () => {
  it("is true for a weapon with the ammunition property", () => {
    expect(isRangedWeaponItem(weapon({ name: "Mystery Weapon", properties: ["ammunition"] }))).toBe(true);
  });

  it("is true for a weapon whose subtype names a ranged category", () => {
    expect(isRangedWeaponItem(weapon({ name: "Mystery Weapon", subtype: "Martial Ranged Weapons" }))).toBe(true);
  });

  it("is true for a weapon recognized by weaponAmmoTag (e.g. a shortbow by name)", () => {
    expect(isRangedWeaponItem(weapon({ name: "Shortbow" }))).toBe(true);
  });

  it("is false for a plain melee weapon", () => {
    expect(isRangedWeaponItem(weapon({ name: "Longsword" }))).toBe(false);
  });
});

describe("weaponUsesChargesAsAmmo", () => {
  it("is false for a charged MELEE weapon (its charges are self-charges, not ammo)", () => {
    expect(weaponUsesChargesAsAmmo(chargedWeapon({ name: "Staff of Power", subtype: "Quarterstaff", charges: 20 }))).toBe(false);
  });

  it("is true for a charged RANGED weapon (subtype names a ranged category)", () => {
    expect(weaponUsesChargesAsAmmo(chargedWeapon({ name: "Laser Rifle", subtype: "Martial Ranged Weapons", charges: 30 }))).toBe(true);
  });

  it("is false for a melee weapon with no charges at all", () => {
    expect(weaponUsesChargesAsAmmo(chargedWeapon({ name: "Longsword", charges: null }))).toBe(false);
  });
});

describe("ammoTagFromName", () => {
  it("matches the seeded 'Arrows (20)' stack", () => {
    expect(ammoTagFromName("Arrows (20)")).toBe("arrow");
  });

  it("matches 'Crossbow Bolts (20)'", () => {
    expect(ammoTagFromName("Crossbow Bolts (20)")).toBe("bolt");
  });

  it("matches sling bullets", () => {
    expect(ammoTagFromName("Sling Bullets (20)")).toBe("bullet");
  });

  it("classifies firearm ammunition as firearm-bullet", () => {
    expect(ammoTagFromName("Firearm Bullets (10)")).toBe("firearm-bullet");
  });

  it("returns null for a non-ammo item", () => {
    expect(ammoTagFromName("Longsword")).toBeNull();
  });
});
