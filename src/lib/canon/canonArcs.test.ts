import { describe, expect, it } from "vitest";
import { statusPatch } from "./canonArcs";

describe("statusPatch", () => {
  // Bug caught: leaving Ended without clearing the ending, so the write is refused (23514, an ending only on an ended arc).
  it("clears the ending in the same write when an ended arc goes back to running or planned", () => {
    expect(statusPatch({ status: "ended" }, "running")).toEqual({ status: "running", ending: null });
    expect(statusPatch({ status: "ended" }, "planned")).toEqual({ status: "planned", ending: null });
  });

  // Bug caught: the ending wiped on every status write, so ending an arc loses what was just written.
  it("leaves the ending alone for every other change", () => {
    expect(statusPatch({ status: "running" }, "ended")).toEqual({ status: "ended" });
    expect(statusPatch({ status: "planned" }, "running")).toEqual({ status: "running" });
    expect(statusPatch({ status: "ended" }, "ended")).toEqual({ status: "ended" });
  });
});
