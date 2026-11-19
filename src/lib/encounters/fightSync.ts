/**
 * What the DM's screen shows of a fight, kept honest against the server (#1201 stage 2c).
 *
 * The server's saved fight is the truth; the screen shows it with the DM's own unanswered commands
 * replayed on top, so a click is visible at once and a reply that differs simply replaces it. The
 * state kept here is only two things: the last fight the server CONFIRMED (with its version), and the
 * batches of commands sent or still waiting. What is shown is always `confirmed` plus those batches
 * replayed through the same engine the server runs, never a patched copy of what was shown before.
 * That is what makes two DMs work: if one deals 4 damage and the other 3 to a creature at 20, both
 * screens end at 13, whichever order the server saw them in, because each screen's answer is the
 * server's state and its still-pending commands are laid over it afresh.
 *
 * Pure: no Vue, no network, no clock. The store holds one of these and the transport composable
 * (`useFightCommands`) moves batches over the wire; both only call the functions below.
 */
import { applyFightCommand, type FightCommand } from "@/rules/fight/fightCommands";
import type { FightDeps } from "@/rules/fight/fightEvents";
import { startedFromRound, type FightEffect, type FightState } from "@/rules/fight/fightState";

/** The server accepts no more than this many commands in one batch. */
export const MAX_BATCH_COMMANDS = 50;

/** The fields of a fight the server saves; everything else of a `FightState` is the encounter's own setting. */
export type FightRowFields = Pick<FightState, "combatants" | "round" | "activeIndex" | "eventsFired" | "lairFiredRounds">;

/** The encounter's settings a fight is played under. They do not come from the saved row, so they are laid under it at replay. */
export type FightFrame = Pick<FightState, "randomizeInitiativeEachRound" | "ruleset" | "lairEnabled" | "lairOwnerInstanceId" | "events">;

export interface ConfirmedFight extends FightRowFields {
  /** The row's version when the server confirmed this. Only a higher one replaces it. */
  version: number;
}

/** A read of the whole row: besides the fight, the ids of the batches the server has applied to it. */
export interface ObservedRow extends ConfirmedFight {
  appliedIds: readonly string[];
}

export interface PendingBatch {
  id: string;
  /**
   * "optimistic" commands were shown at once and are replayed on every reconcile. A "server" batch holds a
   * command whose result the browser cannot know (it needs dice, or builds ids), so it is shown only when
   * the server answers, and the fight is busy until then.
   */
  kind: "optimistic" | "server";
  commands: FightCommand[];
  /** Handed to the network. From then on its id and commands never change, so a re-send is the same request. */
  sealed: boolean;
  /** A read of the row already holds this batch's result (its id is among the applied ones): replay skips it, the reply removes it. */
  folded: boolean;
  /** What the optimistic apply already showed the DM, so the reply does not show it a second time. */
  surfaced: FightEffect[];
}

export interface FightSync {
  confirmed: ConfirmedFight;
  pending: PendingBatch[];
}

export function startSync(confirmed: ConfirmedFight): FightSync {
  return { confirmed, pending: [] };
}

function stateOf(fields: FightRowFields, frame: FightFrame): FightState {
  return { ...frame, ...fields, started: startedFromRound(fields.round) };
}

/** True when anything in the batch waits on the server's answer: the fight is busy until it comes. */
export function waitsForServer(sync: FightSync): boolean {
  return sync.pending.some((b) => b.kind === "server");
}

export interface Queued {
  sync: FightSync;
  /** The fight to show now; null when the command waits for the server and the screen stays as it is. */
  shown: FightState | null;
  /** What the optimistic apply raised, for the DM. Empty when the command waits for the server. */
  effects: FightEffect[];
  waitsForServer: boolean;
}

/**
 * Takes one command the DM just made. `current` is the fight as shown now. Applied with dice that record
 * being asked: a command that asked, or that spawned (the ids a spawn gets are the server's to make), is
 * thrown away and queued on its own batch to wait for the server; anything else is shown and joins the
 * unsent batch, or opens a new one when that is full or already sent.
 */
export function queueCommand(sync: FightSync, current: FightState, command: FightCommand, deps: FightDeps, newId: () => string): Queued {
  let asked = false;
  const probing: FightDeps = {
    ...deps,
    rollD20: () => {
      asked = true;
      return 10;
    },
    rollD6: () => {
      asked = true;
      return 1;
    },
  };
  const result = applyFightCommand(current, command, probing);
  const spawned = result.effects.some((e) => e.type === "spawned");
  if (asked || spawned) {
    const batch: PendingBatch = { id: newId(), kind: "server", commands: [command], sealed: false, folded: false, surfaced: [] };
    return { sync: { ...sync, pending: [...sync.pending, batch] }, shown: null, effects: [], waitsForServer: true };
  }
  const last = sync.pending[sync.pending.length - 1];
  if (last && last.kind === "optimistic" && !last.sealed && last.commands.length < MAX_BATCH_COMMANDS) {
    const grown: PendingBatch = { ...last, commands: [...last.commands, command], surfaced: [...last.surfaced, ...result.effects] };
    return { sync: { ...sync, pending: [...sync.pending.slice(0, -1), grown] }, shown: result.state, effects: result.effects, waitsForServer: waitsForServer(sync) };
  }
  const batch: PendingBatch = { id: newId(), kind: "optimistic", commands: [command], sealed: false, folded: false, surfaced: result.effects };
  return { sync: { ...sync, pending: [...sync.pending, batch] }, shown: result.state, effects: result.effects, waitsForServer: waitsForServer(sync) };
}

/**
 * What to show: the confirmed fight with every optimistic batch still pending laid over it, oldest first.
 * A server batch is skipped (its result is not known), and so is one a read already folded in, which the
 * confirmed fight holds. Raised effects are dropped: they were shown when the command was made.
 */
export function replay(sync: FightSync, frame: FightFrame, deps: FightDeps): FightState {
  let state = stateOf(sync.confirmed, frame);
  for (const batch of sync.pending) {
    if (batch.kind !== "optimistic" || batch.folded) continue;
    for (const command of batch.commands) state = applyFightCommand(state, command, deps).state;
  }
  return state;
}

/** The batch to send next, sealed (a command made from now on starts another batch); null when nothing is waiting. */
export function sealHead(sync: FightSync): { sync: FightSync; batch: PendingBatch } | null {
  const head = sync.pending[0];
  if (!head) return null;
  if (head.sealed) return { sync, batch: head };
  const sealed: PendingBatch = { ...head, sealed: true };
  return { sync: { ...sync, pending: [sealed, ...sync.pending.slice(1)] }, batch: sealed };
}

/**
 * The server answered a batch (`batchId`), or a command sent alone that is not queued (`null`: a party
 * sync, a lifecycle command). Its state becomes the confirmed fight unless a read already brought a newer
 * one, and the batch leaves the list. Returns the batch so the caller can tell what was already shown.
 */
export function confirmAnswer(sync: FightSync, batchId: string | null, answer: ConfirmedFight): { sync: FightSync; batch: PendingBatch | null } {
  const batch = batchId === null ? null : (sync.pending.find((b) => b.id === batchId) ?? null);
  const pending = batch ? sync.pending.filter((b) => b !== batch) : sync.pending;
  const confirmed = answer.version >= sync.confirmed.version ? answer : sync.confirmed;
  return { sync: { confirmed, pending }, batch };
}

/**
 * The doorbell rang and the row was read again. A row no newer than the confirmed fight is ignored (the
 * same sync is returned). A newer one becomes the confirmed fight, and the batches it already holds are
 * marked folded so they are not laid over it a second time.
 */
export function observeRow(sync: FightSync, row: ObservedRow): FightSync {
  if (row.version <= sync.confirmed.version) return sync;
  const { appliedIds, ...confirmed } = row;
  return {
    confirmed,
    pending: sync.pending.map((b) => (appliedIds.includes(b.id) && !b.folded ? { ...b, folded: true } : b)),
  };
}

/** The fight is over or cannot be commanded: what the DM did after the last confirmed state is not coming back. */
export function dropPending(sync: FightSync): FightSync {
  return { confirmed: sync.confirmed, pending: [] };
}

/**
 * The effects of a reply that the DM has not already been shown: each one the batch's optimistic apply
 * raised cancels one equal effect in the reply. A server batch showed nothing, so all of its are new; a
 * party sync's all are new. What is left in an optimistic batch's reply is what the server added on its own
 * (a player's own hit points ingested before the commands).
 */
export function unseenEffects(batch: PendingBatch | null, replied: readonly FightEffect[]): FightEffect[] {
  if (!batch || batch.surfaced.length === 0) return [...replied];
  const shown = batch.surfaced.map((e) => JSON.stringify(e));
  return replied.filter((effect) => {
    const at = shown.indexOf(JSON.stringify(effect));
    if (at < 0) return true;
    shown.splice(at, 1);
    return false;
  });
}
