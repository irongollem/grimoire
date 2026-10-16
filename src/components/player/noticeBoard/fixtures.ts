import type { PlayerNoticeBoard, PlayerNoticePin } from "@/types/noticeBoard.types";

export function pin(over: Partial<PlayerNoticePin> = {}): PlayerNoticePin {
  return {
    id: "pin-1",
    style: "note",
    headline: null,
    body: null,
    reward: null,
    image_url: null,
    seal: null,
    size: "md",
    x: 0.1,
    y: 0.2,
    status: "up",
    taken_by_name: null,
    taken_session_number: null,
    sort_order: 0,
    updated_at: "2026-10-15T10:00:00Z",
    offers: false,
    taken_at: null,
    quest_id: null,
    handout_id: null,
    ...over,
  };
}

export const grellPoster = pin({
  id: "pin-grell",
  style: "poster",
  headline: "Grell Ashmantle",
  body: "Wanted for the burning of the miller's barn and the theft of three prize hens.",
  reward: "50 gold crowns, paid at the reeve's hall",
  offers: true,
  sort_order: 0,
});
export const goatNote = pin({ id: "pin-goat", headline: "LOST: one goat", body: "Answers to Gerald.", offers: false, sort_order: 1 });
export const ratsStub = pin({
  id: "pin-rats",
  headline: "Rats in the cellar",
  status: "taken",
  taken_by_name: "Chicory",
  taken_session_number: 3,
  quest_id: "q-rats",
  handout_id: "h-rats",
  sort_order: 2,
});

export function board(over: Partial<PlayerNoticeBoard> = {}): PlayerNoticeBoard {
  return {
    id: "board-1",
    name: "The Notice Board at The Pulled Sugar Inn",
    surface: "cork",
    presented_at: null,
    updated_at: "2026-10-15T10:00:00Z",
    location_ids: [],
    pins: [grellPoster, goatNote, ratsStub],
    ...over,
  };
}
