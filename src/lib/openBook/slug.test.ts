import { describe, expect, it } from "vitest";
import { isValidOpenBookSlug, slugifyOpenBookTitle } from "./slug";

describe("isValidOpenBookSlug", () => {
  it.each(["a", "curse-of-strahd", "a1", "x".repeat(48)])("accepts %s", (s) => {
    expect(isValidOpenBookSlug(s)).toBe(true);
  });
  it.each(["", "-a", "a-", "A", "a_b", "a b", "x".repeat(49)])("rejects %j", (s) => {
    expect(isValidOpenBookSlug(s)).toBe(false);
  });
});

describe("slugifyOpenBookTitle", () => {
  it("folds accents and joins words", () => {
    expect(slugifyOpenBookTitle("Les Écrits d'Ærin!")).toBe("les-ecrits-d-rin");
  });
  it("trims hyphens at both ends", () => {
    expect(slugifyOpenBookTitle("  --Hello, World--  ")).toBe("hello-world");
  });
  it("caps at 48 without a trailing hyphen, and the result is valid", () => {
    const slug = slugifyOpenBookTitle(`${"a".repeat(47)} bbb`);
    expect(slug).toBe("a".repeat(47));
    expect(isValidOpenBookSlug(slug)).toBe(true);
  });
  it("is empty when nothing survives", () => {
    expect(slugifyOpenBookTitle("!!!")).toBe("");
  });
});
