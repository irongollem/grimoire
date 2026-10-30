/**
 * The three screens an episode can be filmed on, and where each sits in the Reel.
 * Pure data, so the recorder, the card art and the assembler agree.
 */
import type { Device } from "./types.ts";

export interface DeviceSpec {
  /** CSS pixels of the page. */
  viewport: { width: number; height: number };
  /** Device pixels per CSS pixel; a headed Chrome has one per browser. */
  scale: number;
  touch: boolean;
  mobile: boolean;
  /** Where the screen shows in the 1080x1920 Reel. */
  window: { x: number; y: number; w: number; h: number; radius: number };
  /** A phone or tablet is a rounded screen with a shadow; a desktop is a camera window with paper around the screen. */
  framed: boolean;
  /** CSS pixels of sidebar on the left of the screen; the camera's resting view starts beside it. */
  sidebar: number;
}

export const DEVICES: Record<Device, DeviceSpec> = {
  phone: { viewport: { width: 390, height: 693 }, scale: 3, touch: true, mobile: true, window: { x: 150, y: 430, w: 780, h: 1387, radius: 44 }, framed: true, sidebar: 0 },
  tablet: { viewport: { width: 820, height: 1180 }, scale: 2, touch: true, mobile: true, window: { x: 90, y: 430, w: 900, h: 1295, radius: 44 }, framed: true, sidebar: 0 },
  desktop: { viewport: { width: 1440, height: 900 }, scale: 2, touch: false, mobile: false, window: { x: 40, y: 430, w: 1000, h: 1440, radius: 0 }, framed: false, sidebar: 240 },
};
