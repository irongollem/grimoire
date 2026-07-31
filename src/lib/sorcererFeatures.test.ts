import { describe, expect, it } from "vitest";
import {
  isInnateSorceryActive,
  metamagicLimit,
  sorcerousRestorationAmount,
  sorceryPointMaximum,
} from "@/lib/sorcererFeatures";

describe("2024 Sorcerer features", () => {
  it("starts Sorcery Points at level 2 and caps them at level 20", () => {
    expect(sorceryPointMaximum(1)).toBe(0);
    expect(sorceryPointMaximum(2)).toBe(2);
    expect(sorceryPointMaximum(20)).toBe(20);
    expect(sorceryPointMaximum(25)).toBe(20);
  });

  it("restores half the Sorcerer level without exceeding the maximum", () => {
    expect(sorcerousRestorationAmount(4, 0, 4)).toBe(0);
    expect(sorcerousRestorationAmount(5, 0, 5)).toBe(2);
    expect(sorcerousRestorationAmount(9, 7, 9)).toBe(2);
  });

  it("expires Innate Sorcery after one minute", () => {
    expect(isInnateSorceryActive({ class_choices: {
      innate_sorcery_active: true,
      innate_sorcery_expires_at: "2026-07-20T12:01:00Z",
    } }, Date.parse("2026-07-20T12:00:30Z"))).toBe(true);
    expect(isInnateSorceryActive({ class_choices: {
      innate_sorcery_active: true,
      innate_sorcery_expires_at: "2026-07-20T12:01:00Z",
    } }, Date.parse("2026-07-20T12:01:00Z"))).toBe(false);
  });

  it("allows two options only during revised Sorcery Incarnate", () => {
    expect(metamagicLimit("2014", 20, true)).toBe(1);
    expect(metamagicLimit("2024", 6, true)).toBe(1);
    expect(metamagicLimit("2024", 7, false)).toBe(1);
    expect(metamagicLimit("2024", 7, true)).toBe(2);
  });
});

