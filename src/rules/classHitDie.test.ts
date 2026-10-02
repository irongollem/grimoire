import { describe, expect, it } from "vitest";
import { hitDieForClassRow } from "@/rules/classHitDie";

const definitions = {
  system: [{ id: "sys-fighter", hit_die: 10 }],
  custom: [{ id: "cus-brawler", hit_die: 12 }],
};

describe("hitDieForClassRow", () => {
  it("reads a system row from system_classes by id", () => {
    expect(hitDieForClassRow({ class_definition_id: "sys-fighter", class_definition_kind: "system" }, definitions)).toBe(10);
  });

  it("reads a custom row from its own definition, not a built-in of the same name", () => {
    expect(hitDieForClassRow({ class_definition_id: "cus-brawler", class_definition_kind: "custom" }, definitions)).toBe(12);
  });

  it("does not cross kinds: a custom id is not looked up among system classes", () => {
    expect(hitDieForClassRow({ class_definition_id: "cus-brawler", class_definition_kind: "system" }, definitions)).toBeNull();
  });

  it("returns null while the definitions are not loaded", () => {
    expect(hitDieForClassRow({ class_definition_id: "sys-fighter", class_definition_kind: "system" }, { system: [], custom: [] })).toBeNull();
  });
});
