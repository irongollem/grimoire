import { describe, expect, it } from "vitest";
import { canEditSubclass } from "@/composables/rules/useCustomSubclasses";

describe("canEditSubclass", () => {
  const dm = { userId: "dm", isAdmin: false };
  const admin = { userId: "admin", isAdmin: true };

  it("lets an owner edit their own archetype, and nobody else", () => {
    expect(canEditSubclass({ user_id: "dm" }, dm)).toBe(true);
    expect(canEditSubclass({ user_id: "someone" }, dm)).toBe(false);
    expect(canEditSubclass({ user_id: "dm" }, { userId: null, isAdmin: false })).toBe(false);
    // Being admin opens the library's rows, not a DM's own homebrew.
    expect(canEditSubclass({ user_id: "dm" }, admin)).toBe(false);
  });

  it("leaves the library's archetypes to an admin", () => {
    expect(canEditSubclass({ user_id: null }, dm)).toBe(false);
    expect(canEditSubclass({ user_id: null }, admin)).toBe(true);
  });
});
