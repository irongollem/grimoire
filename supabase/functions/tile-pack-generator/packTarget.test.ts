import { describe, expect, it } from "vitest";
import { libraryPackTarget, mintLibraryPackId, packPrefix, userPackTarget } from "./packTarget";
import type { TilePackManifest } from "../../../src/cartographer/packSchema";

const manifest = { schema_version: 2 } as unknown as TilePackManifest;

describe("packPrefix", () => {
  it("builds the user-lane prefix with the user id segment, unchanged from before this story", () => {
    expect(packPrefix({ lane: "user", userId: "u-1", packId: "haunted-manor", packVersion: 3 }))
      .toBe("u-1/haunted-manor/v3");
  });

  it("builds the library-lane prefix from the row uuid, with no user id segment", () => {
    expect(packPrefix({ lane: "library", rowId: "3f1b0c2e-0000-4000-8000-000000000001", packVersion: 3 }))
      .toBe("3f1b0c2e-0000-4000-8000-000000000001/v3");
  });

  // The pack's slug must not appear in the path at all. A library pack is
  // authored in the open — tiles land in the bucket weeks before publication —
  // and CDN reads consult neither storage RLS nor the bucket's public flag, so
  // a name-derived path would make an unannounced pack's every tile fetchable
  // by anyone who guessed the name.
  it("never puts the pack's slug in the path", () => {
    const prefix = packPrefix({ lane: "library", rowId: "3f1b0c2e-0000-4000-8000-000000000001", packVersion: 1 });
    expect(prefix).not.toContain("haunted-manor");
    expect(prefix.split("/")[0]).toBe("3f1b0c2e-0000-4000-8000-000000000001");
  });
});

describe("userPackTarget", () => {
  it("resolves the tile-packs bucket, user_tile_packs table, and the user-lane prefix", () => {
    const target = userPackTarget({
      id: "row-1", user_id: "u-1", pack_id: "custom-haunted-manor-u1234567", pack_version: 2, manifest,
    });
    expect(target).toEqual({
      lane: "user",
      bucket: "tile-packs",
      prefix: "u-1/custom-haunted-manor-u1234567/v2",
      table: "user_tile_packs",
      rowId: "row-1",
      packId: "custom-haunted-manor-u1234567",
      packVersion: 2,
      manifest,
    });
  });
});

describe("libraryPackTarget", () => {
  it("resolves the library-tile-packs bucket, library_tile_packs table, and the library-lane prefix", () => {
    const target = libraryPackTarget({ id: "row-2", pack_id: "haunted-manor", pack_version: 1, manifest });
    expect(target).toEqual({
      lane: "library",
      bucket: "library-tile-packs",
      prefix: "row-2/v1",
      table: "library_tile_packs",
      rowId: "row-2",
      packId: "haunted-manor",
      packVersion: 1,
      manifest,
    });
  });
});

describe("mintLibraryPackId", () => {
  it("slugifies a requested name", () => {
    expect(mintLibraryPackId("Haunted Manor!")).toBe("haunted-manor");
  });

  it("rejects a slug that is empty after slugging", () => {
    expect(mintLibraryPackId("   ")).toBeNull();
    expect(mintLibraryPackId("!!!")).toBeNull();
  });

  it("rejects a slug starting with custom- — that prefix is reserved for user packs", () => {
    expect(mintLibraryPackId("custom-haunted-manor")).toBeNull();
    expect(mintLibraryPackId("Custom Haunted Manor")).toBeNull();
  });
});
