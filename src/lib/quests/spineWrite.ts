import { toTiptapJson } from "@/lib/tiptap/markdownToTiptap";
import { writeBatchIsolatingFailures } from "@/lib/batchWrite";
import type { QuestObjectiveResult, QuestSpineBeatResult, QuestSpineRouteResult } from "@/ai/types";
import { deriveObjectiveStatuses, planObjectiveConsequences, planSpineBeats, planSpineRoutes } from "@/lib/quests/spine";
import type {
  QuestBeat,
  QuestBeatEdgeInsert,
  QuestBeatInsert,
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
 * The writes are injected rather than imported: `questSpineDeps`
 * (src/composables/quests/questSpineDeps.ts) is the one Supabase-backed set
 * both callers use, and keeping it out of this module keeps this a plain
 * async function a test can drive without a database.
 *
 * Each dep writes a whole list in one request (#951): a chapter's spine used
 * to be one request per beat, route, objective and consequence, 27 for nine
 * beats. A refused list falls back to one row at a time
 * (`writeBatchIsolatingFailures`), so a bad row still costs only itself.
 */
export interface WriteQuestSpineDeps {
  createBeats: (beats: QuestBeatInsert[]) => Promise<QuestBeat[]>;
  createBeatEdges: (edges: QuestBeatEdgeInsert[]) => Promise<void>;
  createObjectives: (objectives: QuestObjectiveInsert[]) => Promise<QuestObjective[]>;
  createConsequences: (consequences: QuestConsequenceInsert[]) => Promise<void>;
}

export interface WriteQuestSpineInput {
  questId: string;
  campaignId: string;
  beats: QuestSpineBeatResult[] | undefined;
  routes: QuestSpineRouteResult[] | undefined;
  objectives: QuestObjectiveResult[] | undefined;
  /** Where each beat is staged, by the beat's spine `key`, written with the
   *  beat itself rather than as a second update per beat. The document
   *  importer resolves these before the spine is written (its locations
   *  import first); a caller with none omits it. */
  stagedLocationIdByKey?: ReadonlyMap<string, string>;
}

export interface WriteQuestSpineResult {
  /** The model's local beat `key`s resolved to the real ids created below —
   *  empty when the spine had nothing usable, which callers use the same way
   *  `useCreateQuestFromHook` used to (`beatIdByKey.size` as "beats created"). */
  beatIdByKey: Map<string, string>;
  /** The created objective rows, in `objectives` order, ids included — a
   *  caller that needs to reference one after the fact (a ref, a follow-up
   *  write) does not have to refetch. An objective the database refused is
   *  absent rather than a hole. */
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
  const { questId, campaignId, beats, routes, objectives, stagedLocationIdByKey } = input;

  // #822: the model's own beats become real beats and the routes between
  // them; `beatIdByKey` maps its local `key` strings to the real ids created
  // below — a key means nothing until the beat it names has actually landed.
  // No fallback beat when there is nothing usable here — see this function's
  // doc comment.
  const spineBeats = planSpineBeats(beats);
  const beatIdByKey = new Map<string, string>();

  const beatRows: QuestBeatInsert[] = spineBeats.map((beat, i) => ({
    quest_id: questId,
    campaign_id: campaignId,
    title: beat.title,
    dm_content: toTiptapJson(beat.dmContentPlain),
    read_aloud: beat.readAloudPlain ? toTiptapJson(beat.readAloudPlain) : null,
    how_it_plays: null,
    // The copy lands with the beat, but the beat still lands `hidden`:
    // writing what players would see is not the same as showing it to
    // them, and that stays the DM's call per beat.
    rumor_text: beat.rumorText ? beat.rumorText : null,
    reveal_text: beat.revealText ? beat.revealText : null,
    visibility: "hidden",
    kind: beat.kind,
    converge_mode: "any",
    presentation_hint: null,
    // 320px apart on one row, matching the spacing QuestFlowCanvas
    // already uses when the DM adds a beat from the "+" button — a
    // starting layout the DM can rearrange, not a final one. Unique per
    // beat, which is also what maps a returned row back to its key.
    canvas_x: i * 320,
    canvas_y: 0,
    is_improvised: false,
    improv_reviewed_at: null,
    staged_at_location_id: stagedLocationIdByKey?.get(beat.key) ?? null,
  }));
  const keyByCanvasX = new Map(spineBeats.map((beat, i) => [i * 320, beat.key] as const));
  const recordBeats = (created: readonly QuestBeat[]) => {
    for (const row of created) {
      const key = keyByCanvasX.get(row.canvas_x);
      if (key !== undefined) beatIdByKey.set(key, row.id);
    }
  };

  const [openingRow, ...laterRows] = beatRows;
  if (openingRow) {
    // The opening beat goes in alone, before the rest. Its insert settles the
    // quest's entry beat (`private.settle_quest_entry_beat`), which breaks a
    // tie on `created_at` — and every row of one multi-row insert shares the
    // transaction's `now()`, so writing all beats together would hand the
    // entry to whichever random uuid sorts first. A refused opening beat
    // writes no spine at all, as the sequential loop this replaced did.
    //
    // The same fact means beats 2..N share one `created_at`. Their story order
    // is kept by `canvas_x` (`i * 320` above), so every beat read orders by
    // `created_at, canvas_x, id` (`fetchBeats`, `useQuestBoardSummaries`).
    const opening = await writeBatchIsolatingFailures([openingRow], deps.createBeats);
    recordBeats(opening.written);
    if (opening.refused.length === 0) {
      recordBeats((await writeBatchIsolatingFailures(laterRows, deps.createBeats)).written);
    }
  }

  const plannedRoutes = planSpineRoutes(spineBeats, routes).filter(
    (route) => beatIdByKey.has(route.from) && beatIdByKey.has(route.to),
  );
  const edgeRows: QuestBeatEdgeInsert[] = plannedRoutes.map((route) => ({
    quest_id: questId,
    campaign_id: campaignId,
    source_beat_id: beatIdByKey.get(route.from)!,
    target_beat_id: beatIdByKey.get(route.to)!,
    // A generated spine has no notion of parallel routes or thread
    // labels (#853) — every route it plans is a plain either/or choice.
    route_kind: "choice",
    thread_label: null,
  }));

  // Reachability (#822): an objective the root beat raises is live from the
  // start (`pending`); one only a later beat raises is `dormant`, since the
  // party hasn't been sent down that branch yet. No beats at all means every
  // objective is `pending` — there is nothing to raise it out of dormant in
  // the first place.
  const objectiveList = Array.isArray(objectives) ? objectives : [];
  const objectiveStatuses = deriveObjectiveStatuses(objectiveList, spineBeats);
  const objectiveRows: QuestObjectiveInsert[] = objectiveList.map((objective, i) => ({
    quest_id: questId,
    description: objective.description,
    status: objectiveStatuses[i]!,
    is_player_visible: false,
    sort_order: i,
    // A generated objective has no calendar deadline; the DM sets one.
    due_year: null,
    due_month: null,
    due_day: null,
  }));

  // Routes and objectives depend only on the beats, not on each other.
  const [, objectiveOutcome] = await Promise.all([
    writeBatchIsolatingFailures(edgeRows, deps.createBeatEdges),
    writeBatchIsolatingFailures(objectiveRows, deps.createObjectives),
  ]);
  // `sort_order` is the objective's index in `objectives`, set just above —
  // the key back from a returned row to the entry that asked for it.
  const createdObjectives = [...objectiveOutcome.written].sort((a, b) => a.sort_order - b.sort_order);
  const objectiveIdByIndex = new Map(createdObjectives.map((row) => [row.sort_order, row.id] as const));

  // One `quest_consequences` "raise" row per objective whose `raised_by`
  // named a beat that actually landed — the minimum wiring that makes a
  // generated quest a live ledger instead of a checklist (#822). A beat or
  // objective that failed to create above has no id, so its raises are
  // silently skipped rather than thrown.
  const consequenceRows: QuestConsequenceInsert[] = planObjectiveConsequences(objectiveList, spineBeats)
    .filter((entry) => beatIdByKey.has(entry.beatKey) && objectiveIdByIndex.has(entry.objectiveIndex))
    .map((entry) => ({
      quest_id: questId,
      on_beat_id: beatIdByKey.get(entry.beatKey)!,
      on_edge_id: null,
      on_objective_id: null,
      on_objective_status: null,
      on_quest_settled: false,
      on_location_id: null,
      on_location_fact: null,
      on_clock_id: null,
      after_days: 0,
      action: "raise",
      target_objective_id: objectiveIdByIndex.get(entry.objectiveIndex)!,
      // A generated spine only ever raises objectives. The world actions —
      // shifting a disposition (#831), unlocking a quest (#836) — are the
      // DM's to author: both name a specific entity the model has no
      // grounds to pick, and inventing one would be a rule the DM never
      // wrote firing on a beat they did not review.
      target_npc_id: null,
      target_quest_id: null,
      target_document_id: null,
      target_clock_id: null,
      target_location_id: null,
      target_faction_id: null,
      action_payload: {},
    }));
  await writeBatchIsolatingFailures(consequenceRows, deps.createConsequences);

  return { beatIdByKey, objectives: createdObjectives };
}
