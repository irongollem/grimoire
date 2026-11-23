import { describe, expect, it } from "vitest";
import { dmWordsOf, isPictureQuestion, pictureSaid, pictureSettled } from "./askSettled.ts";

describe("pictureSaid", () => {
  // Bug caught: the DM writing "No portrait." and still being asked about one.
  it.each([
    "A baker called Mara. No portrait.",
    "no picture",
    "Make a smith, no portrait please",
    "an innkeeper without a portrait",
    "skip the portrait",
    "don't paint them",
    "do not add a portrait",
    "I don't need a picture",
    "no image, thanks",
  ])("reads %j as no", (text) => expect(pictureSaid(text)).toBe("no"));

  it.each([
    "A baker, with a portrait",
    "add a portrait",
    "yes, a portrait",
    "paint them",
    "I want a picture of her",
    "make a portrait too",
  ])("reads %j as yes", (text) => expect(pictureSaid(text)).toBe("yes"));

  // Bug caught: a word that merely appears counting as the DM's answer, silently dropping or adding a picture.
  it.each([
    "a portrait of the old portrait painter",
    "There is no portrait painter in town",
    "no portrait of him hangs in the hall",
    "she works with a portrait painter",
    "Make a baker called Mara",
    "I know portrait work is costly",
    "",
  ])("reads %j as nothing", (text) => expect(pictureSaid(text)).toBeNull());

  // Bug caught: "without" matching the "with a portrait" yes pattern.
  it("does not read 'without a portrait' as yes", () => expect(pictureSaid("without a portrait")).toBe("no"));
});

describe("pictureSettled", () => {
  it("takes the DM's latest word", () => {
    expect(pictureSettled(["no portrait", "actually, with a portrait"])).toBe("yes");
    expect(pictureSettled(["with a portrait", "never mind, no portrait."])).toBe("no");
  });
  it("is null when nothing was said", () => expect(pictureSettled(["a baker", "friendly"])).toBeNull());
});

describe("isPictureQuestion", () => {
  it("sees a picture in the question or a chip", () => {
    expect(isPictureQuestion("Want a portrait?", [])).toBe(true);
    expect(isPictureQuestion("Which style?", [{ label: "Painted", reply: "Paint a portrait" }])).toBe(true);
  });
  it("leaves other questions alone", () => expect(isPictureQuestion("Where do they live?", [{ label: "Town", reply: "In town" }])).toBe(false));
});

describe("dmWordsOf", () => {
  // Bug caught: a record's text (a tool result, which also has the user role) being read as the DM saying "no portrait".
  it("takes the DM's text and not tool results or the assistant", () => {
    const words = dmWordsOf([
      { role: "user", blocks: [{ type: "text", text: "a baker" }] },
      { role: "assistant", blocks: [{ type: "text", text: "no portrait" }] },
      { role: "user", blocks: [{ type: "tool_result", callId: "t", content: "no portrait", isError: false }] },
    ]);
    expect(words).toEqual(["a baker"]);
  });
});
