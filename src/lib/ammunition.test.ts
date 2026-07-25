import { describe, it, expect } from "vitest";
import { weaponAmmoTag, ammoTagFromName } from "@/lib/ammunition";

type WeaponShape = Parameters<typeof weaponAmmoTag>[0];
function weapon(overrides: Partial<WeaponShape>): WeaponShape {
  return { name: "", subtype: null, tags: [], ...overrides };
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
