import { describe, expect, it } from "vitest";
import { libraryPackObjectPath } from "./useLibraryTilePacks";

describe("libraryPackObjectPath", () => {
  it("keys objects by the pack row's uuid and version", () => {
    expect(libraryPackObjectPath({ id: "3f1b0c2e-0000-4000-8000-000000000001", pack_version: 2 }, "floor/0.webp"))
      .toBe("3f1b0c2e-0000-4000-8000-000000000001/v2/floor/0.webp");
  });

  // The slug must not appear. Library packs are authored in the open and their
  // bytes are readable by URL through the CDN, so a name-derived path would put
  // an unannounced pack one guess away — see the docblock on the function.
  it("never derives the path from the pack's slug", () => {
    const path = libraryPackObjectPath({ id: "3f1b0c2e-0000-4000-8000-000000000001", pack_version: 1 }, "wall/h/0.webp");
    expect(path).not.toContain("haunted-manor");
    expect(path.split("/")[0]).toBe("3f1b0c2e-0000-4000-8000-000000000001");
  });
});
