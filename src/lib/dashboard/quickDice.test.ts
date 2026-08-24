import { describe, it, expect } from "vitest";
import { ALL_DICE } from "@/lib/dice/dice";
import type { RollResult } from "@/lib/dice/dice";
import {
  QUICK_DICE_BUTTONS,
  advantageAppliesTo,
  effectiveMode,
  checkQuickExpression,
  displayStandardRoll,
  displayExpressionRoll,
} from "./quickDice";

describe("quickDice", () => {
  describe("QUICK_DICE_BUTTONS", () => {
    it("offers every standard die, in the standard order", () => {
      expect(QUICK_DICE_BUTTONS.map((b) => b.sides)).toEqual(ALL_DICE);
    });

    it("labels each button d<sides>", () => {
      expect(QUICK_DICE_BUTTONS.find((b) => b.sides === 8)).toEqual({
        sides: 8,
        label: "d8",
        supportsAdvantage: false,
      });
    });

    it("offers Advantage/Disadvantage on d20 only — the only die 5e ties it to", () => {
      for (const button of QUICK_DICE_BUTTONS) {
        expect(button.supportsAdvantage).toBe(button.sides === 20);
      }
    });
  });

  describe("advantageAppliesTo", () => {
    it("is true for d20 and false for every other die", () => {
      expect(advantageAppliesTo(20)).toBe(true);
      for (const sides of ALL_DICE.filter((s) => s !== 20)) {
        expect(advantageAppliesTo(sides)).toBe(false);
      }
    });
  });

  describe("effectiveMode", () => {
    it("passes advantage/disadvantage through for d20", () => {
      expect(effectiveMode(20, "advantage")).toBe("advantage");
      expect(effectiveMode(20, "disadvantage")).toBe("disadvantage");
    });

    it("flattens a stale mode to normal for every other die, so the result never claims a mode that did nothing", () => {
      expect(effectiveMode(6, "advantage")).toBe("normal");
      expect(effectiveMode(100, "disadvantage")).toBe("normal");
    });

    it("leaves normal mode alone regardless of die", () => {
      expect(effectiveMode(4, "normal")).toBe("normal");
      expect(effectiveMode(20, "normal")).toBe("normal");
    });
  });

  describe("checkQuickExpression", () => {
    it("reads an empty field as its own resting state, not an error", () => {
      expect(checkQuickExpression("")).toEqual({ status: "empty" });
      expect(checkQuickExpression("   ")).toEqual({ status: "empty" });
    });

    it("flags genuinely unparseable text as invalid", () => {
      expect(checkQuickExpression("banana")).toEqual({ status: "invalid" });
      expect(checkQuickExpression("d20")).toEqual({ status: "invalid" });
    });

    it("parses a simple expression", () => {
      const result = checkQuickExpression("2d6");
      expect(result.status).toBe("ready");
      if (result.status === "ready") {
        expect(result.parsed).toEqual({ terms: [{ count: 2, sides: 6 }], modifier: 0 });
      }
    });

    it("parses an expression with a modifier", () => {
      const result = checkQuickExpression("2d6+3");
      expect(result.status).toBe("ready");
      if (result.status === "ready") {
        expect(result.parsed).toEqual({ terms: [{ count: 2, sides: 6 }], modifier: 3 });
      }
    });

    it("trims surrounding whitespace before parsing", () => {
      expect(checkQuickExpression("  1d8+2  ")).toEqual({
        status: "ready",
        parsed: { terms: [{ count: 1, sides: 8 }], modifier: 2 },
      });
    });
  });

  describe("displayStandardRoll", () => {
    it("carries the roll straight through for a plain die", () => {
      const result: RollResult = {
        total: 15,
        label: "1d20",
        modifier: 0,
        breakdown: [{ val: 15, dropped: false }],
        isCrit: false,
        isFumble: false,
      };
      expect(displayStandardRoll(result)).toEqual({
        label: "1d20",
        total: 15,
        dice: [{ val: 15, dropped: false }],
        isCrit: false,
        isFumble: false,
      });
    });

    it("keeps the dropped die visible rather than discarding it, for an advantage roll", () => {
      const result: RollResult = {
        total: 17,
        label: "1d20 (Adv)",
        modifier: 0,
        breakdown: [
          { val: 17, dropped: false },
          { val: 5, dropped: true },
        ],
        isCrit: false,
        isFumble: false,
      };
      const display = displayStandardRoll(result);
      expect(display.dice).toEqual([
        { val: 17, dropped: false },
        { val: 5, dropped: true },
      ]);
      expect(display.label).toBe("1d20 (Adv)");
    });

    it("passes crit/fumble through unchanged", () => {
      const nat20: RollResult = {
        total: 20,
        label: "1d20",
        modifier: 0,
        breakdown: [{ val: 20, dropped: false }],
        isCrit: true,
        isFumble: false,
      };
      expect(displayStandardRoll(nat20).isCrit).toBe(true);
    });
  });

  describe("displayExpressionRoll", () => {
    it("labels the result with the typed expression and never claims a crit or fumble", () => {
      const display = displayExpressionRoll("2d6+3", {
        total: 11,
        breakdown: [
          { val: 4, dropped: false },
          { val: 4, dropped: false },
        ],
      });
      expect(display).toEqual({
        label: "2d6+3",
        total: 11,
        dice: [
          { val: 4, dropped: false },
          { val: 4, dropped: false },
        ],
        isCrit: false,
        isFumble: false,
      });
    });
  });
});
