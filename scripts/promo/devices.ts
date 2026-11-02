/**
 * The three screens an episode can be filmed on: what the recorder needs to
 * film them. Where each sits in a finished video is layouts.ts.
 */
import type { Device } from "./types.ts";

export interface DeviceSpec {
  /** CSS pixels of the page. */
  viewport: { width: number; height: number };
  /** Device pixels per CSS pixel; a headed Chrome has one per browser. */
  scale: number;
  touch: boolean;
  mobile: boolean;
  /** CSS pixels of sidebar on the left of the screen; the camera's resting view starts beside it. */
  sidebar: number;
}

export const DEVICES: Record<Device, DeviceSpec> = {
  phone: { viewport: { width: 390, height: 693 }, scale: 3, touch: true, mobile: true, sidebar: 0 },
  tablet: { viewport: { width: 820, height: 1180 }, scale: 2, touch: true, mobile: true, sidebar: 0 },
  desktop: { viewport: { width: 1440, height: 900 }, scale: 2, touch: false, mobile: false, sidebar: 240 },
};
