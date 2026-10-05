// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";
import { clearAgeGateChoice, rememberUnder16, wasAnsweredUnder16 } from "./ageGateSession";

describe("ageGateSession", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("has no remembered answer before anything is recorded", () => {
    expect(wasAnsweredUnder16()).toBe(false);
  });

  it("remembers an under-16 answer for the rest of the session", () => {
    rememberUnder16();
    expect(wasAnsweredUnder16()).toBe(true);
  });

  it("survives being read more than once (reload, then a second reload)", () => {
    rememberUnder16();
    expect(wasAnsweredUnder16()).toBe(true);
    expect(wasAnsweredUnder16()).toBe(true);
  });

  it("forgets once cleared", () => {
    rememberUnder16();
    clearAgeGateChoice();
    expect(wasAnsweredUnder16()).toBe(false);
  });

  it("degrades to false, not a throw, when sessionStorage.getItem is unavailable", () => {
    const original = Object.getOwnPropertyDescriptor(window, "sessionStorage");
    Object.defineProperty(window, "sessionStorage", {
      configurable: true,
      get() {
        throw new Error("blocked");
      },
    });
    try {
      expect(wasAnsweredUnder16()).toBe(false);
      expect(() => rememberUnder16()).not.toThrow();
    } finally {
      if (original) Object.defineProperty(window, "sessionStorage", original);
    }
  });
});
