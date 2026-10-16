import type { NoticePinFace } from "@/types/noticeBoard.types";

/** A few real-looking notices, shared by the board tests. */
export function face(overrides: Partial<NoticePinFace> = {}): NoticePinFace {
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
    ...overrides,
  };
}

export const goat = face({
  id: "pin-goat",
  headline: "LOST: one goat",
  body: "Answers to Gerald. Brown, one horn, eats anything, letters included. A fresh pie to whoever brings him home.",
});

export const grell = face({
  id: "pin-grell",
  style: "poster",
  headline: "Grell Ashmantle",
  body: "Wanted for the burning of the miller's barn and the theft of three prize hens.",
  reward: "50 gold crowns, paid at the reeve's hall",
  image_url: "https://example.invalid/grell.webp",
  x: 0.4,
  y: 0.1,
});

export const sealed = face({
  id: "pin-letter",
  style: "letter",
  headline: "To the brave souls who read this",
  body: "The mine at Cinderfall has gone quiet. Come before the thaw.",
  seal: "red",
  x: 0.7,
  y: 0.5,
});

export const takenGoat = face({ ...goat, status: "taken", taken_by_name: "Aria", taken_session_number: 12 });

/** FocalImage measures with a ResizeObserver the test DOM lacks; the faces only need the picture it would draw. */
export const focalImageStub = { props: ["src"], template: '<img :src="src" />' };
