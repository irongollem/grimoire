import { describe, expect, it } from "vitest";
import { classifyOpenBookError } from "./errors";

describe("classifyOpenBookError", () => {
  it("reads the raised messages", () => {
    expect(classifyOpenBookError({ code: "P0001", message: "open_book_requires_pro" })).toBe("requires_pro");
    expect(classifyOpenBookError({ code: "P0002", message: "open_book_not_set_up" })).toBe("not_set_up");
    expect(classifyOpenBookError({ code: "42501", message: "Not authorized" })).toBe("not_authorized");
  });
  it("reads a slug collision, but not another unique violation", () => {
    expect(
      classifyOpenBookError({
        code: "23505",
        message: 'duplicate key value violates unique constraint "open_books_slug_key"',
      }),
    ).toBe("slug_taken");
    expect(classifyOpenBookError({ code: "23505", message: 'violates unique constraint "other_key"' })).toBe(
      "unknown",
    );
  });
  it("reads a refusal by its SQLSTATE even when the message names no cause, and a constraint named only in the details", () => {
    expect(classifyOpenBookError({ code: "42501", message: "permission denied for table open_books" })).toBe("not_authorized");
    expect(
      classifyOpenBookError({ code: "23505", message: "duplicate key value", details: "Key (slug)=(x) violates open_books_slug_key" }),
    ).toBe("slug_taken");
  });
  it("falls through to unknown", () => {
    expect(classifyOpenBookError(null)).toBe("unknown");
    expect(classifyOpenBookError("boom")).toBe("unknown");
    expect(classifyOpenBookError(new Error("x"))).toBe("unknown");
  });
});
