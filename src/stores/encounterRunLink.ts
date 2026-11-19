import { ref } from "vue";
import type { FightCommand } from "@/rules/fight/fightCommands";
import type { FightDeps } from "@/rules/fight/fightEvents";
import type { FightEffect, FightState } from "@/rules/fight/fightState";
import {
  confirmAnswer, dropPending, observeRow, queueCommand, replay, sealHead, startSync, unseenEffects, waitsForServer,
  type ConfirmedFight, type FightFrame, type FightSync, type ObservedRow, type PendingBatch,
} from "@/lib/encounters/fightSync";

/** A copy that shares nothing with its source: what the server confirmed is never edited through the screen's own arrays, and a read arrives wrapped in the live row's reactive proxies. */
function plain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** What the run store lends the link: the fight as it is shown, and the ways to change what is shown. */
export interface FightLinkHost {
  snapshot(): FightState;
  frame(): FightFrame;
  deps(): FightDeps;
  /** Shows a fight state. */
  show(before: FightState, state: FightState): void;
  /** Tells the DM what the rules raised (`turnStart`: a turn change raised it, so it replaces the last turn's lines). */
  raise(effects: FightEffect[], turnStart: boolean): void;
  /** A turn changed: moves made in the last one can no longer be taken back. */
  turnChanged(commands: readonly FightCommand[]): void;
}

/**
 * The run store's side of the server's fight (#1201 stage 2c): the confirmed fight and the pending batches
 * (`lib/encounters/fightSync`), and what showing them takes. The transport composable (`useFightCommands`)
 * calls `nextBatch`, `answered` and `observed` through the store; the store calls `queue` for every command.
 * Until a fight is attached (`attach`) there is nothing to keep honest: `queue` answers null and the store
 * just applies the command to what it shows, as a component test does.
 */
export function createFightLink(host: FightLinkHost) {
  let sync: FightSync | null = null;
  /** Rung when a batch is waiting to be sent; the store's pump registers it. */
  let wake: (() => void) | null = null;
  /** True while a command waits for the server's answer because the browser could not know its result (dice, ids). */
  const busy = ref(false);
  /** The encounter the attached fight belongs to: every batch waiting here is for it, whatever the screen shows by the time it is sent. */
  let fightId: string | null = null;
  /** How many batches wait for the server, sent-but-unanswered included. Reactive, so the runner can say so. */
  const unsentBatches = ref(0);
  /** How many sends in a row have failed (offline, a 5xx). Zero while sending works. */
  const sendFailures = ref(0);

  /** Shows what the server has confirmed with the commands still pending laid over it. */
  function reconcile() {
    if (!sync) return;
    const view = replay(sync, host.frame(), host.deps());
    // A copy, so nothing that edits the roster in place through the screen reaches what the server confirmed.
    host.show(host.snapshot(), { ...view, combatants: plain(view.combatants) });
    busy.value = waitsForServer(sync);
    unsentBatches.value = sync.pending.length;
  }

  return {
    busy,
    unsentBatches,
    sendFailures,
    /** The encounter the attached fight belongs to, null when none is attached. */
    encounterId: () => fightId,
    /** The transport reports each try so the screen can say changes are not saved without flickering on an ordinary request. */
    sendFailed() {
      sendFailures.value += 1;
    },
    sendSucceeded() {
      sendFailures.value = 0;
    },
    setWaker(waker: (() => void) | null) {
      wake = waker;
    },
    /** Keeps what the server holds beside what is pending from now on, and shows it. */
    attach(confirmed: ConfirmedFight, encounterId: string) {
      fightId = encounterId;
      sendFailures.value = 0;
      sync = startSync({ ...confirmed, combatants: plain(confirmed.combatants) });
      busy.value = false;
      reconcile();
    },
    detach() {
      sync = null;
      fightId = null;
      busy.value = false;
      unsentBatches.value = 0;
      sendFailures.value = 0;
    },
    /**
     * Queues a command for the server and answers what to show now: the state and the effects the browser's own
     * rules raised, or `state: null` for a command that waits for the server. Null when no fight is attached.
     */
    queue(command: FightCommand, before: FightState): { state: FightState | null; effects: FightEffect[] } | null {
      if (!sync) return null;
      const queued = queueCommand(sync, before, command, host.deps(), () => crypto.randomUUID());
      sync = queued.sync;
      busy.value = queued.waitsForServer;
      unsentBatches.value = sync.pending.length;
      wake?.();
      return { state: queued.shown, effects: queued.effects };
    },
    /** The next batch to send, sealed so nothing joins it; null when none waits. The same batch comes back until it is answered. */
    nextBatch(): PendingBatch | null {
      if (!sync) return null;
      const head = sealHead(sync);
      if (!head) return null;
      sync = head.sync;
      return head.batch;
    },
    /** True while a batch is waiting for the network, in flight included. */
    hasQueued: () => sync !== null && sync.pending.length > 0,
    /** The server answered `batchId` (null: a command sent alone, such as a party sync or a lifecycle command). */
    answered(batchId: string | null, answer: ConfirmedFight, effects: FightEffect[]) {
      if (!sync) return;
      const result = confirmAnswer(sync, batchId, { ...answer, combatants: plain(answer.combatants) });
      sync = result.sync;
      reconcile();
      const commands = result.batch?.commands ?? [];
      host.turnChanged(commands);
      host.raise(unseenEffects(result.batch, effects), commands.some((c) => c.type === "next_turn" || c.type === "reshuffle_initiative"));
    },
    /** A read of the row after a ring: a newer one becomes the confirmed fight, an older or equal one changes nothing. */
    observed(row: ObservedRow) {
      if (!sync) return;
      const next = observeRow(sync, { ...row, combatants: plain(row.combatants), appliedIds: [...row.appliedIds] });
      if (next === sync) return;
      sync = next;
      reconcile();
    },
    /** The fight cannot be commanded any more (ended, gone, not ours): what was made after the last confirmed state is not coming back. */
    dropPending() {
      if (!sync) return;
      sync = dropPending(sync);
      reconcile();
    },
  };
}
