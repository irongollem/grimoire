/**
 * Resolves a single `entityMention`'s display name *for the current viewer*
 * (#932 story 3). Called from `EntityMentionChip` itself — one chip, one
 * mention, one lookup — rather than built once per containing editor/viewer:
 * `RichTextViewer` alone has 57 call sites, several rendering dozens of
 * mentions (or none at all) at once, so building every entity kind's query
 * there would subscribe every instance to party/NPC/location/faction/monster
 * data whether or not the document mentions one. Branching per `entityType`
 * here means a chip only ever asks for the one source its own mention needs.
 *
 * Which side of the fence a viewer is on is decided by `isPlayerArea`
 * (`src/router/lens.ts`) — the same predicate the app's role guard uses,
 * covering the portal root `/play` itself as well as everything under it
 * (a plain `path.startsWith("/play/")` check missed the root):
 *
 *   - The player portal reads the same player-gated projections
 *     `usePlayerEntityMentionItems` already uses (`get_player_visible_npcs`
 *     et al.), so a disguised NPC's true name never resolves — a player only
 *     ever sees a name they could actually have been told. An NPC whose
 *     `name` comes back null (never shared) resolves to `null` too, the same
 *     "unknown" outcome the chip renders as "???". A monster only resolves
 *     once `discovered_monsters` says this player has met it.
 *   - The DM reads the full campaign lists (npc/location/faction/party),
 *     each already keyed by a shared TanStack query — several chips wanting
 *     the same list share one fetch, not one each — plus a plain per-id
 *     query for a monster name (`["mention-monster-name", id]`), checking
 *     both the user's `monsters` table and the shared `library_monsters`
 *     table. Never the whole library.
 */
import { computed, type ComputedRef } from "vue";
import { useQuery } from "@tanstack/vue-query";
import { useRoute } from "vue-router";
import { supabase } from "@/lib/supabase";
import { isUuid } from "@/lib/library/contentIdentity";
import { isPlayerArea } from "@/router/lens";
import { useParty } from "@/composables/party/useParty";
import { useNpcs, useSharedNpcs } from "@/composables/npcs/useNpcs";
import { useAllLocations, useSharedLocations } from "@/composables/locations/useLocations";
import { useAllFactions, usePlayerVisibleFactions } from "@/composables/factions/useFactions";
import { usePlayerMonstersByIds } from "@/composables/monsters/usePlayerMonstersByIds";
import { usePlayerDiscoveries } from "@/composables/encounters/useDiscoveredMonsters";
import { useCompanions } from "@/composables/encounters/useCompanions";
import { usePlayerVisibleQuests } from "@/composables/quests/useQuests";
import type { EntityType } from "@/lib/tiptap/nodeViewTypes";

/**
 * What a name can be asked for: every mention kind, plus the two things a player
 * writes a note on that are never mentioned in rich text. Those two are not
 * `EntityType`s because the @mention picker must not offer them.
 */
export type MentionNameType = EntityType | "companion" | "quest";

/**
 * The name type for an `entity_notes.entity_type` value, or null for one this
 * resolver does not know (which then reads as an unknown name, "???").
 */
export function mentionTypeForNote(entityType: string): MentionNameType | null {
  switch (entityType) {
    case "party_member": return "player";
    case "npc":
    case "location":
    case "faction":
    case "monster":
    case "companion":
    case "quest":
      return entityType;
    default: return null;
  }
}

function nameOf(rows: ReadonlyArray<{ id: string; name: string | null }> | undefined, id: string): string | null {
  return rows?.find((r) => r.id === id)?.name ?? null;
}

function usePartyMemberName(id: string): ComputedRef<string | null> {
  const { data } = useParty();
  return computed(() => nameOf(data.value, id));
}

function useDmNpcName(id: string): ComputedRef<string | null> {
  const { data } = useNpcs();
  return computed(() => nameOf(data.value, id));
}

function usePlayerNpcName(id: string): ComputedRef<string | null> {
  // get_player_visible_npcs already returns `name: null` for an unshared or
  // still-disguised NPC (and the cover name for a disguised, revealed one) —
  // reproduced here verbatim, not re-derived. See npcDisplay.ts's
  // getNpcPlayerFacingName for the same contract applied to chat prose.
  const { data } = useSharedNpcs();
  return computed(() => nameOf(data.value, id));
}

function useDmLocationName(id: string): ComputedRef<string | null> {
  const { data } = useAllLocations();
  return computed(() => nameOf(data.value, id));
}

function usePlayerLocationName(id: string): ComputedRef<string | null> {
  const { data } = useSharedLocations();
  return computed(() => nameOf(data.value, id));
}

function useDmFactionName(id: string): ComputedRef<string | null> {
  const { data } = useAllFactions();
  return computed(() => nameOf(data.value, id));
}

function usePlayerFactionName(id: string): ComputedRef<string | null> {
  const { data } = usePlayerVisibleFactions();
  return computed(() => nameOf(data.value, id));
}

/**
 * Which table a mentioned monster's id names. A uuid is the DM's own `monsters`
 * row; anything else is a `library_monsters` text id (`srd_owlbear`). Asking
 * `monsters` for a text id is not a miss but a `22P02 invalid input syntax for
 * type uuid` error, which would turn every library mention into "???".
 */
export function monsterNameTable(id: string): "monsters" | "library_monsters" {
  return isUuid(id) ? "monsters" : "library_monsters";
}

/** One monster, one query — checks both the user's own `monsters` table and
 *  the shared `library_monsters` table, since a mentioned id can be either. */
function useDmMonsterName(id: string): ComputedRef<string | null> {
  const query = useQuery({
    queryKey: ["mention-monster-name", id] as const,
    queryFn: async ({ queryKey: [, monsterId] }) => {
      const { data, error } = await supabase
        .from(monsterNameTable(monsterId))
        .select("name")
        .eq("id", monsterId)
        .maybeSingle();
      if (error) throw error;
      return data?.name ?? null;
    },
    enabled: () => !!id,
    staleTime: Infinity,
  });
  return computed(() => query.data.value ?? null);
}

function usePlayerMonsterName(id: string): ComputedRef<string | null> {
  const { data: discoveries } = usePlayerDiscoveries();
  const discovered = computed(() =>
    (discoveries.value ?? []).some((d) => d.monster_id === id || d.library_monster_id === id),
  );
  // Not discovered means no read at all: the id is only asked for once the player has met it.
  const { data: monsters } = usePlayerMonstersByIds(() => (discovered.value ? [id] : []));
  return computed(() => (discovered.value ? (monsters.value.get(id)?.name ?? null) : null));
}

function useCompanionName(id: string): ComputedRef<string | null> {
  const { data } = useCompanions();
  return computed(() => nameOf(data.value, id));
}

function useQuestName(id: string): ComputedRef<string | null> {
  // Only quests this player may see come back, so a hidden quest stays "???".
  const { data } = usePlayerVisibleQuests();
  return computed(() => data.value?.find((q) => q.id === id)?.title ?? null);
}

/**
 * `null` means this viewer does not know this entity's name. `entityType`
 * and `id` are read once, at the point a chip calls this — a mention node's
 * attrs don't change after insertion, so there's nothing to react to there.
 * A null `entityType` (an unmapped note type) resolves to null without reading anything.
 */
export function useMentionName(entityType: MentionNameType | null, id: string): ComputedRef<string | null> {
  const route = useRoute();
  const isPlayer = isPlayerArea(route.path);

  switch (entityType) {
    case "party":
      return computed(() => "Party");
    case "player":
      return usePartyMemberName(id);
    case "npc":
      return isPlayer ? usePlayerNpcName(id) : useDmNpcName(id);
    case "location":
      return isPlayer ? usePlayerLocationName(id) : useDmLocationName(id);
    case "faction":
      return isPlayer ? usePlayerFactionName(id) : useDmFactionName(id);
    case "monster":
      return isPlayer ? usePlayerMonsterName(id) : useDmMonsterName(id);
    case "companion":
      return useCompanionName(id);
    case "quest":
      return useQuestName(id);
    default:
      return computed(() => null);
  }
}
