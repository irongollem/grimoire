import { describe, expect, it } from "vitest";
import { placeRoute } from "@/lib/locations/placeRoute";
import { secretEntityRoute } from "./secretEntityRoute";

describe("secretEntityRoute", () => {
  const id = "123e4567-e89b-12d3-a456-426614174000";

  it("opens a place in the Atlas", () => {
    expect(secretEntityRoute("location", id)).toBe(placeRoute(id));
  });

  it("opens every other kind on its detail page", () => {
    expect(secretEntityRoute("item", id)).toBe(`/vault/${id}`);
    expect(secretEntityRoute("puzzle", id)).toBe(`/puzzles/${id}`);
    expect(secretEntityRoute("note", id)).toBe(`/notes/${id}`);
    expect(secretEntityRoute("faction", id)).toBe(`/factions/${id}`);
  });

  it("escapes an id before it goes in a path", () => {
    expect(secretEntityRoute("note", "a b/c")).toBe("/notes/a%20b%2Fc");
  });
});
