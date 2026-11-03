import { h, type Component, type FunctionalComponent } from "vue";
import type { DeckSize } from "@/lib/audio/deck/deckSurface";

/**
 * The four sizes drawn as the screen they leave: a frame with the line where
 * the deck's top edge sits (higher line = more deck). Same strokes as lucide so
 * they sit beside the other icons.
 */
function frame(lineY: number | null, full = false): FunctionalComponent {
  return (_props, { attrs }) =>
    h(
      "svg",
      {
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        "stroke-width": 2,
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
        ...attrs,
      },
      full
        ? [h("path", { d: "M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3" })]
        : [h("rect", { x: 3, y: 4, width: 18, height: 16, rx: 1 }), h("path", { d: `M3 ${lineY}h18` })],
    );
}

export const DECK_SIZE_ICON: Record<DeckSize, Component> = {
  tucked: frame(18),
  row: frame(15),
  deck: frame(11),
  full: frame(null, true),
};

export const DECK_SIZE_LABEL: Record<DeckSize, string> = {
  tucked: "Tucked",
  row: "Row",
  deck: "Deck",
  full: "Full",
};

export const DECK_SIZE_HINT: Record<DeckSize, string> = {
  tucked: "Tuck the deck away",
  row: "One row of pads",
  deck: "Two and a half rows",
  full: "Every row, full screen",
};
