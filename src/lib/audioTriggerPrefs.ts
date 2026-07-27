/**
 * Whether campaign events are allowed to drive the soundboard.
 *
 * A DM preference rather than campaign data: it is about how this person likes
 * to run a table, and it should follow them across every campaign they own.
 * Stored in localStorage for the same reason the dice-audio preference is.
 */

const STORAGE_KEY = "grimoire.audioTriggers.enabled";

/**
 * Defaults to on. With nothing labelled it does nothing at all, so the failure
 * mode of the default is silence rather than surprise.
 */
export function getAudioTriggersEnabled(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw === null ? true : raw === "true";
  } catch {
    // Private browsing, or storage disabled entirely. Fall back to the default
    // rather than letting a preference read break the layout that calls it.
    return true;
  }
}

export function setAudioTriggersEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(enabled));
  } catch {
    /* nothing to do — the in-memory ref still holds for this session */
  }
}
