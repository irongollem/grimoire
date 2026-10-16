import type { NoticeBoardPin } from "@/types/noticeBoard.types";

/** Pin rows for the editor tests: the notices the feature was drawn around. */
export function pinRow(overrides: Partial<NoticeBoardPin> = {}): NoticeBoardPin {
  return {
    id: "pin-goat",
    user_id: "u1",
    campaign_id: "camp-1",
    board_id: "board-1",
    style: "note",
    headline: "LOST: one goat",
    body: "Answers to Gerald. Brown, one horn, eats anything, letters included.",
    reward: null,
    image_url: null,
    seal: null,
    size: "md",
    x: 0.1,
    y: 0.2,
    sort_order: 1,
    status: "up",
    quest_id: null,
    handout_id: null,
    taken_by: null,
    taken_at: null,
    taken_session_number: null,
    created_at: "2026-10-16T10:00:00Z",
    updated_at: "2026-10-16T10:00:00Z",
    ...overrides,
  };
}

export const grellRow = (overrides: Partial<NoticeBoardPin> = {}) =>
  pinRow({
    id: "pin-grell",
    style: "poster",
    headline: "Grell Ashmantle",
    body: "Wanted for the burning of the miller's barn and the theft of three prize hens.",
    reward: "50 gold crowns, paid at the reeve's hall",
    image_url: "https://example.invalid/grell.webp",
    sort_order: 2,
    ...overrides,
  });

export const letterRow = (overrides: Partial<NoticeBoardPin> = {}) =>
  pinRow({
    id: "pin-letter",
    style: "letter",
    headline: "To the brave souls who read this",
    body: "The mine at Cinderfall has gone quiet. Come before the thaw.",
    seal: "red",
    sort_order: 3,
    ...overrides,
  });
