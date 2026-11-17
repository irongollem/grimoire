import { describe, expect, it } from "vitest";
import { setEnvLine } from "./youtubeAuth";

describe("setEnvLine", () => {
  // A second sign-in that appended instead would leave the old, revoked token first in the file.
  it("replaces the key's existing line in place and leaves the others alone", () => {
    const before = "A=1\nYOUTUBE_REFRESH_TOKEN=old\nB=2\n";
    expect(setEnvLine(before, "YOUTUBE_REFRESH_TOKEN", "new")).toBe("A=1\nYOUTUBE_REFRESH_TOKEN=new\nB=2\n");
  });

  // Appended to a file with no final newline, the token would run onto the last key's value.
  it("appends on its own line when the key is absent", () => {
    expect(setEnvLine("A=1", "YOUTUBE_REFRESH_TOKEN", "t")).toBe("A=1\nYOUTUBE_REFRESH_TOKEN=t\n");
  });

  it("does not take a key that only ends with the name for it", () => {
    expect(setEnvLine("OLD_YOUTUBE_REFRESH_TOKEN=x\n", "YOUTUBE_REFRESH_TOKEN", "t")).toBe("OLD_YOUTUBE_REFRESH_TOKEN=x\nYOUTUBE_REFRESH_TOKEN=t\n");
  });
});
