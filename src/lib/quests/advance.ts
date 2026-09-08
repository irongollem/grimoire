import type { QuestRuntimeCommandInput } from "./runtime";
import type { QuestRuntimeContext } from "@/types/quest.types";
import type { ThreadLike } from "./threads";
import { threadBadges } from "./threads";

/**
 * The business logic behind the Advance dialog (`QuestAdvanceDialog.vue`,
 * design frame `05 Advance`): "one dialog carries the whole model — the route
 * taken, the routes that also open, and which payoffs go out now." This
 * module is the pure half of that model, kept out of the component so the
 * projection can be tested without mounting anything.
 */
export interface PlanAdvanceInput {
  context: QuestRuntimeContext;
  /** The `choice` edge the DM is taking. */
  edgeId: string;
  /** `parallel` edges off the current beat to also spawn, in the same transaction. */
  spawnEdgeIds: string[];
  /** Consequence ids from the chosen route's payoff to log without firing. */
  heldIds: string[];
  /** Loot placement ids on the target beat to drop to chat now. */
  dispatchIds: string[];
}

export interface PlanAdvanceResult {
  /** The letters of every thread that will still be live or waiting once
   *  this transition and its spawns land — existing threads first, in their
   *  current order, then one per spawn. */
  threadsAfter: string[];
  /** How many of the chosen route's payoff entries will actually fire. */
  fired: number;
  /** How many of the target beat's loot entries stay held back (not dispatched). */
  held: number;
  /** What `useQuestRuntimeCommand` needs to perform exactly this plan. */
  rpcArgs: QuestRuntimeCommandInput;
}

/**
 * A spawned thread does not exist yet — it is created by the same
 * transaction this plan submits — so it carries no real id or timestamp to
 * sort by. It is given one later than every real thread so `threadBadges`'s
 * oldest-first ordering (`threads.ts`) puts it last, which is where a thread
 * that does not exist until this transition commits belongs.
 */
function projectedSpawnThread(edgeId: string, offsetMs: number): ThreadLike {
  return {
    id: `spawn:${edgeId}`,
    label: "",
    status: "live",
    created_at: new Date(Date.now() + offsetMs).toISOString(),
  };
}

/**
 * The threads a DM would see as "live" immediately after this transition:
 * every thread already live or waiting (unaffected by taking one route on
 * one of them), plus one newly-spawned thread per parallel route ticked on.
 *
 * Does not model convergence — a target beat with `converge_mode: "all"`
 * merging this thread into another once every incoming route has arrived —
 * because that depends on the state of every *other* thread heading there,
 * which this context does not carry. The dialog is a projection for the DM
 * to read before committing, not a simulation of the transaction.
 */
function threadsLiveAfter(threads: readonly ThreadLike[], spawnEdgeIds: readonly string[]): string[] {
  const existing = threads.filter((thread) => thread.status === "live" || thread.status === "waiting");
  const spawned = spawnEdgeIds.map((edgeId, index) => projectedSpawnThread(edgeId, index + 1));
  return threadBadges([...existing, ...spawned]).map((badge) => badge.letter);
}

export function planAdvance(input: PlanAdvanceInput): PlanAdvanceResult {
  const { context, edgeId, spawnEdgeIds, heldIds, dispatchIds } = input;
  const choice = context.outgoing.find((route) => route.edge_id === edgeId);
  const payoff = choice?.payoff ?? [];
  const loot = choice?.loot ?? [];

  const fired = payoff.filter((entry) => !heldIds.includes(entry.consequence_id)).length;
  const held = loot.filter((entry) => !dispatchIds.includes(entry.id)).length;
  const threadsAfter = threadsLiveAfter(context.threads, spawnEdgeIds);

  const state = context.state;
  const rpcArgs: QuestRuntimeCommandInput = {
    campaignId: state?.campaign_id ?? context.thread.campaign_id,
    questId: state?.quest_id ?? context.thread.quest_id,
    threadId: context.thread.id,
    command: "advance",
    edgeId,
    expectedVersion: state?.version ?? 0,
    spawnEdgeIds,
    holdConsequenceIds: heldIds,
    dispatchLootIds: dispatchIds,
  };

  return { threadsAfter, fired, held, rpcArgs };
}

/**
 * `transition_quest_runtime` raises `40001` (serialization_failure) when the
 * caller's `expectedVersion` no longer matches the row — another device
 * moved this thread first. Supabase-js surfaces the raised SQLSTATE on
 * `.code`, the same shape every other code-keyed check in this codebase
 * reads (`useCampaignMembers.ts:181`, `useItems.ts:396`).
 */
export function isVersionConflictError(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "40001";
}
