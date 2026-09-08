import { toTiptapJson } from "@/lib/tiptap/markdownToTiptap";
import type { QuestObjectiveResult, QuestSpineBeatResult, QuestSpineRouteResult } from "@/ai/types";
import { deriveObjectiveStatuses, planObjectiveConsequences, planSpineBeats, planSpineRoutes } from "@/lib/quests/spine";
import type {
  QuestBeat,
  QuestBeatEdge,
  QuestBeatEdgeInsert,
  QuestBeatInsert,
  QuestConsequence,
  QuestConsequenceInsert,
  QuestObjective,
  QuestObjectiveInsert,
} from "@/types/quest.types";

/**
 * Turns a planned spine (see `src/lib/quests/spine.ts`) into the actual
 * writes: a beat per spine entry, the route edges between them, an objective
 * per entry in `objectives` split `pending`/`dormant`, and a `quest_consequences`
 * "raise" row per objective a beat names.
 *
 * Extracted from `useCreateQuestFromHook` (#822) so the document importer
 * (#829) — a second producer that turns a pasted adventure page into the same
 * beat/route/objective shape — can share this instead of copying it. Both
 * producers emit `QuestSpineBeatResult`/`QuestSpineRouteResult`/
 * `QuestObjectiveResult` (src/ai/types.ts), so this module plans against those
 * same types rather than a shape private to either caller.
 *
 * The four mutations are injected rather than imported as composables: the
 * two callers get theirs from different places (a quest already exists for
 * one, is being created alongside the spine for the other), and importing
 * `useCreateQuestBeat` etc. directly here would drag a Vue/TanStack Query
 * harness into what is otherwise a plain async function.
 */
export interface WriteQuestSpineDeps {
  createBeat: (beat: QuestBeatInsert) => Promise<QuestBeat>;
  createBeatEdge: (edge: QuestBeatEdgeInsert) => Promise<QuestBeatEdge>;
  createObjective: (objective: QuestObjectiveInsert) => Promise<QuestObjective>;
  createConsequence: (consequence: QuestConsequenceInsert) => Promise<QuestConsequence>;
}

export interface WriteQuestSpineInput {
  questId: string;
  campaignId: string;
  beats: QuestSpineBeatResult[] | undefined;
  routes: QuestSpineRouteResult[] | undefined;
  objectives: QuestObjectiveResult[] | undefined;
}

export interface WriteQuestSpineResult {
  /** The model's local beat `key`s resolved to the real ids created below —
   *  empty when the spine had nothing usable, which callers use the same way
   *  `useCreateQuestFromHook` used to (`beatIdByKey.size` as "beats created"). */
  beatIdByKey: Map<string, string>;
  /** The created objective rows, in `objectives` order, ids included — a
   *  caller that needs to reference one after the fact (a ref, a follow-up
   *  write) does not have to refetch. */
  objectives: QuestObjective[];
}

/**
 * Creates, in order: the beats the spine proposed and the routes between
 * them, resolved from the model's local `key`s to real ids as each beat
 * lands; the objectives, split `pending`/`dormant` by which beat (if any)
 * raises each one; and a `quest_consequences` "raise" row per beat/objective
 * pair the spine named.
 *
 * When there is no usable spine, this does NOT manufacture a beat — a quest
 * with no beats yet is a legitimate state (see
 * `supabase/seed.zz_quest_beats.sql`), and reconstructing an "Opening beat" to
 * paper over the gap would be exactly the generation-one shape epic #780
 * spent nineteen stories deleting. The caller is told via an empty
 * `beatIdByKey` so it can tell the DM instead.
 *
 * Every step here is best-effort: a lost beat, route, or consequence is a
 * smaller loss than undoing a quest that already landed.
 */
export async function writeQuestSpine(
  input: WriteQuestSpineInput,
  deps: WriteQuestSpineDeps,
): Promise<WriteQuestSpineResult> {
  const { questId, campaignId, beats, routes, objectives } = input;
  const { createBeat, createBeatEdge, createObjective, createConsequence } = deps;

  // #822: the model's own beats become real beats and the routes between
  // them; `beatIdByKey` maps its local `key` strings to the real ids created
  // below — a key means nothing until the beat it names has actually landed.
  // No fallback beat when there is nothing usable here — see this function's
  // doc comment.
  const spineBeats = planSpineBeats(beats);
  const beatIdByKey = new Map<string, string>();

  if (spineBeats.length > 0) {
    try {
      // Sequential, not Promise.all: canvas_x below reads left-to-right in
      // story order, and a mid-sequence failure leaves the earlier beats
      // (and their routes) behind for the DM instead of losing all of them
      // to Promise.all's fail-fast behaviour.
      for (const [i, beat] of spineBeats.entries()) {
        const created = await createBeat({
          quest_id: questId,
          campaign_id: campaignId,
          title: beat.title,
          dm_content: toTiptapJson(beat.dmContentPlain),
          read_aloud: beat.readAloudPlain ? toTiptapJson(beat.readAloudPlain) : null,
          how_it_plays: null,
          outcomes: null,
          consequences: null,
          rumor_text: null,
          reveal_text: null,
          visibility: "hidden",
          kind: beat.kind,
          presentation_hint: null,
          // 320px apart on one row, matching the spacing QuestFlowCanvas
          // already uses when the DM adds a beat from the "+" button — a
          // starting layout the DM can rearrange, not a final one.
          canvas_x: i * 320,
          canvas_y: 0,
          is_improvised: false,
          improv_reviewed_at: null,
        });
        beatIdByKey.set(beat.key, created.id);
      }

      const plannedRoutes = planSpineRoutes(spineBeats, routes).filter(
        (route) => beatIdByKey.has(route.from) && beatIdByKey.has(route.to),
      );
      await Promise.allSettled(
        plannedRoutes.map((route) =>
          createBeatEdge({
            quest_id: questId,
            campaign_id: campaignId,
            source_beat_id: beatIdByKey.get(route.from)!,
            target_beat_id: beatIdByKey.get(route.to)!,
          }),
        ),
      );
    } catch {
      // Best-effort: a partially wired spine doesn't undo the quest, which
      // already landed.
    }
  }

  // Reachability (#822): an objective the root beat raises is live from the
  // start (`pending`); one only a later beat raises is `dormant`, since the
  // party hasn't been sent down that branch yet. No beats at all means every
  // objective is `pending` — there is nothing to raise it out of dormant in
  // the first place.
  const objectiveList = Array.isArray(objectives) ? objectives : [];
  const objectiveStatuses = deriveObjectiveStatuses(objectiveList, spineBeats);
  const createdObjectives = await Promise.all(
    objectiveList.map((objective, i) =>
      createObjective({
        quest_id: questId,
        description: objective.description,
        status: objectiveStatuses[i]!,
        is_player_visible: false,
        sort_order: i,
      }),
    ),
  );

  // One `quest_consequences` "raise" row per objective whose `raised_by`
  // named a beat that actually landed — the minimum wiring that makes a
  // generated quest a live ledger instead of a checklist (#822). A beat that
  // failed to create above has nothing in `beatIdByKey`, so its raises are
  // silently skipped rather than thrown.
  if (beatIdByKey.size > 0) {
    const consequencePlan = planObjectiveConsequences(objectiveList, spineBeats).filter(
      (entry) => beatIdByKey.has(entry.beatKey) && entry.objectiveIndex < createdObjectives.length,
    );
    await Promise.allSettled(
      consequencePlan.map((entry) =>
        createConsequence({
          quest_id: questId,
          on_beat_id: beatIdByKey.get(entry.beatKey)!,
          on_edge_id: null,
          on_objective_id: null,
          on_objective_status: null,
          on_quest_settled: false,
          after_days: 0,
          action: "raise",
          target_objective_id: createdObjectives[entry.objectiveIndex]!.id,
          // A generated spine only ever raises objectives. The world actions —
          // shifting a disposition (#831), unlocking a quest (#836) — are the
          // DM's to author: both name a specific entity the model has no
          // grounds to pick, and inventing one would be a rule the DM never
          // wrote firing on a beat they did not review.
          target_npc_id: null,
          target_quest_id: null,
          action_payload: {},
        }),
      ),
    );
  }

  return { beatIdByKey, objectives: createdObjectives };
}
