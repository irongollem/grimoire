/**
 * `runImportSweep`'s (`importSweep.ts`) two array-shaped resolvers — encounter
 * combatants and a quest beat's cross-entity references — split out purely to
 * keep `importSweep.ts` under its soft line cap. Both run in the sweep's
 * single linking phase, after every kind has imported and the sweep-wide name
 * registry is complete; see `importSweep.ts`'s own file header for why that
 * ordering is the whole point of #893.
 *
 * Neither function is exported for reuse elsewhere — this file exists to be
 * imported by `importSweep.ts` alone, not as a second entry point.
 */
import { normalizeEntityName } from "./entityName";
import { resolveEncounterCombatants } from "./normalize";
import type { ImportEntityKind, ExtractedQuestBeat } from "@/types/documentImport.types";
import type { CombatantDef } from "@/types/encounter.types";
import type { QuestBeatAttachmentType, QuestRefType } from "@/types/quest.types";
import { plainRows, type ImportSweepDeps, type SourcedRow } from "./importSweep";

export interface QuestBeatContext {
  questId: string;
  campaignId: string;
  questDisplayName: string;
  beatIdByKey: Map<string, string>;
  beats: ExtractedQuestBeat[];
}

export interface EncounterCombatantContext {
  id: string;
  name: string;
  combatants: CombatantDef[];
}

function findByNameSourced(rows: readonly SourcedRow[], name: string): SourcedRow | undefined {
  const needle = normalizeEntityName(name);
  if (needle === null) return undefined;
  return rows.find((row) => normalizeEntityName(row.name) === needle);
}

// ── Encounter combatants (moved here from the old per-kind pass — #893) ─────

export async function resolveEncounters(
  contexts: readonly EncounterCombatantContext[],
  lookups: Partial<Record<ImportEntityKind, SourcedRow[]>>,
  deps: Pick<ImportSweepDeps, "resolveMonsterNames" | "updateEncounterCombatants">,
  unresolvedLinks: string[],
  addSweepRef: (refType: QuestRefType, refId: string) => void,
): Promise<void> {
  if (contexts.length === 0) return;
  const npcLookup = plainRows(lookups.npcs);
  const monsterLookup = lookups.monsters ?? [];

  for (const context of contexts) {
    const names = [...new Set(context.combatants.map((c) => c.custom_name).filter((n): n is string => n !== null))];
    if (names.length === 0) continue;

    // The sweep's own monster registry (created/linked this run, campaign OR
    // library) first — a combatant naming a monster this same sweep already
    // resolved should use *that* row, not a fresh RPC lookup that might rank
    // a different candidate. Only names it doesn't cover go to the RPC.
    const monsterMatches = new Map<string, { targetId: string }>();
    const needRpc: string[] = [];
    for (const name of names) {
      const match = findByNameSourced(monsterLookup, name);
      if (match) monsterMatches.set(name, { targetId: match.id });
      else needRpc.push(name);
    }
    if (needRpc.length > 0) {
      for (const [name, match] of await deps.resolveMonsterNames(needRpc)) monsterMatches.set(name, match);
    }

    const resolved = resolveEncounterCombatants(context.combatants, npcLookup, monsterMatches);
    for (const combatant of resolved) {
      if (combatant.npc_id) {
        addSweepRef("npc", combatant.npc_id);
      } else if (combatant.monster_id) {
        // `quest_refs.ref_id` is unvalidated text, so a library monster's
        // stable text id is just as good a ref here as a campaign uuid.
        addSweepRef("monster", combatant.monster_id);
      } else if (combatant.custom_name) {
        unresolvedLinks.push(`Encounter "${context.name}" → combatant "${combatant.custom_name}"`);
      }
    }

    try {
      await deps.updateEncounterCombatants(context.id, resolved);
    } catch {
      // Best-effort: the encounter already landed and is already counted.
    }
  }
}

// ── Beat cross-references ────────────────────────────────────────────────────

export async function resolveBeatCrossReferences(
  contexts: readonly QuestBeatContext[],
  lookups: Partial<Record<ImportEntityKind, SourcedRow[]>>,
  deps: Pick<ImportSweepDeps, "updateBeatLocation" | "insertBeatAttachment" | "insertLootPlacement">,
  unresolvedLinks: string[],
  addSweepRef: (refType: QuestRefType, refId: string) => void,
): Promise<void> {
  for (const context of contexts) {
    for (const beat of context.beats) {
      const beatId = context.beatIdByKey.get(beat.key);
      if (!beatId) continue; // the beat itself failed to create — best-effort skip, like every other write in this pass

      if (beat.location_name) {
        const match = findByNameSourced(lookups.locations ?? [], beat.location_name);
        if (match) {
          addSweepRef("location", match.id);
          try {
            await deps.updateBeatLocation(beatId, match.id);
          } catch {
            // Best-effort.
          }
        } else {
          unresolvedLinks.push(`Beat "${beat.title}" → location "${beat.location_name}"`);
        }
      }

      let sortOrder = 0;
      const attach = async (attachmentType: QuestBeatAttachmentType, refId: string) => {
        try {
          await deps.insertBeatAttachment({
            beat_id: beatId,
            quest_id: context.questId,
            campaign_id: context.campaignId,
            attachment_type: attachmentType,
            ref_id: refId,
            sort_order: sortOrder++,
          });
        } catch {
          // Best-effort.
        }
      };

      for (const name of beat.npc_names ?? []) {
        const match = findByNameSourced(lookups.npcs ?? [], name);
        if (!match) { unresolvedLinks.push(`Beat "${beat.title}" → npc "${name}"`); continue; }
        addSweepRef("npc", match.id);
        await attach("npc", match.id);
      }
      for (const name of beat.faction_names ?? []) {
        const match = findByNameSourced(lookups.factions ?? [], name);
        if (!match) { unresolvedLinks.push(`Beat "${beat.title}" → faction "${name}"`); continue; }
        addSweepRef("faction", match.id);
        await attach("faction", match.id);
      }
      for (const name of beat.encounter_names ?? []) {
        const match = findByNameSourced(lookups.encounters ?? [], name);
        if (!match) { unresolvedLinks.push(`Beat "${beat.title}" → encounter "${name}"`); continue; }
        addSweepRef("encounter", match.id);
        await attach("encounter", match.id);
      }
      for (const name of beat.monster_names ?? []) {
        const match = findByNameSourced(lookups.monsters ?? [], name);
        if (!match) { unresolvedLinks.push(`Beat "${beat.title}" → monster "${name}"`); continue; }
        addSweepRef("monster", match.id);
        if (match.source === "campaign") {
          await attach("monster", match.id);
        } else {
          unresolvedLinks.push(
            `Beat "${beat.title}" → monster "${name}" is a shared-library creature; linked to the quest, but a beat attachment can't target a library row.`,
          );
        }
      }
      for (const name of beat.item_names ?? []) {
        const match = findByNameSourced(lookups.items ?? [], name);
        if (!match) { unresolvedLinks.push(`Beat "${beat.title}" → item "${name}"`); continue; }
        addSweepRef("item", match.id);
        if (match.source === "campaign") {
          try {
            await deps.insertLootPlacement({
              beat_id: beatId,
              quest_id: context.questId,
              campaign_id: context.campaignId,
              kind: "item",
              item_id: match.id,
              quantity: 1,
              label: name,
            });
          } catch {
            // Best-effort.
          }
        } else {
          unresolvedLinks.push(
            `Beat "${beat.title}" → item "${name}" is a shared-library item; linked to the quest, but a loot placement can't target a library row.`,
          );
        }
      }
    }
  }
}
