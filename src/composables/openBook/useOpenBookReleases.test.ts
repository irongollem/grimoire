import { describe, expect, it } from "vitest";
import {
  RELEASE_LIST_COLUMNS,
  openBookPreviewKey,
  openBookReleasesKey,
  releaseSnapshotKey,
} from "./useOpenBookReleases";
import { openBookKey } from "./useOpenBook";

describe("open book query keys", () => {
  it("start with their registry roots", () => {
    expect(openBookKey("c")[0]).toBe("open-book");
    expect(openBookReleasesKey("c")[0]).toBe("open-book-releases");
    expect(releaseSnapshotKey("r")[0]).toBe("open-book-releases");
    expect(openBookPreviewKey("c")[0]).toBe("open-book");
  });
  it("keeps a snapshot out of the list's own key", () => {
    expect(releaseSnapshotKey("r")).not.toEqual(openBookReleasesKey("r"));
  });
});

describe("RELEASE_LIST_COLUMNS", () => {
  it("never reads the snapshot", () => {
    expect(RELEASE_LIST_COLUMNS).not.toMatch(/snapshot/);
    expect(RELEASE_LIST_COLUMNS).toMatch(/\bstats\b/);
  });
});
