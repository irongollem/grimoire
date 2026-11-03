/**
 * How a screen is presented in each output format: the frame it sits in, where
 * the caption goes, and whether the narration is written out. Pure data, so the
 * card art and the assembler agree. What is needed to film a screen at all
 * (viewport, scale, touch) stays in devices.ts.
 */
import type { Device, Format } from "./types.ts";

export interface Layout {
  /** The output frame. */
  canvas: { width: number; height: number };
  window: { x: number; y: number; w: number; h: number; radius: number };
  /**
   * What the screen is drawn in. A phone or tablet is a rounded `device` screen with a shadow, shown whole
   * unless a shot moves the camera. A desktop is a `browser` window (a title bar with an address over the
   * page, rounded and shadowed the same way) that the camera always looks through, since a Reel's resting
   * view is the page beside the sidebar rather than the whole screen.
   */
  frame: "device" | "browser";
  /** Browser title bar height, in output pixels, above a `browser` window. Required when `frame` is "browser". */
  bar?: number;
  caption:
    /** Reel: a full-width band, always on. */
    | { kind: "band"; y: number; h: number }
    /** YouTube phone and tablet: a text panel beside the device, always on. */
    | { kind: "panel"; x: number; y: number; w: number; h: number }
    /** YouTube desktop: a pill over the page, shown from..to seconds into the shot. */
    | { kind: "lowerThird"; x: number; y: number; w: number; h: number; from: number; to: number };
  /**
   * Where the shot's narration is written out, below the window, for a layout
   * whose window leaves room for it. Most Reels play muted, and a desktop's
   * whole page is too small on a phone to carry the point on its own.
   */
  subtitles?: { y: number; h: number };
}

const REEL_CANVAS = { width: 1080, height: 1920 };
const REEL_CAPTION = { kind: "band", y: 230, h: 180 } as const;
const YOUTUBE_CANVAS = { width: 1920, height: 1080 };

export const LAYOUTS: Record<Format, Record<Device, Layout>> = {
  reel: {
    phone: { canvas: REEL_CANVAS, window: { x: 150, y: 430, w: 780, h: 1387, radius: 44 }, frame: "device", caption: REEL_CAPTION },
    tablet: { canvas: REEL_CANVAS, window: { x: 90, y: 430, w: 900, h: 1295, radius: 44 }, frame: "device", caption: REEL_CAPTION },
    // A desktop is landscape and stays landscape: a 4:3 window rests on the page column beside the sidebar
    // (1200x900 CSS px) whole. A tall window here once showed 625 of those 1200 px and cut every page's right
    // half away; zooms keep the window's shape, so they stay landscape too. The window is the page area of a
    // browser whose title bar (`bar` tall) sits above it.
    desktop: {
      canvas: REEL_CANVAS,
      window: { x: 40, y: 492, w: 1000, h: 750, radius: 22 },
      frame: "browser",
      bar: 52,
      caption: REEL_CAPTION,
      subtitles: { y: 1290, h: 250 },
    },
  },
  youtube: {
    // The window is 16:10, the shape of the whole 1440x900 screen, so the resting view is the whole screen,
    // sidebar included: a long video has room to show the app as it is. The caption floats over the page's
    // lower edge for the first seconds of a shot instead of taking space from it.
    desktop: {
      canvas: YOUTUBE_CANVAS,
      window: { x: 192, y: 70, w: 1536, h: 960, radius: 18 },
      frame: "browser",
      bar: 40,
      caption: { kind: "lowerThird", x: 232, y: 900, w: 1456, h: 96, from: 0.3, to: 4.5 },
    },
    // A phone and a tablet are tall, so they sit left at the full height and the caption gets the rest.
    phone: {
      canvas: YOUTUBE_CANVAS,
      window: { x: 260, y: 60, w: 540, h: 960, radius: 48 },
      frame: "device",
      caption: { kind: "panel", x: 900, y: 60, w: 840, h: 960 },
    },
    tablet: {
      canvas: YOUTUBE_CANVAS,
      window: { x: 200, y: 60, w: 667, h: 960, radius: 40 },
      frame: "device",
      caption: { kind: "panel", x: 967, y: 60, w: 793, h: 960 },
    },
  },
};

/** The layout a manifest's format and a shot's device call for; an absent format is a Reel and an absent device a phone. */
export function layoutFor(format: Format | undefined, device: Device | undefined): Layout {
  return LAYOUTS[format ?? "reel"][device ?? "phone"];
}

/** The output frame of a format, the same for every device. */
export function formatCanvas(format: Format | undefined): Layout["canvas"] {
  return LAYOUTS[format ?? "reel"].phone.canvas;
}
