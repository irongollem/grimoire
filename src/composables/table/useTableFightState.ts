import { computed, ref } from "vue";
import type { SoloFightEnd } from "@/composables/table/useSoloFightHost";
import { useToast } from "@/composables/useToast";
import type { BoardLine } from "@/lib/table/solo/fight/boardLines";
import { endLine, type FightTurn } from "@/lib/table/solo/fight/fightChange";
import type { TableFight } from "@/lib/table/solo/soloTypes";

/** Where the parts of a fight are drawn on the page; kept there whether or not a fight is on. */
export const FIGHT_SLOTS = { map: "solo-fight-map", turn: "solo-fight-turn", roster: "solo-fight-roster", roll: "solo-fight-roll" } as const;

export interface TableFightDeps {
  /** True while the page is not showing a sitting that can be fought in (left, loading, or failed to open). */
  closed: () => boolean;
  characterName: () => string;
  noteBoard: (lines: readonly BoardLine[], byServer: boolean) => void;
  /** Asks the Dungeon Master to tell what came of a fight the board ended. */
  aftermath: () => Promise<unknown>;
}

/**
 * A fight is fought here, on the table screen: the map comes out above the story and the board is worked by the
 * rules (`SoloFightStage`). `fight` is the one the story has turned into, while the sitting waits on it: from the
 * stored sitting, then from the stream.
 */
export function useTableFightState(deps: TableFightDeps) {
  const toast = useToast();
  const fight = ref<TableFight | null>(null);
  // What the player's turn in a fight still holds, as the board last said; null outside a fight. Declared before the
  // turn that reads them: a sitting's opening is played while this page is still being set up.
  const fightTurn = ref<FightTurn | null>(null);
  const inFight = computed(() => fight.value !== null && !deps.closed());

  // Nobody is left to fight: the fight is closed, and the Dungeon Master is asked to tell what comes of it.
  function onFightOver(how: SoloFightEnd): void {
    fight.value = null;
    fightTurn.value = null;
    // Nobody left to fight, or the played character out of it: the board ended it, and the Dungeon Master is asked
    // to tell what comes of it.
    if (how === "foes_out" || how === "you_fell") {
      deps.noteBoard([{ kind: "margin", text: "The fight is over", tone: "end" }], true);
      void deps.aftermath();
      return;
    }
    // The Dungeon Master ended it with a ruling and has told how in the same reply: nothing more is asked.
    deps.noteBoard([{ kind: "margin", text: endLine(how, deps.characterName()), tone: "end" }], true);
  }

  // The composer in a fight (frame 15): open on your turn, one short line aloud, a deed only while the turn can pay.
  const composerFight = computed(() =>
    inFight.value && fightTurn.value ? { yours: fightTurn.value.yours, words: fightTurn.value.words, canAct: fightTurn.value.action || fightTurn.value.bonus } : null,
  );

  // The fight is gone from under the page (ended elsewhere, or refused): the story goes on without it.
  function onFightLost(): void {
    fight.value = null;
    fightTurn.value = null;
    toast.error("The fight could not be continued here.");
  }

  return { fight, fightTurn, inFight, composerFight, onFightOver, onFightLost };
}
