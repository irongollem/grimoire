import { onUnmounted, watch, type Ref } from "vue";
import { onCampaignReconcile, onCampaignRing } from "@/lib/campaignLiveSync/rings";
import { useEncounterRunStore } from "@/stores/encounterRun";
import { failedWritesNotice } from "@/stores/encounterRunPump";
import { useCampaignStore } from "@/stores/campaign";
import { useToast } from "@/composables/useToast";
import { liveRevision, liveState, refreshLiveState } from "@/composables/encounters/useEncounterLive";
import type { ResolvedAction, TurnTaken } from "@/rules/fight/fightState";
import type { ReactionAnswer, ReactionOffer } from "@/rules/fight/reactionOffer";
import {
  FightRequestError,
  confirmedFromAnswer,
  isRetryable,
  observedFromRow,
  sendAlone,
  type FightAnswer,
  type FightLifecycleCommand,
} from "@/lib/encounters/fightWire";

/** What the server did when asked to play a creature's turn: the turn, and what each of its rolls came to. */
export interface TurnRun {
  /** Null when the reply carried no turn: a batch the server had already applied is answered with the fight as it is. */
  turn: TurnTaken | null;
  outcomes: ResolvedAction[];
  /** Player characters who may strike a creature the server moved as it left their reach; the browser offers each the attack. */
  provokedPlayer: Array<{ moverId: string; playerId: string }>;
  /** The turn is paused: the played character may react (Shield, Counterspell). Nothing else came with it; answer with `answerReaction`. */
  reactionOffered: ReactionOffer | null;
  /** The id of that offer, sent back with the answer so the server can tell which offer was answered; null exactly when there is no offer. */
  reactionOfferId: string | null;
}

/** What the server did for a player's walk: who struck the mover on its way out, at which step of the path, and what each blow came to. */
export interface ProvokeRun {
  strikes: Array<{ attackerId: string; step: number }>;
  outcomes: ResolvedAction[];
}

/**
 * The DM's side of a fight the server holds (#1201 stage 2c): feeds the server's answers and the doorbell's rings
 * back to the store, and sends the commands that go alone. Sending the store's batches is not done here: the
 * store's own pump (`stores/encounterRunPump`) sends them, so changes still unsent when the runner is left keep
 * being retried, and the "leave this site?" prompt stays up, with no runner mounted.
 * The store shows every command at once and keeps what the server last confirmed beside what is pending
 * (`lib/encounters/fightSync`); this composable owns what is specific to a runner on screen.
 *
 * - A refusal that will not change (the fight ended, a 403, a 404, a malformed request) drops what was pending,
 *   re-reads the fight and tells the DM (the pump says it; this re-reads the fight and leaves the runner).
 * - A ring on the fight's row arrives as a followed read (`liveRevision`) and goes to the store, which takes
 *   it only when its version is newer. A ring on the party's rows asks the server to ingest them
 *   (`sync_party`), because the server reads the characters' own rows and writes them; the browser never does.
 *   The sync goes between batches, never beside one.
 * - Lifecycle commands (go live, go private, end, abandon) wait for the queue to empty, then go alone.
 */
export function useFightCommands(encounterId: Ref<string>, options: { onLost: () => void }) {
  const store = useEncounterRunStore();
  const campaign = useCampaignStore();
  const toast = useToast();

  /** The fight this runner was opened for. A batch belongs to the fight it was queued in, never to whatever the route says later. */
  const fightId = encounterId.value;
  let wantSync = false;

  /** True once the store holds a different fight: its answers and batches are not this runner's. */
  function isForeign(): boolean {
    const linked = store.linkedEncounterId();
    return linked !== null && linked !== fightId;
  }

  // What the pump tells every listener when the server will not take a fight's commands: this runner re-reads its
  // own fight and leaves it, and does nothing for a fight the store no longer holds.
  const offLost = store.onFightLost((event) => {
    if (event.fightId !== fightId || !event.current) return;
    refreshLiveState(fightId);
    if (event.reason === "ended" || event.reason === "gone") options.onLost();
  });

  /** Set once this runner has ended or abandoned the fight: nothing more is asked of the server about it. */
  let closed = false;

  async function syncOnce() {
    if (closed || isForeign()) return;
    try {
      const { answer } = await sendAlone(fightId, { type: "sync_party" }, 2);
      // The request took time: another fight may hold the store now, and its state is not what this answer describes.
      if (isForeign()) return;
      store.answered(null, confirmedFromAnswer(answer), answer.effects);
    } catch (error) {
      // No answer at all (offline, a function error): the next ring or reconnect asks again, so this is not worth a toast.
      if (isRetryable(error)) return;
      store.fightRefused(error, fightId);
    }
  }

  store.setIdleWork({
    pending: () => wantSync && !closed,
    run: async () => {
      wantSync = false;
      await syncOnce();
    },
  });

  /** Resolves true once nothing is waiting to be sent, false when that did not happen in time (offline). */
  function drain(): Promise<boolean> {
    return store.drainSends();
  }

  /**
   * Sends a lifecycle command alone, after the commands made before it, and shows the fight it answers with.
   * Throws when it cannot be sent (the caller tells the DM): a refusal, or no connection.
   */
  async function lifecycle(command: FightLifecycleCommand): Promise<FightAnswer> {
    if (!(await drain())) throw new FightRequestError("Your last changes have not reached the server yet. Check your connection and try again.", null);
    const { answer } = await sendAlone(fightId, command);
    // Ending a fight writes the characters' rows, which ring this runner. It must not answer those rings with a
    // sync of a fight that is over: that came back refused, told the DM their changes were lost, and sent them to
    // the encounter page instead of back to the site.
    if (command.type === "end_combat" || command.type === "abandon") closed = true;
    // The wait may have outlasted this fight in the store: show its answer only while the store still holds it.
    if (!isForeign()) {
      store.answered(null, confirmedFromAnswer(answer), answer.effects);
      const notice = failedWritesNotice(answer);
      if (notice !== null) toast.error(notice);
      refreshLiveState(fightId);
    }
    return answer;
  }

  function foldTurn(answer: FightAnswer): TurnRun {
    let turn: TurnTaken | null = null;
    const outcomes: ResolvedAction[] = [];
    const provokedPlayer: TurnRun["provokedPlayer"] = [];
    let reactionOffered: ReactionOffer | null = null;
    let reactionOfferId: string | null = null;
    for (const effect of answer.effects) {
      if (effect.type === "turn_taken") turn = effect.turn;
      else if (effect.type === "resolved") outcomes.push(effect.resolved);
      else if (effect.type === "provoked_player") provokedPlayer.push({ moverId: effect.moverId, playerId: effect.playerId });
      else if (effect.type === "reaction_offered") {
        reactionOffered = effect.offer;
        reactionOfferId = effect.offerId;
      }
    }
    return { turn, outcomes, provokedPlayer, reactionOffered, reactionOfferId };
  }

  /**
   * Asks the server to play one creature's turn and shows the fight it answers with, the token moved. It never ends
   * the turn. Throws when it cannot be done: a refusal (the server's sentence is the message) or no connection.
   */
  async function takeTurn(instanceId: string, playedMemberId?: string): Promise<TurnRun> {
    // `playedMemberId`: the party member the person plays. Without it the server reports every player who may strike a
    // departing foe; with it, every other party member strikes by the rules (#1021).
    return foldTurn(await lifecycle(playedMemberId === undefined ? { type: "take_turn", instanceId } : { type: "take_turn", instanceId, playedMemberId }));
  }

  /**
   * Answers the Reaction a paused turn offered (`offerId` is the offer's own id): the server replays the turn with the answer, and
   * refuses an answer to an offer it has moved past. The reply is the turn (or its next offer: a second chance in the same
   * turn). Throws like `takeTurn`.
   */
  async function answerReaction(answer: ReactionAnswer, offerId: string): Promise<TurnRun> {
    return foldTurn(await lifecycle({ type: "answer_reaction", answer, offerId }));
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
    store.kickSends();
  }

  /** The followed read of the row: the store takes it when it is newer than what the server last confirmed. */
  function takeRow() {
    const row = liveState.value;
    if (row?.encounter_id !== fightId) return;
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
    stopRings?.();
    offLost();
    // Whatever is still unsent stays with the store's pump, which keeps sending it and keeps the page-leave prompt up.
    store.setIdleWork(null);
  });

  /**
   * Lets go of this runner's fight in the store once it is over (ended, abandoned, lost). Only while the store still
   * holds it: a lifecycle command can wait for the queue for a while, and the page may have opened another fight
   * meanwhile, whose state this must not wipe.
   */
  function releaseFight() {
    if (store.linkedEncounterId() === fightId) store.reset();
  }

  return { lifecycle, takeTurn, answerReaction, provoke, requestPartySync, releaseFight };
}
