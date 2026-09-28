import { describe, it, expect, beforeEach } from "vitest";
import { useAgeQuestion } from "./useAgeQuestion";
import { wasAnsweredUnder16 } from "@/lib/ageGateSession";

describe("useAgeQuestion", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("refuses to resolve with nothing entered yet", () => {
    const { resolveAge, ageError } = useAgeQuestion();
    expect(resolveAge()).toBeNull();
    expect(ageError.value).toBe("Please choose a birth month and year.");
  });

  it("refuses an implausible birth month (too far in the future)", () => {
    const { birthMonth, birthYear, resolveAge, ageError } = useAgeQuestion();
    const nextYear = new Date().getUTCFullYear() + 1;
    birthMonth.value = 1;
    birthYear.value = nextYear;
    expect(resolveAge()).toBeNull();
    expect(ageError.value).toBe("That doesn't look like a valid birth month.");
  });

  it("resolves 'adult' for someone 16 or older, with no session memory written", () => {
    const { birthMonth, birthYear, resolveAge, ageError } = useAgeQuestion();
    const today = new Date();
    birthMonth.value = 1;
    birthYear.value = today.getUTCFullYear() - 20;
    expect(resolveAge()).toBe("adult");
    expect(ageError.value).toBe("");
    expect(wasAnsweredUnder16()).toBe(false);
  });

  it("resolves 'under16' for someone under 16, and remembers it for the session", () => {
    const { birthMonth, birthYear, resolveAge, ageError } = useAgeQuestion();
    const today = new Date();
    birthMonth.value = 1;
    birthYear.value = today.getUTCFullYear() - 10;
    expect(resolveAge()).toBe("under16");
    expect(ageError.value).toBe("");
    expect(wasAnsweredUnder16()).toBe(true);
  });

  it("clears a previous error once the answer becomes valid", () => {
    const { birthMonth, birthYear, resolveAge, ageError } = useAgeQuestion();
    expect(resolveAge()).toBeNull();
    expect(ageError.value).not.toBe("");

    const today = new Date();
    birthMonth.value = 1;
    birthYear.value = today.getUTCFullYear() - 20;
    expect(resolveAge()).toBe("adult");
    expect(ageError.value).toBe("");
  });
});
