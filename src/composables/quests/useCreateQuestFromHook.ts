import { useCampaignStore } from "@/stores/campaign";
import { useCreateQuest, useCreateObjective, useCreateQuestRef } from "@/composables/quests/useQuests";
import { useCreateQuestBeat, useCreateQuestBeatEdge, useCreateQuestConsequence } from "@/composables/quests/useQuestFlow";
import { toTiptapJson } from "@/ai/useNpcGeneration";
import { resolveGeneratedEntities, type ResolvedEntity } from "@/ai/resolveGeneratedEntities";
import { deriveObjectiveStatuses, planObjectiveConsequences, planSpineBeats, planSpineRoutes } from "@/lib/quests/spine";
import type { QuestHookResult } from "@/ai/types";
import type { AiProvenance } from "@/ai/provenance";

export interface QuestHookEntityPool {
  id: string;
  name: string;
}

export interface QuestHookEntityPools {
  npcs: QuestHookEntityPool[];
  locations: QuestHookEntityPool[];
  factions: QuestHookEntityPool[];
}

export interface CreateQuestFromHookInput {
  hook: QuestHookResult;
  giverNpcId: string;
  locationId: string;
  entityPools: QuestHookEntityPools;
  aiProvenance: AiProvenance | null;
}

export interface CreateQuestFromHookResult {
  questId: string;
  /** How many of the hook's `beats` actually got created. Zero means the
   *  response had no usable spine (absent, empty, or every entry dropped for
   *  a blank key/title) — the caller uses this to tell the DM the quest has
   *  no story beats yet, rather than silently creating a checklist and
   *  nothing else. */
  beatsCreated: number;
}

/**
 * The AI quest generator's write path (#822). Extracted from
 * QuestGeneratorPanel.vue, which was pushing past the 600-line soft cap
 * (CLAUDE.md) once the spine write logic below was added — the panel now
 * owns only the preview (see `planSpineBeats`/`describeSpineRoutes` calls
 * there) and calls this for the actual writes.
 *
 * Creates, in order: the quest row; the story spine — the beats the model
 * proposed and the routes between them, resolved from the model's local
 * `key`s to real ids as each beat lands (see src/lib/quests/spine.ts); the
 * objectives, split `pending`/`dormant` by which beat (if any) raises each
 * one; a `quest_consequences` "raise" row per beat/objective pair the spine
 * named, the minimum wiring that makes a generated quest a live ledger
 * instead of a checklist; and finally the resolved npc/location quest_refs.
 *
 * When the response has no usable spine, this does NOT manufacture a beat —
 * a quest with no beats yet is a legitimate state (see
 * `supabase/seed.zz_quest_beats.sql`), and reconstructing an "Opening beat"
 * to paper over the gap would be exactly the generation-one shape epic #780
 * spent nineteen stories deleting. The caller is told via `beatsCreated` so
 * it can tell the DM instead.
 *
 * Every step past the quest row itself is best-effort: a lost beat, route,
 * consequence, or ref is a smaller loss than undoing a quest that already
 * landed, matching the tolerance the ref-creation step already had before
 * #822.
 */
export function useCreateQuestFromHook() {
  const campaign = useCampaignStore();
  const { mutateAsync: createQuest } = useCreateQuest();
  const { mutateAsync: createObjective } = useCreateObjective();
  const { mutateAsync: createQuestRef } = useCreateQuestRef();
  const { mutateAsync: createBeat } = useCreateQuestBeat();
  const { mutateAsync: createBeatEdge } = useCreateQuestBeatEdge();
  const { mutateAsync: createConsequence } = useCreateQuestConsequence();

  async function createFromHook(input: CreateQuestFromHookInput): Promise<CreateQuestFromHookResult> {
    const { hook, giverNpcId, locationId, entityPools, aiProvenance } = input;

    const quest = await createQuest({
      title: hook.title,
      summary: hook.summary,
      tags: hook.tags,
      status: "active",
      giver_npc_id: giverNpcId || null,
      location_id: locationId || null,
      parent_quest_id: null,
      player_visible_to: [],
      started_at: null,
      resolved_at: null,
      ai_provenance: aiProvenance,
    });

    // #822: the model's own beats become real beats and the routes between
    // them; `beatIdByKey` maps its local `key` strings to the real ids
    // created below — a key means nothing until the beat it names has
    // actually landed. No fallback beat when there is nothing usable here:
    // see this composable's doc comment.
    const spineBeats = planSpineBeats(hook.beats);
    const beatIdByKey = new Map<string, string>();

    if (spineBeats.length > 0) {
      try {
        // Sequential, not Promise.all: canvas_x below reads left-to-right in
        // story order, and a mid-sequence failure leaves the earlier beats
        // (and their routes) behind for the DM instead of losing all of them
        // to Promise.all's fail-fast behaviour.
        for (const [i, beat] of spineBeats.entries()) {
          const created = await createBeat({
            quest_id: quest.id,
            campaign_id: campaign.activeCampaignId!,
            title: beat.title,
            dm_content: toTiptapJson(beat.dmContentPlain),
            read_aloud: null,
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

        const routes = planSpineRoutes(spineBeats, hook.routes).filter(
          (route) => beatIdByKey.has(route.from) && beatIdByKey.has(route.to),
        );
        await Promise.allSettled(
          routes.map((route) =>
            createBeatEdge({
              quest_id: quest.id,
              campaign_id: campaign.activeCampaignId!,
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
    // party hasn't been sent down that branch yet. No beats at all means
    // every objective is `pending` — there is nothing to raise it out of
    // dormant in the first place.
    const objectiveList = Array.isArray(hook.objectives) ? hook.objectives : [];
    const objectiveStatuses = deriveObjectiveStatuses(objectiveList, spineBeats);
    const createdObjectives = await Promise.all(
      objectiveList.map((objective, i) =>
        createObjective({
          quest_id: quest.id,
          description: objective.description,
          status: objectiveStatuses[i]!,
          is_player_visible: false,
          sort_order: i,
        }),
      ),
    );

    // One `quest_consequences` "raise" row per objective whose `raised_by`
    // named a beat that actually landed — the minimum wiring that makes a
    // generated quest a live ledger instead of a checklist (#822). A beat
    // that failed to create above has nothing in `beatIdByKey`, so its
    // raises are silently skipped rather than thrown.
    if (beatIdByKey.size > 0) {
      const consequencePlan = planObjectiveConsequences(objectiveList, spineBeats).filter(
        (entry) => beatIdByKey.has(entry.beatKey) && entry.objectiveIndex < createdObjectives.length,
      );
      await Promise.allSettled(
        consequencePlan.map((entry) =>
          createConsequence({
            quest_id: quest.id,
            on_beat_id: beatIdByKey.get(entry.beatKey)!,
            on_edge_id: null,
            on_objective_id: null,
            on_objective_status: null,
            on_quest_settled: false,
            after_days: 0,
            action: "raise",
            target_objective_id: createdObjectives[entry.objectiveIndex]!.id,
            action_payload: {},
          }),
        ),
      );
    }

    // Resolved npcs/locations become quest_refs so they show up in Key NPCs /
    // Key Locations on the quest detail page — but skip the giver/location,
    // which are already first-class FK columns on the quest row, and never
    // ref a faction: QuestRefType (quest.types.ts) has no "faction" member,
    // so a resolved faction stays chip-only in the generator panel.
    const refTargets = resolveGeneratedEntities(hook, entityPools).filter(
      (e): e is ResolvedEntity & { kind: "npc" | "location"; id: string } =>
        e.id !== null &&
        (e.kind === "npc" || e.kind === "location") &&
        !(e.kind === "npc" && e.id === giverNpcId) &&
        !(e.kind === "location" && e.id === locationId),
    );

    // Best-effort like the objectives above, but explicitly tolerant of
    // per-ref failure: a lost cross-reference chip is fine, an undone quest
    // creation is not.
    await Promise.allSettled(
      refTargets.map((e) =>
        createQuestRef({
          quest_id: quest.id,
          ref_type: e.kind,
          ref_id: e.id,
          is_player_visible: false,
        }),
      ),
    );

    return { questId: quest.id, beatsCreated: beatIdByKey.size };
  }

  return { createFromHook };
}
