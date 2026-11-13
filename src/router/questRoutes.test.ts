import { describe, expect, it } from "vitest";
import type { RouteLocationNormalized } from "vue-router";
import { routes } from "./routes";

describe("quest beat route", () => {
  const beatRoute = routes.find((route) => route.name === "quest-beat-detail");

  // A beat is the quest screen's opened drawer (#1183). Old bookmarks, notes
  // backlinks and returnTo paths still carry /beats/:id and must land there.
  it("redirects an old beat link to the quest with that beat opened, keeping other query keys", () => {
    const redirect = beatRoute?.redirect;
    expect(typeof redirect).toBe("function");
    const to = { params: { id: "q1", beatId: "b1" }, query: { thread: "t1", returnTo: "/x" } } as unknown as RouteLocationNormalized;
    expect((redirect as (to: RouteLocationNormalized) => unknown)(to)).toEqual({
      path: "/quests/q1",
      query: { thread: "t1", returnTo: "/x", beat: "b1", open: "1" },
    });
  });
});
