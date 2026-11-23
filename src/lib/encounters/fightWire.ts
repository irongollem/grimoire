/**
 * The DM's browser talking to the `encounter-command` function (#1201): the request, what a reply
 * and a read of the fight row look like, and how a failure is told apart. No queue and no state here
 * (`fightSync` and `useFightCommands` own those); one request in, one answer or one error out.
 */
import { supabase } from "@/lib/supabase";
import type { FightCommand } from "@/rules/fight/fightCommands";
import type { FightEffect } from "@/rules/fight/fightState";
import type { ReactionAnswer } from "@/rules/fight/reactionOffer";
import type { EncounterState, RunCombatant } from "@/types/encounter.types";
import type { ConfirmedFight, ObservedRow } from "./fightSync";

/** The commands sent alone, each of which decides which other rows are touched (see the function's handler). */
export type FightLifecycleCommand =
  /** The server builds the roster (#1021 row 16); `playedMemberId` names the AI table's played character. */
  | { type: "open"; playedMemberId?: string }
  | { type: "go_live"; sessionId: string | null }
  | { type: "go_private" }
  | { type: "end_combat"; siteId?: string | null }
  | { type: "abandon" }
  /** Asks the server to play a creature's turn (#1203). Never ends the turn; the creature need not be the active one. */
  | { type: "take_turn"; instanceId: string; optionId?: string; playedMemberId?: string }
  | { type: "provoke"; moverId: string; path: Array<{ x: number; y: number }> }
  /** The person's answer to a `reaction_offered`; sent alone, it replays the paused turn with the answer (#1021). */
  | { type: "answer_reaction"; answer: ReactionAnswer };

/** Everything the function accepts in `commands`: a batch of fight commands, or one of these sent alone. */
export type WireCommand = FightCommand | FightLifecycleCommand | { type: "sync_party" };

/** The function's reply to a batch. */
export interface FightAnswer {
  /** False when this batch id had already been applied and the reply is the fight as it is. */
  applied: boolean;
  version: number;
  is_running: boolean;
  ended_at: string | null;
  state: {
    combatants_live: RunCombatant[];
    current_round: number;
    active_combatant_index: number;
    events_fired: string[];
    lair_fired_rounds: number[];
  };
  effects: FightEffect[];
  /** Writes after the save that did not land (the fight itself is saved); empty when all went through. */
  effectFailures: string[];
}

/**
 * A request that did not produce an answer. `status` is the function's HTTP status when it answered
 * (400 malformed, 403 not the DM, 404 no fight, 409 ended or kept changing), and null when no answer
 * came at all: the network, the relay or the runtime.
 */
export class FightRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number | null,
  ) {
    super(message);
    this.name = "FightRequestError";
  }
}

/** The JSON body of a refusal, which is `{ error }`; supabase-js leaves it unread on `error.context`. */
async function refusalMessage(context: Response, fallback: string): Promise<string> {
  try {
    const body: unknown = await context.json();
    if (body !== null && typeof body === "object" && "error" in body && typeof body.error === "string") return body.error;
  } catch {
    // A reply that is not JSON (the runtime's own 5xx): the status says enough.
  }
  return fallback;
}

/**
 * Sends one batch. The caller made `batchId` once and sends the same one again after a failure: the
 * server answers a batch it already applied without applying it twice.
 */
export async function postFightBatch(encounterId: string, batchId: string, commands: WireCommand[]): Promise<FightAnswer> {
  const { data, error } = await supabase.functions.invoke("encounter-command", { body: { encounterId, batchId, commands } });
  if (error) {
    const context: unknown = (error as { context?: unknown }).context;
    if (context instanceof Response) throw new FightRequestError(await refusalMessage(context, error.message), context.status);
    throw new FightRequestError(error.message, null);
  }
  return data as FightAnswer;
}

/** The fight a reply describes, in the shape the sync keeps. */
export function confirmedFromAnswer(answer: FightAnswer): ConfirmedFight {
  return {
    combatants: answer.state.combatants_live,
    round: answer.state.current_round,
    activeIndex: answer.state.active_combatant_index,
    eventsFired: answer.state.events_fired,
    lairFiredRounds: answer.state.lair_fired_rounds,
    version: answer.version,
  };
}

/**
 * The DM's own read of the row (`select *`) in the shape the sync keeps, or null for a row that does not
 * carry the columns a version check needs (the players' projection never does).
 */
export function observedFromRow(row: EncounterState): ObservedRow | null {
  if (row.version === undefined || row.applied_command_ids === undefined || row.lair_fired_rounds === undefined || row.events_fired === undefined) return null;
  return {
    combatants: row.combatants_live,
    round: row.current_round,
    activeIndex: row.active_combatant_index,
    eventsFired: row.events_fired,
    lairFiredRounds: row.lair_fired_rounds,
    version: row.version,
    appliedIds: row.applied_command_ids,
  };
}

/**
 * Whether sending the same batch again can succeed: no answer came (the network, the relay, the runtime), the
 * function failed on its side, or it lost four races in a row to other writers. A refusal (400, 403, 404) and an
 * ended fight (409) will answer the same way next time.
 */
export function isRetryable(error: unknown): boolean {
  if (!(error instanceof FightRequestError)) return false;
  if (error.status === null || error.status >= 500) return true;
  // The handler's own wording for "lost every race": the one 409 that is not "this fight has ended".
  return error.status === 409 && error.message.includes("kept changing");
}

/** How long to wait before the next try: half a second, doubling, never more than ten. Not a poll: it stops when the send succeeds or gives up. */
export function retryDelayMs(failures: number): number {
  return Math.min(500 * 2 ** Math.max(0, failures - 1), 10_000);
}

export const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** The commands whose writes after the save the server does again when the same batch is sent again. */
const CLOSING: ReadonlySet<string> = new Set(["end_combat", "abandon"]);

/**
 * Sends one command that goes alone (open, go_live, go_private, end_combat, abandon, take_turn, sync_party) with its own
 * batch id, made once and kept across the tries so a reply lost after the server applied it is answered, not
 * applied again. Gives up after `attempts` tries and throws the last error.
 */
export async function sendAlone(encounterId: string, command: WireCommand, attempts = 3): Promise<{ answer: FightAnswer; batchId: string }> {
  const batchId = crypto.randomUUID();
  for (let failures = 0; ; ) {
    try {
      const answer = await postFightBatch(encounterId, batchId, [command]);
      // Ending a fight saves it first and then writes the sheets, the party's standing and the XP; a write that failed
      // comes back listed. The same batch sent again is answered by doing those writes again (the server's replay),
      // each a value or given once, so it is the one way they still happen: a new End combat is refused for an ended
      // fight (#1021 row 27, CodeRabbit on #1227).
      if (answer.effectFailures.length > 0 && CLOSING.has(command.type) && failures + 1 < attempts) {
        failures += 1;
        await wait(retryDelayMs(failures));
        continue;
      }
      return { answer, batchId };
    } catch (error) {
      failures += 1;
      if (failures >= attempts || !isRetryable(error)) throw error;
      await wait(retryDelayMs(failures));
    }
  }
}
