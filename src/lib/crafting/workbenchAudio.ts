/**
 * Sounds on the crafting workbench (#1100): a short work sound when the roll
 * is made, chosen by the discipline's bench, and an outcome sting.
 *
 * Lives in `lib/crafting/` rather than `lib/audio/`: `lib/audio/` is the DM
 * soundboard (its engine, ducking and campaign triggers), which these one-shot
 * effects have nothing to do with. They sit with the dice sounds' model
 * instead: a per-device on/off preference in localStorage, no engine. There is
 * no app-wide sound-off to respect beyond that; the soundboard's master volume
 * is the DM's table audio and is deliberately not tied to the player's bench.
 */
import { WORKBENCH_BENCH_FOR } from "@/data/workbenchArt";
import {
  WORKBENCH_DISCIPLINE_SOUNDS,
  WORKBENCH_STINGS,
  WORKBENCH_WORK_SOUNDS,
  type WorkbenchSound,
  type WorkbenchSting,
} from "@/data/workbenchSounds";
import { canPlayOggVorbis } from "@/lib/audio/oggSupport";
import { reportHandledError } from "@/lib/observability/sentry";
import { safeLocalStorage } from "@/lib/safeLocalStorage";
import { getPublicUrl } from "@/lib/storage/urls";
import type { CraftingDiscipline, CraftingOutcome } from "@/types/crafting.types";

const PREF_KEY = "grimoire_workshop_sounds";
const DEFAULT_GAP_MS = 400;

export function getWorkshopSoundsEnabled(): boolean {
  return safeLocalStorage().getItem(PREF_KEY) !== "false"; // default on
}

export function setWorkshopSoundsEnabled(enabled: boolean): void {
  safeLocalStorage().setItem(PREF_KEY, String(enabled));
}

/** The outcome of an attempt as the sting for it. */
export function stingForOutcome(outcome: CraftingOutcome): WorkbenchSting {
  return outcome === "success" ? "success" : outcome === "ruin" ? "critical" : "failure";
}

function playOnce(url: string, gain: number): void {
  try {
    const audio = new Audio(url);
    audio.volume = Math.min(1, Math.max(0, gain));
    // One report per failure: a file that will not load also rejects play(), so no "error"
    // listener beside it. Autoplay blocked until the first gesture (NotAllowedError) or a play
    // cut short (AbortError) is the browser's ordinary behaviour, not a fault.
    void audio.play().catch((e: unknown) => {
      if (e instanceof DOMException && (e.name === "NotAllowedError" || e.name === "AbortError")) return;
      reportHandledError(e, "workbench-audio", { url });
    });
  } catch (e) {
    reportHandledError(e, "workbench-audio", { url });
  }
}

function play(sound: WorkbenchSound): void {
  if (sound.slug === null) return;
  if (!getWorkshopSoundsEnabled()) return;
  // The library is Ogg (#1111); a device that cannot decode it is told so by AudioFormatNotice.
  if (!canPlayOggVorbis()) return;
  const url = getPublicUrl("sounds", `library/${sound.slug}.ogg`);
  const gain = sound.gain === undefined ? 1 : sound.gain;
  const times = sound.repeat === undefined ? 1 : sound.repeat;
  const gap = sound.gapMs === undefined ? DEFAULT_GAP_MS : sound.gapMs;
  for (let i = 0; i < times; i++) {
    if (i === 0) playOnce(url, gain);
    else setTimeout(() => playOnce(url, gain), gap * i);
  }
}

/** The discipline's own sound if it has one, else its bench's. */
export function workSoundFor(discipline: CraftingDiscipline): WorkbenchSound {
  return WORKBENCH_DISCIPLINE_SOUNDS[discipline] ?? WORKBENCH_WORK_SOUNDS[WORKBENCH_BENCH_FOR[discipline]];
}

/** Silent for a sound not yet chosen. */
export function playWorkSound(discipline: CraftingDiscipline): void {
  play(workSoundFor(discipline));
}

export function playOutcomeSting(sting: WorkbenchSting): void {
  play(WORKBENCH_STINGS[sting]);
}
