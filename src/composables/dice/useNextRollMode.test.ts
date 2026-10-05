import { beforeEach, describe, expect, it } from "vitest";
import {
  markRollModeHintSeen,
  nextRollMode,
  rollModeHintSeen,
  setNextRollMode,
  takeNextRollMode,
} from "@/composables/dice/useNextRollMode";

describe("next roll mode", () => {
  beforeEach(() => {
    setNextRollMode("normal");
    localStorage.clear();
  });

  it("applies the pick once, then returns to normal", () => {
    setNextRollMode("advantage");
    expect(takeNextRollMode("normal")).toBe("advantage");
    expect(nextRollMode.value).toBe("normal");
    expect(takeNextRollMode("normal")).toBe("normal");
  });

  it("keeps a condition's disadvantage when nothing is picked", () => {
    expect(takeNextRollMode("disadvantage")).toBe("disadvantage");
  });

  it("cancels advantage against disadvantage", () => {
    setNextRollMode("advantage");
    expect(takeNextRollMode("disadvantage")).toBe("normal");
  });

  it("remembers that the long-press tip was shown", () => {
    expect(rollModeHintSeen()).toBe(false);
    markRollModeHintSeen();
    expect(rollModeHintSeen()).toBe(true);
  });
});
