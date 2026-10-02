import { describe, expect, it } from "vitest";
import { inheritingChildIds } from "./childAccount";

const TODAY = new Date("2026-10-02T12:00:00Z");

function link(id: string, createdAt: string, adultOn = "2099-01-01") {
  return { child_user_id: id, created_at: createdAt, adult_on: adultOn };
}

describe("inheritingChildIds", () => {
  it("is empty for no links", () => {
    expect(inheritingChildIds([], TODAY).size).toBe(0);
  });

  it("covers every child while there are five or fewer", () => {
    const links = [link("a", "2026-01-01T00:00:00Z"), link("b", "2026-01-02T00:00:00Z")];
    expect([...inheritingChildIds(links, TODAY)].sort()).toEqual(["a", "b"]);
  });

  it("stops at the five oldest links", () => {
    const links = ["g", "f", "e", "d", "c", "b", "a"].map((id, i) =>
      link(id, `2026-01-0${i + 1}T00:00:00Z`),
    );
    // g is the oldest, then f, e, d, c.
    expect([...inheritingChildIds(links, TODAY)].sort()).toEqual(["c", "d", "e", "f", "g"]);
  });

  it("breaks a created_at tie by child id", () => {
    const same = "2026-01-01T00:00:00Z";
    const links = ["f", "e", "d", "c", "b", "a"].map((id) => link(id, same));
    expect([...inheritingChildIds(links, TODAY)].sort()).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("frees a seat when a child has aged out", () => {
    const links = [
      link("old", "2026-01-01T00:00:00Z", "2026-10-02"),
      ...["a", "b", "c", "d", "e"].map((id, i) => link(id, `2026-02-0${i + 1}T00:00:00Z`)),
    ];
    // "old" is oldest but its adult_on is today, so it no longer counts.
    expect([...inheritingChildIds(links, TODAY)].sort()).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("does not mutate the caller's list", () => {
    const links = [link("b", "2026-01-02T00:00:00Z"), link("a", "2026-01-01T00:00:00Z")];
    inheritingChildIds(links, TODAY);
    expect(links.map((l) => l.child_user_id)).toEqual(["b", "a"]);
  });
});
