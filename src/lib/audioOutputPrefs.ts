/**
 * Whether the soundboard bypasses the Web Audio graph and plays elements
 * directly. See `audioDirectOutput.ts` for what that buys and what it costs.
 *
 * A device preference rather than a DM one: it exists to work around a WebKit
 * bug that only bites on particular audio routes, so it belongs to the phone
 * that gets plugged into the car — not to the account. localStorage, same as
 * the audio-trigger and dice-audio preferences.
 */

const STORAGE_KEY = "grimoire.audioOutput.direct";

/**
 * Defaults to off. The graph is what makes the soundboard a soundboard —
 * fades, ducking, atmosphere presets — so the working-around mode has to be
 * asked for rather than guessed at.
 */
export function getDirectOutputEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    // Private browsing, or storage disabled entirely.
    return false;
  }
}

export function setDirectOutputEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(enabled));
  } catch {
    /* nothing to do — the in-memory ref still holds for this session */
  }
}
