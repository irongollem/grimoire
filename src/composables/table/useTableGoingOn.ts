import { onBeforeUnmount, ref, watch } from "vue";
import { useTableWatching } from "@/composables/table/useTableWatching";
import { goesOnByItself } from "@/lib/table/solo/watching";

/** The breath before the characters go on: long enough to read the last line and to step in. */
export const WATCH_PAUSE_MS = 2500;

export interface TableGoingOnDeps {
  /** A fight, a roll being asked for or a left sitting: nothing goes on by itself. */
  busy: () => boolean;
  /** A voice is still reading the last lines. */
  speaking: () => boolean;
  /** A turn is being answered. */
  running: () => boolean;
  /** Lets the characters go on among themselves for one turn. */
  listen: () => Promise<unknown>;
}

// ── Watching the characters talk ─────────────────────────────────────────────────────────────────────────────────
// When a turn ends with the characters still in the middle of a conversation among themselves, they go on without
// the player having to say "go on" (`lib/table/solo/watching.ts`): a few times in a row at most, after the voices have
// finished, and never once the player has begun to write or has stepped in.
export function useTableGoingOn(deps: TableGoingOnDeps) {
  const { watches } = useTableWatching();
  const watched = ref(0);
  const writing = ref(false);
  const goingOn = ref(false);
  let goOnTimer: ReturnType<typeof setTimeout> | null = null;
  function clearGoOn(): void {
    if (goOnTimer !== null) clearTimeout(goOnTimer);
    goOnTimer = null;
    goingOn.value = false;
  }
  /** The player takes the floor: whatever was about to go on by itself does not, and the count starts again. */
  function stepIn(): void {
    clearGoOn();
    watched.value = 0;
  }
  function watchOn(floor: "characters" | "player"): void {
    clearGoOn();
    if (!goesOnByItself({ floor, wanted: watches.value, watched: watched.value, busy: deps.busy(), writing: writing.value })) {
      if (floor === "player") watched.value = 0;
      return;
    }
    goingOn.value = true;
    const go = (): void => {
      // Not while a voice is still reading the last lines: the next ones would start before these have been heard.
      if (deps.speaking()) {
        goOnTimer = setTimeout(go, 400);
        return;
      }
      goOnTimer = null;
      goingOn.value = false;
      if (writing.value || deps.running()) return;
      watched.value += 1;
      void deps.listen();
    };
    goOnTimer = setTimeout(go, WATCH_PAUSE_MS);
  }
  watch(writing, (has) => {
    if (has) clearGoOn();
  });
  onBeforeUnmount(clearGoOn);

  return { goingOn, writing, stepIn, watchOn };
}
