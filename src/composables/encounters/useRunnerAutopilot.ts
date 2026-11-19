import { createGlobalState, useStorage } from "@vueuse/core";
import { safeLocalStorage } from "@/lib/safeLocalStorage";

/**
 * The DM's standing Autopilot switch for the fight runner (#1021 row 5a): while on, the app plays every creature's
 * turn and passes it on. One ref for the whole app, because the switch is drawn in more than one place (the classic
 * runner's top bar, the combat tools sheet of the phone and the Play screen) and the loop reads it in a third.
 * Kept on the device: it is how this DM likes to run, not a fact about a fight.
 */
export const useRunnerAutopilot = createGlobalState(() => useStorage<boolean>("grimoire:runner-autopilot", false, safeLocalStorage()));
