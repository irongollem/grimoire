import { describe, expect, it } from "vitest";
import { run } from "./cartographer-pack";

describe("--palette", () => {
  // `match[1] as PackCategory` launders a typo past the type system, and
  // validatePack's `extras` scan reads `manifest.assets` and never `palette` —
  // so a misspelt key shipped dead in the published manifest.
  it("rejects a key that is not a pack category", async () => {
    await expect(run(["init", "--id", "p", "--name", "P", "--theme", "t", "--palette", "flor=#14233b"]))
      .rejects.toThrow(/"flor" is not a pack category/);
  });

  it("still rejects a malformed value", async () => {
    await expect(run(["init", "--id", "p", "--name", "P", "--theme", "t", "--palette", "floor=blue"]))
      .rejects.toThrow(/expected category=#rrggbb/);
  });
});
