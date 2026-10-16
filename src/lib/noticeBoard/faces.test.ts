import { describe, expect, it } from "vitest";
import type { NoticeBoardPin } from "@/types/noticeBoard.types";
import { noticePhrase, pinLabel, stubLabel, toPinFace } from "./faces";

const goat: NoticeBoardPin = {
  id: "pin-goat",
  user_id: "u1",
  campaign_id: "c1",
  board_id: "b1",
  style: "note",
  headline: "LOST: one goat",
  body: "Answers to Gerald. Brown, one horn, eats anything, letters included.",
  reward: null,
  image_url: null,
  seal: null,
  size: "md",
  x: 0.1,
  y: 0.2,
  sort_order: 0,
  status: "taken",
  quest_id: "secret-quest",
  handout_id: "secret-handout",
  taken_by: "char-1",
  taken_at: "2026-10-01T20:00:00Z",
  taken_session_number: 12,
  created_at: "",
  updated_at: "",
};

describe("toPinFace", () => {
  it("carries the face and the taker, and leaves the quest and handout behind", () => {
    const face = toPinFace(goat, "Aria");
    expect(face).toMatchObject({ id: "pin-goat", style: "note", headline: "LOST: one goat", x: 0.1, y: 0.2, taken_by_name: "Aria", taken_session_number: 12 });
    expect(face).not.toHaveProperty("quest_id");
    expect(face).not.toHaveProperty("handout_id");
  });
});

describe("labels", () => {
  it("names a pin button for what it is and what it says", () => {
    expect(pinLabel({ style: "poster", headline: "Grell Ashmantle" })).toBe("Wanted poster: Grell Ashmantle");
    expect(pinLabel({ style: "letter", headline: "To the brave souls who read this" })).toBe("Letter: To the brave souls who read this");
    expect(pinLabel({ style: "image", headline: null })).toBe("Picture");
  });

  it("tells who took a notice, and in which session", () => {
    expect(stubLabel({ taken_by_name: "Aria", taken_session_number: 12 })).toBe("Taken by Aria, session 12");
    expect(stubLabel({ taken_by_name: "Aria", taken_session_number: null })).toBe("Taken by Aria");
    expect(stubLabel({ taken_by_name: null, taken_session_number: 12 })).toBe("Taken");
  });
});

describe("noticePhrase", () => {
  it("names who a wanted poster is for, and quotes anything else's first line", () => {
    expect(noticePhrase({ style: "poster", headline: "Grell Ashmantle" })).toBe("the wanted poster for Grell Ashmantle");
    expect(noticePhrase({ style: "note", headline: "LOST: one goat" })).toBe("“LOST: one goat”");
    expect(noticePhrase({ style: "letter", headline: "To the brave souls who read this" })).toBe("“To the brave souls who read this”");
  });

  it("falls back to what the pin is when it has no headline", () => {
    expect(noticePhrase({ style: "letter", headline: null })).toBe("a sealed letter");
    expect(noticePhrase({ style: "image", headline: "  " })).toBe("a picture");
  });
});
