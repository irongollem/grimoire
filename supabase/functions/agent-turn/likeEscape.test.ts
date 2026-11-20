import { describe, expect, it } from "vitest";
import { escapeLike } from "./likeEscape.ts";

describe("escapeLike", () => {
  it("a model's text matches as written: %, _ and backslash are escaped", () => {
    expect(escapeLike("100%_a\\b")).toBe("100\\%\\_a\\\\b");
  });
});
