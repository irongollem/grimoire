import { describe, expect, it } from "vitest";
import { bookBlockedCaption, bookWrite, firstMissingMember } from "@/composables/openBook/useBookReveal";

const party = [
  { id: "a", name: "Aria" },
  { id: "b", name: "Bram" },
];

describe("firstMissingMember", () => {
  it("names the first member who cannot see the entry", () => {
    expect(firstMissingMember(party, (id) => id === "a")).toBe("Bram");
    expect(firstMissingMember(party, () => false)).toBe("Aria");
  });
  it("is null when everyone sees it, or there is no party", () => {
    expect(firstMissingMember(party, () => true)).toBeNull();
    expect(firstMissingMember([], () => false)).toBeNull();
  });
});

describe("bookBlockedCaption", () => {
  it("explains who would read it first", () => {
    expect(bookBlockedCaption("Bram")).toBe(
      "Share with the whole party first, so a stranger never reads it before Bram does.",
    );
  });
  it("falls back when no member is to blame", () => {
    expect(bookBlockedCaption(null)).toBe("Share with the whole party first.");
  });
});

describe("bookWrite", () => {
  it("clears the row when the wish equals the book default", () => {
    expect(bookWrite(true, true)).toBe("clear");
    expect(bookWrite(false, false)).toBe("clear");
  });
  it("records an exception otherwise", () => {
    expect(bookWrite(false, true)).toBe("set");
    expect(bookWrite(true, false)).toBe("set");
  });
});
