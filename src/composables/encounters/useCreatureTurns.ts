import { watch } from "vue";

/** Whoever's turn it is, as much of it as deciding who plays it needs. */
export interface TurnHolder {
  instance_id: string;
  party_member_id?: string | null;
  hp: number;
  type?: "player" | "monster";
  bystander?: true;
}

/** Long enough to read what a creature did before the turn moves on. */
export const SOLO_TURN_PAUSE_MS = 2500;

/**
 * Creatures' turns that play themselves. Two callers: the AI table, where every turn but the player's own does
 * (#1021), and the Dungeon Master's runner on autopilot (#1203), which stops at any player's turn.
 *
 * In a fight from the AI table every turn but the player's own plays itself (#1021): the server picks and carries
 * out the creature's turn ("Run this turn for me", #1203), what it did stays on the screen for a moment, and the
 * turn passes. A solo player has no Dungeon Master to press those two buttons for each creature.
 *
 * It stops by itself at the player's turn, and when a creature's turn could not be run (the reason is on its card,
 * and "Next turn" is still there): passing over a failure would skip a creature without saying so.
 */
export function useCreatureTurns(options: {
  /** The played character, or null when this is an ordinary fight (then nothing here runs). */
  memberId?: () => string | null;
  /**
   * For a fight nobody "plays" (the Dungeon Master's runner on autopilot, #1203): whether the loop runs at all, and
   * whose turn it stops at. With these, `memberId` is not consulted.
   */
  enabled?: () => boolean;
  stopsAt?: (now: TurnHolder) => boolean;
  started: () => boolean;
  active: () => TurnHolder | null;
  /** Something that changes whenever a new turn begins, the same creature's next one included. */
  turnKey: () => unknown;
  /** Plays the creature's turn; resolves to whether it was run. */
  run: (instanceId: string) => Promise<boolean>;
  next: () => void;
  wait?: (ms: number) => Promise<void>;
}): void {
  const wait = options.wait ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  let playing = false;

  async function play(): Promise<void> {
    if (playing) return;
    playing = true;
    try {
      // One creature after another until the turn is the player's.
      for (;;) {
        const memberId = options.memberId ? options.memberId() : null;
        const now = options.active();
        const on = options.enabled ? options.enabled() : memberId !== null;
        if (!on || !options.started() || now === null) return;
        if (options.stopsAt ? options.stopsAt(now) : now.party_member_id === memberId) return;
        // A creature that is down has no turn to take: it is passed without a pause.
        if (now.hp > 0) {
          if (!(await options.run(now.instance_id))) return;
          await wait(SOLO_TURN_PAUSE_MS);
        }
        // The fight moved on meanwhile (the player pressed Next turn, or it ended): nothing to pass.
        if (options.active()?.instance_id !== now.instance_id || !options.started()) continue;
        const before = options.turnKey();
        options.next();
        // The turn did not move (the fight is waiting on the server): leave it rather than spin.
        if (options.turnKey() === before) return;
      }
    } finally {
      playing = false;
    }
  }

  watch(
    () => [options.memberId ? options.memberId() : null, options.enabled ? options.enabled() : null, options.started(), options.turnKey()] as const,
    () => void play(),
    { immediate: true },
  );
}
