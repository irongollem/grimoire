import { describe, expect, it } from "vitest";
import { librarySearchFilter } from "./library";

describe("librarySearchFilter", () => {
  it("quotes every value, so PostgREST syntax in the search text stays data", () => {
    expect(librarySearchFilter("rain")).toBe(
      'title.ilike."%rain%",collection.ilike."%rain%",tags.cs."{\\"rain\\"}"',
    );
  });

  it("keeps separators, dots, colons and parentheses inside the quotes", () => {
    const filter = librarySearchFilter("door: creak (old), drip.");
    // Three conditions, however many commas the text holds.
    expect(filter.match(/,(title|collection|tags)\./g)).toHaveLength(2);
    expect(filter).toContain('title.ilike."%door: creak (old), drip.%"');
  });

  it("escapes quotes and backslashes, and keeps a typed % from being a wildcard", () => {
    expect(librarySearchFilter('50% "loud"')).toBe(
      'title.ilike."%50\\\\% \\"loud\\"%",collection.ilike."%50\\\\% \\"loud\\"%",tags.cs."{\\"50% \\\\\\"loud\\\\\\"\\"}"',
    );
  });
});
