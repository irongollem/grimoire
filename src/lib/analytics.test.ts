import { describe, it, expect, vi, afterEach } from "vitest";
import { track } from "./analytics";

function withQueue(): ReturnType<typeof vi.fn> {
  const va = vi.fn();
  (globalThis as { va?: unknown }).va = va;
  return va;
}

afterEach(() => {
  delete (globalThis as { va?: unknown }).va;
});

describe("track", () => {
  it("sends an event with no properties", () => {
    const va = withQueue();
    track({ name: "campaign_created" });
    expect(va).toHaveBeenCalledWith("event", { name: "campaign_created" });
  });

  it("sends an event with a label property", () => {
    const va = withQueue();
    track({ name: "generator_used", kind: "NPC" });
    expect(va).toHaveBeenCalledWith("event", { name: "generator_used", kind: "NPC" });
  });

  // Analytics must never be able to break the action it is reporting on.
  it("does nothing when the script has not loaded", () => {
    expect(() => track({ name: "campaign_created" })).not.toThrow();
  });

  it("does nothing when window.va is not callable", () => {
    (globalThis as { va?: unknown }).va = { not: "a function" };
    expect(() => track({ name: "campaign_created" })).not.toThrow();
  });

  describe("payload guard", () => {
    // import.meta.env.DEV is true under vitest, so the guard throws rather than
    // dropping — which is the behaviour we want a failing test to catch.
    it("rejects free text, which is how user content would leak in", () => {
      withQueue();
      expect(() =>
        track({ name: "generator_used", kind: "a whole sentence the user typed into the box" }),
      ).toThrow(/never carry user ids or free text/);
    });

    it("rejects a uuid, which is how an entity id would leak in", () => {
      withQueue();
      expect(() =>
        track({ name: "generator_used", kind: "8f14e45f-ceea-467a-9f6e-2f0d7b1a4c33" }),
      ).toThrow(/short code-authored label/);
    });

    it("rejects an email address", () => {
      withQueue();
      expect(() => track({ name: "generator_used", kind: "player@example.com" })).toThrow();
    });

    it("rejects an empty label", () => {
      withQueue();
      expect(() => track({ name: "generator_used", kind: "" })).toThrow();
    });

    it("does not send anything when the guard rejects", () => {
      const va = withQueue();
      expect(() => track({ name: "generator_used", kind: "free text with an @ in it" })).toThrow();
      expect(va).not.toHaveBeenCalled();
    });

    it("accepts the label shapes the registry actually uses", () => {
      const va = withQueue();
      for (const kind of ["NPC", "Monster", "Item", "Roll Table", "Mini-Forge"]) {
        track({ name: "generator_used", kind });
      }
      expect(va).toHaveBeenCalledTimes(5);
    });
  });
});
