import { describe, expect, it } from "vitest";
import { npcBlockedCaption } from "@/composables/openBook/useNpcBookRule";

describe("npcBlockedCaption", () => {
  it("only a hidden name gets its own caption; a missing party leaves the whole-party caption to the control", () => {
    expect(npcBlockedCaption("name")).toMatch(/name/i);
    expect(npcBlockedCaption("party")).toBeNull();
    expect(npcBlockedCaption(null)).toBeNull();
  });
});
