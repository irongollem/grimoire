import { onUnmounted, watch, type Ref } from "vue";
import { onCampaignReconcile, onCampaignRing } from "@/lib/campaignLiveSync/rings";
import { useEncounterRunStore } from "@/stores/encounterRun";
import { useCampaignStore } from "@/stores/campaign";
import { useToast } from "@/composables/useToast";
import { liveRevision, liveState, refreshLiveState } from "@/composables/encounters/useEncounterLive";
import type { ResolvedAction, TurnTaken } from "@/rules/fight/fightState";
import {
  FightRequestError,
  confirmedFromAnswer,
  isRetryable,
  observedFromRow,
  postFightBatch,
  retryDelayMs,
  sendAlone,
  wait,
  type FightAnswer,
  type FightLifecycleCommand,
} from "@/lib/encounters/fightWire";

/** How long a lifecycle command waits for the commands made before it to reach the server before it gives up. */
const DRAIN_TIMEOUT_MS = 15_000;

/** What the server did when asked to play a creature's turn: the turn, and what each of its rolls came to. */
export interface TurnRun {
  /** Null when the reply carried no turn: a batch the server had already applied is answered with the fight as it is. */
  turn: TurnTaken | null;
  outcomes: ResolvedAction[];
  /** Player characters who may strike a creature the server moved as it left their reach; the browser offers each the attack. */
  provokedPlayer: Array<{ moverId: string; playerId: string }>;
}

/** What the server did for a player's walk: who struck the mover on its way out, at which step of the path, and what each blow came to. */
export interface ProvokeRun {
  strikes: Array<{ attackerId: string; step: number }>;
  outcomes: ResolvedAction[];
}

/**
 * The DM's side of a fight the server holds (#1201 stage 2c): moves the store's batches over the wire, one
 * request at a time and in order, and feeds the server's answers and the doorbell's rings back to the store.
 * The store shows every command at once and keeps what the server last confirmed beside what is pending
 * (`lib/encounters/fightSync`); this composable only owns the network.
 *
 * - A batch is sent with the id made once when it was sealed, and sent again with that SAME id after a
 *   failure, with backoff, so a reply lost after the server applied it cannot apply it twice. While requests
 *   fail the DM keeps working and the queue flushes when the connection returns. The backoff is not a poll:
 *   it stops the moment the queue is empty.
 * - A refusal that will not change (the fight ended, a 403, a 404, a malformed request) stops the queue, drops
 *   what was pending, re-reads the fight and tells the DM.
 * - A ring on the fight's row arrives as a followed read (`liveRevision`) and goes to the store, which takes
 *   it only when its version is newer. A ring on the party's rows asks the server to ingest them
 *   (`sync_party`), because the server reads the characters' own rows and writes them; the browser never does.
 * - Lifecycle commands (go live, go private, end, abandon) wait for the queue to empty, then go alone.
 */
export function useFightCommands(encounterId: Ref<string>, options: { onLost: () => void }) {
  const store = useEncounterRunStore();
  const campaign = useCampaignStore();
  const toast = useToast();

  let disposed = false;
  let running = false;
  let wantSync = false;
  const idleWaiters: Array<() => void> = [];

  /** Reported from a timer: a throw inside a listener does not reliably reach Sentry. */
  function report(error: unknown) {
    setTimeout(() => { throw error; });
  }

  /** What the DM is told when the server will not take their commands any more, and the way back to a fight that is gone. */
  function lost(error: unknown) {
    store.dropPendingCommands();
    refreshLiveState(encounterId.value);
    if (error instanceof FightRequestError && error.status === 409) {
      toast.error("This fight has ended, so your last changes were not saved.");
      options.onLost();
      return;
    }
    if (error instanceof FightRequestError && error.status === 404) {
      toast.error("This fight is gone, so your last changes were not saved.");
      options.onLost();
      return;
    }
    toast.error(toast.fromError(error, "The server would not take your last changes. They were not saved."));
  }

  function warnOfFailedWrites(answer: FightAnswer) {
    if (answer.effectFailures.length > 0) toast.error("A character's sheet or the chat did not take the latest change. Check it before you carry on.");
  }

  /** Set once this runner has ended or abandoned the fight: nothing more is asked of the server about it. */
  let closed = false;

  async function syncOnce() {
    if (closed) return;
    try {
      const { answer } = await sendAlone(encounterId.value, { type: "sync_party" }, 2);
      store.answered(null, confirmedFromAnswer(answer), answer.effects);
    } catch (error) {
      // No answer at all (offline, a function error): the next ring or reconnect asks again, so this is not worth a toast.
      if (isRetryable(error)) return;
      lost(error);
    }
  }

  async function pump() {
    if (running) return;
    running = true;
    let failures = 0;
    try {
      for (;;) {
        const batch = store.nextBatch();
        if (batch) {
          try {
            const answer = await postFightBatch(encounterId.value, batch.id, batch.commands);
            failures = 0;
            store.answered(batch.id, confirmedFromAnswer(answer), answer.effects);
            warnOfFailedWrites(answer);
          } catch (error) {
            if (!isRetryable(error)) {
              lost(error);
              return;
            }
            // Left for the runner coming back: the store keeps the sealed batch, and the next pump sends it again.
            if (disposed) return;
            failures += 1;
            await wait(retryDelayMs(failures));
          }
          continue;
        }
        if (wantSync) {
          wantSync = false;
          await syncOnce();
          continue;
        }
        return;
      }
    } finally {
      running = false;
      for (const resolve of idleWaiters.splice(0)) resolve();
    }
  }

  function kick() {
    queueMicrotask(() => { pump().catch(report); });
  }

  store.setWaker(kick);

  /** Resolves true once nothing is waiting to be sent, false when that did not happen in time (offline). */
  async function drain(): Promise<boolean> {
    if (!running && !store.hasQueued() && !wantSync) return true;
    const idle = new Promise<true>((resolve) => idleWaiters.push(() => resolve(true)));
    kick();
    const finished = await Promise.race([idle, wait(DRAIN_TIMEOUT_MS).then(() => false)]);
    return finished && !store.hasQueued();
  }

  /**
   * Sends a lifecycle command alone, after the commands made before it, and shows the fight it answers with.
   * Throws when it cannot be sent (the caller tells the DM): a refusal, or no connection.
   */
  async function lifecycle(command: FightLifecycleCommand): Promise<FightAnswer> {
    if (!(await drain())) throw new FightRequestError("Your last changes have not reached the server yet. Check your connection and try again.", null);
    const { answer } = await sendAlone(encounterId.value, command);
    // Ending a fight writes the characters' rows, which ring this runner. It must not answer those rings with a
    // sync of a fight that is over: that came back refused, told the DM their changes were lost, and sent them to
    // the encounter page instead of back to the site.
    if (command.type === "end_combat" || command.type === "abandon") closed = true;
    store.answered(null, confirmedFromAnswer(answer), answer.effects);
    warnOfFailedWrites(answer);
    refreshLiveState(encounterId.value);
    return answer;
  }

  /**
   * Asks the server to play one creature's turn and shows the fight it answers with, the token moved. It never ends
   * the turn. Throws when it cannot be done: a refusal (the server's sentence is the message) or no connection.
   */
  async function takeTurn(instanceId: string): Promise<TurnRun> {
    const answer = await lifecycle({ type: "take_turn", instanceId });
    let turn: TurnTaken | null = null;
    const outcomes: ResolvedAction[] = [];
    const provokedPlayer: TurnRun["provokedPlayer"] = [];
    for (const effect of answer.effects) {
      if (effect.type === "turn_taken") turn = effect.turn;
      else if (effect.type === "resolved") outcomes.push(effect.resolved);
      else if (effect.type === "provoked_player") provokedPlayer.push({ moverId: effect.moverId, playerId: effect.playerId });
    }
    return { turn, outcomes, provokedPlayer };
  }

  /**
   * Asks the server which creatures strike a mover that walks `path` (anchor cells, start and destination included) and
   * resolves their blows. It moves nothing: the caller moves the token afterwards. Throws like `takeTurn`.
   */
  async function provoke(moverId: string, path: Array<{ x: number; y: number }>): Promise<ProvokeRun> {
    const answer = await lifecycle({ type: "provoke", moverId, path });
    const strikes: ProvokeRun["strikes"] = [];
    const outcomes: ResolvedAction[] = [];
    for (const effect of answer.effects) {
      if (effect.type === "opportunity") strikes.push({ attackerId: effect.attackerId, step: effect.step });
      else if (effect.type === "resolved") outcomes.push(effect.resolved);
    }
    return { strikes, outcomes };
  }

  function requestPartySync() {
    if (closed) return;
    wantSync = true;
    kick();
  }

  /** The followed read of the row: the store takes it when it is newer than what the server last confirmed. */
  function takeRow() {
    const row = liveState.value;
    if (row?.encounter_id !== encounterId.value) return;
    const observed = observedFromRow(row);
    if (observed) store.observed(observed);
  }
  watch(liveRevision, takeRow);

  // A runner that reopens onto a fight under way, or comes back after a gap, reads the characters' sheets once.
  requestPartySync();
  takeRow();
  const campaignId = campaign.activeCampaignId;
  let stopRings: (() => void) | null = null;
  if (campaignId) {
    // Every ring is read, this tab's own included: the server's write of a character's row comes back as one.
    const offRing = onCampaignRing(["party_members"], (ring) => {
      if (ring.campaignId === campaignId) requestPartySync();
    });
    const offReconcile = onCampaignReconcile((id) => {
      if (id === campaignId) requestPartySync();
    });
    stopRings = () => { offRing(); offReconcile(); };
  }

  onUnmounted(() => {
    disposed = true;
    stopRings?.();
    store.setWaker(null);
    // The last clicks are sent rather than dropped: one pass of the queue, which gives up on a failure instead of retrying.
    kick();
  });

  return { lifecycle, takeTurn, provoke, requestPartySync };
}
