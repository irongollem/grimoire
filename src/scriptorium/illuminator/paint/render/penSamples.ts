/*
 * Turns the browser's pointer events into the engine's samples, in document pixels (#1181). Kept apart from
 * the stage so it is tested without a DOM.
 */
import type { PenSample } from "../engine/types";
import { screenToDoc, type Viewport } from "./viewport";

/** The parts of a PointerEvent the stage reads. */
export interface PointerEventLike {
  clientX: number;
  clientY: number;
  pressure: number;
  tiltX: number;
  tiltY: number;
  twist: number;
  timeStamp: number;
  pointerType: string;
  getCoalescedEvents?: () => PointerEventLike[];
}

export function pointerKind(pointerType: string): PenSample["pointer"] {
  if (pointerType === "pen" || pointerType === "touch") return pointerType;
  return "mouse";
}

/**
 * Every event the browser folded into this one. A pen reports far more points than there are frames, and the
 * stroke is only as smooth as the points it is given, so the coalesced list is the stroke and the event itself
 * only the fallback for a browser with none.
 */
export function eventsOf(ev: PointerEventLike): PointerEventLike[] {
  const coalesced = ev.getCoalescedEvents?.();
  return coalesced && coalesced.length > 0 ? coalesced : [ev];
}

export function toSamples(ev: PointerEventLike, origin: { left: number; top: number }, vp: Viewport): PenSample[] {
  return eventsOf(ev).map((e) => {
    const p = screenToDoc(vp, e.clientX - origin.left, e.clientY - origin.top);
    const pointer = pointerKind(e.pointerType);
    return {
      x: p.x,
      y: p.y,
      // A finger reports 0 on browsers that give it no force; a stroke of zero pressure paints nothing.
      pressure: pointer === "touch" && e.pressure === 0 ? 0.5 : e.pressure,
      tiltX: e.tiltX,
      tiltY: e.tiltY,
      twist: e.twist,
      time: e.timeStamp,
      pointer,
    };
  });
}

/** What the pen last reported, for the status line and the Pen view. */
export interface PenReading {
  pointer: PenSample["pointer"];
  pressure: number;
  /** Lean from upright, in degrees. */
  tilt: number;
  /** Which of the pen's three signals this device has ever sent. A mouse sends none. */
  reported: { pressure: boolean; tilt: boolean; rotation: boolean };
}

/**
 * Folds one pointer event into the reading. A signal counts as reported once a pen has sent it (a pen held
 * upright reports tilt 0 for a moment, which must not unreport it); a mouse's fixed 0.5 pressure is not a report.
 */
export function readPen(prev: PenReading | null, ev: Pick<PointerEventLike, "pressure" | "tiltX" | "tiltY" | "twist" | "pointerType">): PenReading {
  const pointer = pointerKind(ev.pointerType);
  const before = prev?.reported ?? { pressure: false, tilt: false, rotation: false };
  const isPen = pointer === "pen";
  return {
    pointer,
    pressure: ev.pressure,
    tilt: Math.round(Math.hypot(ev.tiltX, ev.tiltY)),
    reported: {
      pressure: before.pressure || (isPen && ev.pressure > 0),
      tilt: before.tilt || (isPen && (ev.tiltX !== 0 || ev.tiltY !== 0)),
      rotation: before.rotation || (isPen && ev.twist !== 0),
    },
  };
}
