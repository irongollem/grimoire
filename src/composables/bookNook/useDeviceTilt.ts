import { onScopeDispose, readonly, ref, watch, type Ref } from "vue";
import type { Point } from "@/lib/bookNook/scene";
import { recentre, smoothTilt, tiltFromOrientation, type Orientation } from "@/lib/bookNook/tilt";
import { prefersReducedMotion } from "@/lib/motion";

type PermissionedEvent = { requestPermission?: () => Promise<"granted" | "denied"> };

/**
 * Whether the session may read the motion sensors, asked at most once. iOS prompts on the first call and
 * remembers; asking again from another picture would only prompt again after a refusal. Module scope on
 * purpose: the answer belongs to the page, not to one picture.
 */
let permission: Promise<boolean> | null = null;

/** Below this a tilt counts as none, so the picture can breathe again (and a tiny reading never "moves" it). */
const SETTLED = 0.01;
/** A reading must be this far (view tilt units) from level before the phone counts as having moved. */
const MOVED = 0.08;
/** Degrees a reading may change between events and still count as held still. */
const STILL_DEGREES = 0.6;

const ZERO: Point = { x: 0, y: 0 };

function screenAngle(): number {
  if (typeof screen !== "undefined" && screen.orientation) return screen.orientation.angle;
  return 0;
}

/**
 * The phone's tilt as a view tilt (-1..1 each), for looking round a full-screen nook.
 *
 * `start()` must be called synchronously from a tap: on an iPhone the motion prompt may only be raised from
 * one, and it is raised right there, before anything is awaited. Android asks nothing. A refusal (or no
 * sensor) leaves `active` false, and the picture goes on breathing. `active` turns true only once the phone
 * has actually moved. Under reduced motion nothing starts.
 */
export function useDeviceTilt() {
  const tilt = ref<Point>(ZERO);
  const active = ref(false);
  let wanted = false;
  let listening = false;
  let level: Orientation | null = null;
  let last: Orientation | null = null;
  let lastAt = 0;
  let still = 0;

  function onReading(e: DeviceOrientationEvent) {
    if (e.beta === null || e.gamma === null) return;
    const reading = { beta: e.beta, gamma: e.gamma };
    const now = e.timeStamp || performance.now();
    const dt = lastAt ? Math.min(0.25, (now - lastAt) / 1000) : 0;
    lastAt = now;
    level ??= reading;
    const moved = last ? Math.max(Math.abs(reading.beta - last.beta), Math.abs(reading.gamma - last.gamma)) : 0;
    still = moved < STILL_DEGREES ? still + dt : 0;
    last = reading;
    level = recentre(level, reading, still, dt);
    const target = tiltFromOrientation(reading, level, screenAngle());
    if (!active.value && Math.hypot(target.x, target.y) > MOVED) active.value = true;
    const next = smoothTilt(tilt.value, target, dt || 1 / 60);
    tilt.value = { x: Math.abs(next.x) < SETTLED ? 0 : next.x, y: Math.abs(next.y) < SETTLED ? 0 : next.y };
  }

  /** Turning the screen changes what level means: take it afresh from the next reading. */
  function onTurn() {
    level = null;
    last = null;
    still = 0;
  }

  function listen() {
    if (!wanted || listening) return;
    listening = true;
    window.addEventListener("deviceorientation", onReading);
    screen.orientation?.addEventListener?.("change", onTurn);
  }

  function start() {
    if (wanted || prefersReducedMotion() || typeof window === "undefined") return;
    wanted = true;
    const ask = (window.DeviceOrientationEvent as unknown as PermissionedEvent | undefined)?.requestPermission;
    if (typeof ask === "function") {
      // Called here, in the tap's own turn: not after an await, or iOS refuses to prompt.
      permission ??= ask.call(window.DeviceOrientationEvent).then(
        (answer) => answer === "granted",
        () => false,
      );
      void permission.then((granted) => {
        if (granted) listen();
      });
    } else listen();
  }

  function stop() {
    wanted = false;
    if (listening) {
      window.removeEventListener("deviceorientation", onReading);
      screen.orientation?.removeEventListener?.("change", onTurn);
    }
    listening = false;
    level = null;
    last = null;
    lastAt = 0;
    still = 0;
    active.value = false;
    tilt.value = ZERO;
  }

  onScopeDispose(stop);
  return { tilt: readonly(tilt), active: readonly(active), start, stop };
}

/**
 * The pointer's place over `target` as a view tilt (-1..1 each, 0 in the middle), followed with the same
 * ease as the phone and back to 0 when the pointer leaves. For laptops and the website; none under reduced
 * motion.
 */
export function usePointerTilt(target: Ref<Element | null>) {
  const tilt = ref<Point>(ZERO);
  let goal: Point = ZERO;
  let frame: number | null = null;
  let lastAt = 0;

  function step(now: number) {
    const dt = lastAt ? Math.min(0.1, (now - lastAt) / 1000) : 1 / 60;
    lastAt = now;
    const next = smoothTilt(tilt.value, goal, dt);
    const arrived = Math.hypot(next.x - goal.x, next.y - goal.y) < SETTLED;
    tilt.value = arrived ? goal : next;
    if (arrived) {
      frame = null;
      lastAt = 0;
    } else frame = requestAnimationFrame(step);
  }
  function chase() {
    if (frame === null && typeof requestAnimationFrame === "function") frame = requestAnimationFrame(step);
  }

  function onMove(e: Event) {
    const el = target.value;
    if (!el) return;
    const { clientX, clientY } = e as PointerEvent;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    goal = {
      x: Math.max(-1, Math.min(1, ((clientX - r.left) / r.width) * 2 - 1)),
      y: Math.max(-1, Math.min(1, ((clientY - r.top) / r.height) * 2 - 1)),
    };
    chase();
  }
  function onLeave() {
    goal = ZERO;
    chase();
  }

  watch(
    target,
    (el, was) => {
      was?.removeEventListener("pointermove", onMove);
      was?.removeEventListener("pointerleave", onLeave);
      if (!el || prefersReducedMotion()) return;
      el.addEventListener("pointermove", onMove);
      el.addEventListener("pointerleave", onLeave);
    },
    { immediate: true, flush: "post" },
  );
  onScopeDispose(() => {
    target.value?.removeEventListener("pointermove", onMove);
    target.value?.removeEventListener("pointerleave", onLeave);
    if (frame !== null) cancelAnimationFrame(frame);
  });

  return { tilt: readonly(tilt) };
}
