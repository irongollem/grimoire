import { describe, expect, it } from "vitest";
import { likeLiteral, orFilterValue } from "./postgrestFilter";

describe("orFilterValue", () => {
  it("quotes a value so its separators stay data", () => {
    expect(orFilterValue("Crossbow Bolts (20)")).toBe('"Crossbow Bolts (20)"');
    expect(orFilterValue("a,b.c:d")).toBe('"a,b.c:d"');
  });
  it("escapes quotes and backslashes inside the value", () => {
    expect(orFilterValue('The "Hook"')).toBe('"The \\"Hook\\""');
    expect(orFilterValue("a\\b")).toBe('"a\\\\b"');
  });
});

describe("likeLiteral", () => {
  it("escapes LIKE wildcards and the escape character", () => {
    expect(likeLiteral("100%_off\\")).toBe("100\\%\\_off\\\\");
  });
  it("leaves ordinary text alone", () => {
    expect(likeLiteral("Chain Mail")).toBe("Chain Mail");
  });
});
