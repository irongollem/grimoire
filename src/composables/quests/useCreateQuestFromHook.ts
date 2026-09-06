import { useCampaignStore } from "@/stores/campaign";
import { useCreateQuest, useCreateObjective, useCreateQuestRef } from "@/composables/quests/useQuests";
import { useCreateQuestBeat, useCreateQuestBeatEdge, useCreateQuestConsequence } from "@/composables/quests/useQuestFlow";
import { resolveGeneratedEntities, type ResolvedEntity } from "@/ai/resolveGeneratedEntities";
import { writeQuestSpine } from "@/lib/quests/spineWrite";
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
 * proposed, the routes between them, the objectives split `pending`/`dormant`
 * by which beat (if any) raises each one, and a `quest_consequences` "raise"
 * row per beat/objective pair the spine named — all via
 * `writeQuestSpine` (src/lib/quests/spineWrite.ts), shared with the document
 * importer (#829), the spine's second producer; and finally the resolved
 * npc/location quest_refs.
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

    // #822: the model's own beats/routes/objectives become the quest's story
    // spine, resolved from the model's local `key`s to real ids as each beat
    // lands. No fallback beat when there is nothing usable here: see this
    // composable's doc comment.
    const { beatIdByKey } = await writeQuestSpine(
      {
        questId: quest.id,
        campaignId: campaign.activeCampaignId!,
        beats: hook.beats,
        routes: hook.routes,
        objectives: hook.objectives,
      },
      { createBeat, createBeatEdge, createObjective, createConsequence },
    );

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
