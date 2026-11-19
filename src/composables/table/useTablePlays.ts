import type { Ref } from "vue";
import type { useTableTurn } from "@/composables/table/useTableTurn";
import type { FoeMoment } from "@/lib/table/solo/fight/foeLine";
import { pressureAfterSend } from "@/lib/table/solo/pressureLabel";
import type { PlayMode, TablePressure } from "@/lib/table/solo/soloTypes";

type Turn = Pick<ReturnType<typeof useTableTurn>, "send" | "stop" | "helper" | "foe">;

export interface TablePlaysDeps {
  turn: Turn;
  pressure: Ref<TablePressure | null>;
  characterName: () => string;
  /** The player takes the floor: whatever was about to go on by itself does not. */
  stepIn: () => void;
  /** Whether it is the player's own turn in a fight. */
  yourFightTurn: () => boolean;
  /** Spends the few words a turn in a fight allows. */
  spendWords: () => void;
}

/** What the player does at the table, each a turn of the story: saying, doing, passing, going into another room. */
export function useTablePlays(deps: TablePlaysDeps) {
  const { turn } = deps;

  // Every message goes through here: a clock that ran out goes off the page when the story moves on.
  function sendTurn(...args: Parameters<Turn["send"]>): ReturnType<Turn["send"]> {
    deps.pressure.value = pressureAfterSend(deps.pressure.value);
    return turn.send(...args);
  }

  // The place's own map walks into another room: a deed like any other, the story moves the party.
  function onGo(place: { id: string; name: string }): void {
    void sendTurn("do", `I go to ${place.name}.`);
  }

  // A line said aloud in a fight is the turn's few words: once said, they are spent.
  function onSubmit(mode: PlayMode, text: string): void {
    if (mode === "say" && deps.yourFightTurn()) deps.spendWords();
    deps.stepIn();
    void sendTurn(mode, text);
  }

  // In a fight, the turn of someone with the party whom the rules cannot play: the story tells the one thing they do.
  // While the player's own question is being answered the helper simply lets the moment pass.
  async function onHelperTurn(name: string): Promise<void> {
    await turn.helper(name);
  }

  // In a fight, a foe with a mind and a tongue whose turn earned a line: the story lets it say one. While the
  // player's own question is being answered it says nothing.
  async function onFoeLine(name: string, moment: FoeMoment): Promise<void> {
    await turn.foe(name, moment);
  }

  // Stopping an answer is stepping in: nothing goes on by itself after it.
  function onStop(): void {
    deps.stepIn();
    turn.stop();
  }

  // "Go on": the player says and does nothing, and the world moves. It goes as a deed so nobody hears it.
  function onPass(): void {
    deps.stepIn();
    void sendTurn("do", `${deps.characterName()} waits, and lets things go on.`);
  }

  return { sendTurn, onGo, onSubmit, onHelperTurn, onFoeLine, onStop, onPass };
}
