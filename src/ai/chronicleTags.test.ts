import { describe, it, expect } from "vitest";
import { parseChronicleTags, reconcileChronicleTags } from "./chronicleTags";

describe("parseChronicleTags", () => {
  it("splits a trailing tags line off the body", () => {
    const r = parseChronicleTags(
      "The party arrived at dusk.\n\n[[tags: icewind dale, council of speakers, frostbite]]",
    );
    expect(r).toEqual({
      tags: ["icewind dale", "council of speakers", "frostbite"],
      body: "The party arrived at dusk.",
    });
  });

  it("removes the blank lines the tags line leaves trailing", () => {
    const r = parseChronicleTags("Body text.\n\n[[tags: a, b]]\n");
    expect(r.body).toBe("Body text.");
  });

  it("is case-insensitive on the tags keyword", () => {
    const r = parseChronicleTags("Body.\n\n[[TAGS: a, b]]");
    expect(r.tags).toEqual(["a", "b"]);
  });

  it("tolerates extra whitespace inside the brackets", () => {
    const r = parseChronicleTags("Body.\n\n[[  tags  :   a ,  b  ]]");
    expect(r.tags).toEqual(["a", "b"]);
  });

  it("drops empty entries from double commas or trailing commas", () => {
    const r = parseChronicleTags("Body.\n\n[[tags: a,, b, ]]");
    expect(r.tags).toEqual(["a", "b"]);
  });

  it("still strips a tags line that proposes nothing", () => {
    expect(parseChronicleTags("Body.\n\n[[tags: ]]")).toEqual({ tags: [], body: "Body." });
  });

  it("returns no tags and the input untouched when there is no tags line", () => {
    const md = "Just a plain chronicle with no tags line.";
    expect(parseChronicleTags(md)).toEqual({ tags: [], body: md });
  });

  it("returns no tags and the input untouched for empty input", () => {
    expect(parseChronicleTags("")).toEqual({ tags: [], body: "" });
  });

  it("preserves tag order as written", () => {
    const r = parseChronicleTags("Body.\n\n[[tags: zebra, apple, mango]]");
    expect(r.tags).toEqual(["zebra", "apple", "mango"]);
  });

  it("removes a tags line that isn't the last line, leaving surrounding body intact", () => {
    const r = parseChronicleTags("First part.\n\n[[tags: a, b]]\n\nSecond part.");
    expect(r.tags).toEqual(["a", "b"]);
    expect(r.body).toBe("First part.\n\n\nSecond part.");
  });
});

describe("reconcileChronicleTags", () => {
  it("normalizes a genuinely new tag the way TagInput would", () => {
    const r = reconcileChronicleTags(["Icewind Dale"], []);
    expect(r).toEqual(["icewind-dale"]);
  });

  it("prefers the existing spelling when a proposed tag already exists under a different form", () => {
    const r = reconcileChronicleTags(["icewind-dale"], ["icewind dale"]);
    expect(r).toEqual(["icewind dale"]);
  });

  it("matches existing tags case-insensitively via normalization", () => {
    const r = reconcileChronicleTags(["Frostbite"], ["frostbite"]);
    expect(r).toEqual(["frostbite"]);
  });

  it("dedupes proposed tags that normalize to the same form", () => {
    const r = reconcileChronicleTags(["Icewind Dale", "icewind-dale"], []);
    expect(r).toEqual(["icewind-dale"]);
  });

  it("drops proposed tags that normalize to nothing", () => {
    const r = reconcileChronicleTags(["!!!", "frostbite"], []);
    expect(r).toEqual(["frostbite"]);
  });

  it("caps the result at 8 tags", () => {
    const proposed = Array.from({ length: 12 }, (_, i) => `tag-${i}`);
    const r = reconcileChronicleTags(proposed, []);
    expect(r).toHaveLength(8);
    expect(r).toEqual(["tag-0", "tag-1", "tag-2", "tag-3", "tag-4", "tag-5", "tag-6", "tag-7"]);
  });

  it("returns an empty list for an empty proposal", () => {
    expect(reconcileChronicleTags([], ["frostbite"])).toEqual([]);
  });
});
