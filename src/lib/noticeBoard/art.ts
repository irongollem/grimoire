import { artUrl } from "@/lib/assets/artUrl";
import type { NoticeBoardSurface, NoticePinSeal } from "@/types/noticeBoard.types";
import type { ScrapName, TackName } from "./geometry";

const DIR = "/assets/notice-board";

function file(name: string): string {
  return artUrl(`${DIR}/${name}.webp`);
}

/** CSS `url()` for a board image. The art lives under artUrl, which a stylesheet cannot call, so it reaches CSS as a variable. */
export function cssUrl(href: string): string {
  return `url("${href}")`;
}

/** The surface tile at 1x and 2x. It repeats every 800 board units, so the 2x file is the one that stays sharp. */
export function surfaceImageSet(name: NoticeBoardSurface | "poster-paper"): string {
  return `image-set(${cssUrl(file(`surface-${name}`))} 1x, ${cssUrl(artUrl(`${DIR}/surface-${name}@2x.webp`))} 2x)`;
}

export const tackUrl = (name: TackName): string => file(name);
export const sealUrl = (seal: NoticePinSeal): string => file(`seal-${seal}`);
export const scrapUrl = (name: ScrapName): string => file(name);
export const PAPER_URL = "/assets/vellum/paper.webp";
export const paperUrl = (): string => artUrl(PAPER_URL);

export interface FrameArt {
  src: string;
  /** border-image-slice, past each corner's bracket or pegs rather than at the rail's width (manifest.json). */
  slice: { top: number; right: number; bottom: number; left: number };
}

export const FRAMES: Record<NoticeBoardSurface, FrameArt> = {
  cork: { src: "frame-oak", slice: { top: 114, right: 114, bottom: 114, left: 114 } },
  planks: { src: "frame-pine", slice: { top: 104, right: 88, bottom: 104, left: 88 } },
};

/** A frame's drawn width on the board: the slice, shrunk to this share, so a rail is about 50 units. */
export const FRAME_SCALE = 0.55;

export function frameUrl(surface: NoticeBoardSurface): string {
  return file(FRAMES[surface].src);
}

/** The vellum torn slip's edge (vellum.css --vl-slip-frame, light), restated because a board is lit the same in every theme. */
function tornEdge(fill: string, stroke: string): string {
  return `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='72' height='72'%3E%3Cfilter id='r' x='-10%25' y='-10%25' width='120%25' height='120%25'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.045 0.07' numOctaves='3' seed='11'/%3E%3CfeDisplacementMap in='SourceGraphic' scale='6' xChannelSelector='R' yChannelSelector='G'/%3E%3C/filter%3E%3Crect x='5' y='5' width='62' height='62' fill='%23${fill}' stroke='%23${stroke}' stroke-width='1' filter='url%28%23r%29'/%3E%3C/svg%3E")`;
}

export const NOTE_EDGE = tornEdge("faf6ee", "cfc3ad");
/** Sun-yellowed, a cheaper paper than a hand-written note. */
export const POSTER_EDGE = tornEdge("e6d3a1", "a38d5a");

/**
 * A pin's cast shadow: the same torn edge, already black, so the shadow needs only a blur. It used to be the paper's
 * own edge turned black by `brightness(0)`, and where a browser dropped that filter the shadow showed as a second
 * cream sheet poking out past the paper's bottom and right (16 Oct 2026).
 */
export const CAST_EDGE = tornEdge("000000", "000000");

/** The torn edge a style's paper is cut with. */
export function edgeFor(style: "note" | "poster" | "letter" | "image"): string {
  return style === "poster" ? POSTER_EDGE : NOTE_EDGE;
}
