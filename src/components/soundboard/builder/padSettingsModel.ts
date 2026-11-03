import { effectiveFades, effectiveLaunchMode, effectiveLoop } from "@/lib/audio/deck/deckModel";
import type { DeckPadKind } from "@/lib/audio/deck/deckSurface";
import type { LaunchMode, SoundCategory, SoundboardPad, SoundboardPadUpdate } from "@/types/sound.types";

/** What the form edits. Fades are seconds typed as text; empty means "the kind's default". */
export interface PadDraft {
  name: string;
  loop: boolean;
  volume: number;
  mode: LaunchMode;
  repeatMs: number;
  fadeIn: string;
  fadeOut: string;
  vary: boolean;
  velocity: boolean;
}

export const REPEAT_MIN = 100;
export const REPEAT_MAX = 5000;
const FADE_MAX_MS = 30_000;

function secondsText(ms: number | null): string {
  return ms === null ? "" : String(ms / 1000);
}

export function draftFromPad(pad: SoundboardPad, category: SoundCategory, kind: DeckPadKind): PadDraft {
  return {
    name: pad.name === null ? "" : pad.name,
    loop: effectiveLoop(pad, category, kind),
    volume: pad.volume,
    mode: effectiveLaunchMode(pad, category, kind),
    repeatMs: pad.repeat_ms,
    fadeIn: secondsText(pad.fade_in_ms),
    fadeOut: secondsText(pad.fade_out_ms),
    vary: pad.vary,
    velocity: pad.velocity,
  };
}

/** Empty or unreadable text is null (use the default); otherwise milliseconds, clamped to what a fade can be. */
export function fadeMsFromText(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  const seconds = Number(trimmed.replace(",", "."));
  if (!Number.isFinite(seconds)) return null;
  return Math.min(FADE_MAX_MS, Math.max(0, Math.round(seconds * 1000)));
}

/**
 * Only what the DM changed. A field left at what null already means is not
 * written, so a pad that was never touched keeps following its kind's defaults.
 */
export function padPatch(
  draft: PadDraft,
  pad: SoundboardPad,
  category: SoundCategory,
  kind: DeckPadKind,
): SoundboardPadUpdate {
  const patch: SoundboardPadUpdate = {};
  const name = draft.name.trim();
  const nextName = name === "" ? null : name;
  if (nextName !== pad.name) patch.name = nextName;
  if (draft.loop !== effectiveLoop(pad, category, kind)) patch.loop = draft.loop;
  if (draft.volume !== pad.volume) patch.volume = draft.volume;
  if (draft.mode !== effectiveLaunchMode(pad, category, kind)) patch.launch_mode = draft.mode;
  const repeat = Math.min(REPEAT_MAX, Math.max(REPEAT_MIN, Math.round(draft.repeatMs)));
  if (repeat !== pad.repeat_ms) patch.repeat_ms = repeat;
  const fadeIn = fadeMsFromText(draft.fadeIn);
  const fadeOut = fadeMsFromText(draft.fadeOut);
  if (fadeIn !== pad.fade_in_ms) patch.fade_in_ms = fadeIn;
  if (fadeOut !== pad.fade_out_ms) patch.fade_out_ms = fadeOut;
  if (draft.vary !== pad.vary) patch.vary = draft.vary;
  if (draft.velocity !== pad.velocity) patch.velocity = draft.velocity;
  return patch;
}

/** The kind's default fade, in seconds, for a placeholder. */
export function fadePlaceholder(category: SoundCategory, which: "in" | "out"): string {
  const fades = effectiveFades({ fade_in_ms: null, fade_out_ms: null }, category);
  return String((which === "in" ? fades.inMs : fades.outMs) / 1000);
}

/** Move one id to a new index; an out-of-range or unchanged move returns the same order. */
export function moveId(ids: readonly string[], from: number, to: number): string[] {
  const next = [...ids];
  if (from === to || from < 0 || from >= next.length || to < 0 || to >= next.length) return next;
  const [moved] = next.splice(from, 1);
  if (moved === undefined) return next;
  next.splice(to, 0, moved);
  return next;
}

export const LAUNCH_MODE_HINT: Record<LaunchMode, string> = {
  trigger: "Plays once. Every press fires it again.",
  toggle: "Press to start, press again to stop.",
  gate: "Plays while you hold it.",
  repeat: "Fires again on a beat while you hold it.",
};
