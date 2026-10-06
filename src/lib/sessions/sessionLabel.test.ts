import { describe, expect, it } from "vitest";
import { sessionLabel, sessionShortLabel } from "./sessionLabel";

describe("sessionLabel", () => {
  it("joins number and title", () => {
    expect(sessionLabel({ number: 15, title: "Into the Mere" })).toBe("Session 15: Into the Mere");
  });
  it("names a numbered session without a title", () => {
    expect(sessionLabel({ number: 15, title: null })).toBe("Session 15");
    expect(sessionLabel({ number: 15, title: "  " })).toBe("Session 15");
  });
  it("names an untitled-number session by its title", () => {
    expect(sessionLabel({ number: null, title: "Into the Mere" })).toBe("Into the Mere");
  });
  it("admits when it has neither", () => {
    expect(sessionLabel({ number: null, title: null })).toBe("Unnumbered session");
  });
  it("keeps session zero", () => {
    expect(sessionLabel({ number: 0, title: null })).toBe("Session 0");
  });
});

describe("sessionShortLabel", () => {
  it("is the number or its absence", () => {
    expect(sessionShortLabel({ number: 15 })).toBe("Session 15");
    expect(sessionShortLabel({ number: null })).toBe("No number");
  });
});
