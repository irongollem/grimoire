import { describe, expect, it } from "vitest";
import type { NoticeBoardPin } from "@/types/noticeBoard.types";
import { draftToUpdate, draftsEqual, hasFace, pinToDraft } from "./pinDraft";

function pin(overrides: Partial<NoticeBoardPin> = {}): NoticeBoardPin {
  return {
    id: "pin-grell",
    user_id: "u",
    campaign_id: "c",
    board_id: "b",
    style: "poster",
    headline: "Grell Ashmantle",
    body: "Wanted for the burning of the miller's barn and the theft of three prize hens.",
    reward: "50 gold crowns, paid at the reeve's hall",
    image_url: "https://example.invalid/grell.webp",
    seal: null,
    size: "md",
    x: 0.4,
    y: 0.1,
    sort_order: 1,
    status: "draft",
    quest_id: "q1",
    handout_id: null,
    taken_by: null,
    taken_at: null,
    taken_session_number: null,
    created_at: "",
    updated_at: "",
    ...overrides,
  };
}

describe("pinDraft", () => {
  it("round-trips a poster without touching its place or status", () => {
    const update = draftToUpdate(pinToDraft(pin()));
    expect(update.reward).toBe("50 gold crowns, paid at the reeve's hall");
    expect(update.image_url).toBe("https://example.invalid/grell.webp");
    expect(update).not.toHaveProperty("x");
    expect(update).not.toHaveProperty("status");
  });

  it("nulls blank text and drops what the style does not use", () => {
    const note = pinToDraft(pin({ style: "note", headline: "LOST: one goat", body: "   ", seal: "red" }));
    expect(draftToUpdate(note)).toMatchObject({ headline: "LOST: one goat", body: null, reward: null, image_url: null, seal: null });
  });

  it("gives every letter a seal", () => {
    const letter = pinToDraft(pin({ style: "letter", headline: "To the brave souls who read this", seal: null }));
    expect(draftToUpdate(letter).seal).toBe("red");
  });

  it("compares text by what would be saved, so a trailing space is not an edit", () => {
    const a = pinToDraft(pin());
    expect(draftsEqual(a, { ...a, headline: "Grell Ashmantle " })).toBe(true);
    expect(draftsEqual(a, { ...a, size: "lg" })).toBe(false);
  });

  it("knows a blank notice from one with a face", () => {
    expect(hasFace(pinToDraft(pin({ headline: null, body: null, image_url: null })))).toBe(false);
    expect(hasFace(pinToDraft(pin({ headline: null, body: "LOST: one goat", image_url: null })))).toBe(true);
  });

  it.each([
    ["style", { style: "note" as const }],
    ["image", { image_url: "https://example.invalid/other.webp" }],
    ["seal", { seal: "black" as const }],
    ["reward", { reward: "75 gold" }],
    ["body", { body: "Something else" }],
    ["quest", { quest_id: "q2" }],
    ["handout", { handout_id: "h1" }],
  ])("sees a changed %s as an edit worth saving", (_name, change) => {
    const a = pinToDraft(pin());
    expect(draftsEqual(a, { ...a, ...change })).toBe(false);
  });

  it("keeps the picture for a picture-style notice and drops it from a note", () => {
    const base = { image_url: "https://example.invalid/x.webp" };
    expect(draftToUpdate(pinToDraft(pin({ style: "image", ...base }))).image_url).toBe(base.image_url);
    expect(draftToUpdate(pinToDraft(pin({ style: "note", ...base }))).image_url).toBeNull();
  });

  it("counts a picture alone as something to show", () => {
    expect(hasFace(pinToDraft(pin({ headline: null, body: null, image_url: "https://example.invalid/x.webp" })))).toBe(true);
  });
});
