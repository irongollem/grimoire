/*
 * Resolves ONE `entityEmbed` for a PLAYER reader (#970), through the
 * player-gated projections only. This is the player-side counterpart of
 * useEntityEmbedData, which reads the DM's tables unscoped and must never run
 * for a player (RLS blocks it, and its output carries the true name).
 *
 * Same shape as useMentionName: the entity type is read once, at setup (an
 * embed node's type never changes after insertion), and only that type's
 * composable is called, so a spell embed starts no NPC or monster query.
 * `html: null` means the reader may not see it and the caller renders nothing.
 *
 * The projections are keyed on the ACTIVE campaign, so an embed whose handout
 * belongs to another campaign than the one the player has open resolves to
 * nothing rather than to whatever happens to share an id.
 */
import { computed, ref, type ComputedRef } from "vue";
import { useCampaignStore } from "@/stores/campaign";
import { useSharedNpcs } from "@/composables/npcs/useNpcs";
import { useSharedLocations } from "@/composables/locations/useLocations";
import { usePlayerVisibleMonsters } from "@/composables/monsters/useMonsters";
import { usePlayerDiscoveries } from "@/composables/encounters/useDiscoveredMonsters";
import { usePlayerVisibleItems } from "@/composables/items/useItems";
import { usePlayerVisibleQuests } from "@/composables/quests/useQuests";
import { useLibrarySpell } from "@/composables/spells/useSpells";
import { isUuid } from "@/lib/library/contentIdentity";
import {
  playerItemHtml,
  playerLocationHtml,
  playerMonsterHtml,
  playerNpcHtml,
  playerQuestHtml,
  playerSpellHtml,
} from "@/lib/scriptorium/playerEmbedHtml";
import type { EntityEmbedType } from "@/lib/tiptap/entityEmbed";
import type { ScriptoriumTheme } from "@/types/scriptorium.types";

export interface PlayerEntityEmbed {
  html: ComputedRef<string | null>;
  isLoading: ComputedRef<boolean>;
}

type Source = { html: ComputedRef<string | null>; isLoading: ComputedRef<boolean> };

function useNpcEmbed(id: string): Source {
  const { data, isLoading } = useSharedNpcs();
  return {
    html: computed(() => {
      const npc = data.value?.find((n) => n.id === id);
      return npc ? playerNpcHtml(npc) : null;
    }),
    isLoading: computed(() => isLoading.value),
  };
}

function useLocationEmbed(id: string): Source {
  const { data, isLoading } = useSharedLocations();
  return {
    html: computed(() => {
      const location = data.value?.find((l) => l.id === id);
      return location ? playerLocationHtml(location) : null;
    }),
    isLoading: computed(() => isLoading.value),
  };
}

function useMonsterEmbed(id: string, theme: () => ScriptoriumTheme): Source {
  const { data: monsters, isLoading: monstersLoading } = usePlayerVisibleMonsters();
  const { data: discoveries, isLoading: discoveriesLoading } = usePlayerDiscoveries();
  return {
    html: computed(() => {
      // Not discovered means not there: the library list alone proves nothing.
      const discovery = discoveries.value?.find((d) => d.monster_id === id || d.library_monster_id === id);
      if (!discovery) return null;
      const monster = monsters.value?.find((m) => m.id === id);
      return monster ? playerMonsterHtml(monster, discovery.reveal_stats, theme()) : null;
    }),
    isLoading: computed(() => monstersLoading.value || discoveriesLoading.value),
  };
}

function useItemEmbed(id: string): Source {
  const { data, isLoading } = usePlayerVisibleItems();
  return {
    html: computed(() => {
      const item = data.value?.find((i) => i.id === id);
      return item ? playerItemHtml(item) : null;
    }),
    isLoading: computed(() => isLoading.value),
  };
}

function useQuestEmbed(id: string): Source {
  const { data, isLoading } = usePlayerVisibleQuests();
  return {
    html: computed(() => {
      const quest = data.value?.find((q) => q.id === id);
      return quest ? playerQuestHtml(quest) : null;
    }),
    isLoading: computed(() => isLoading.value),
  };
}

/** A shared-library spell is public rules text. A DM's own spell (a uuid) sits
 *  in a table a player cannot read, so it is simply absent. */
function useSpellEmbed(id: string): Source {
  const spellId = ref(isUuid(id) ? "" : id);
  const { data, isLoading } = useLibrarySpell(spellId);
  return {
    html: computed(() => (data.value ? playerSpellHtml(data.value) : null)),
    isLoading: computed(() => !!spellId.value && isLoading.value),
  };
}

export function usePlayerEntityEmbed(
  type: EntityEmbedType,
  id: string,
  campaignId: string,
  theme: () => ScriptoriumTheme,
): PlayerEntityEmbed {
  const campaign = useCampaignStore();
  let source: Source;
  switch (type) {
    case "npc":
      source = useNpcEmbed(id);
      break;
    case "location":
      source = useLocationEmbed(id);
      break;
    case "monster":
      source = useMonsterEmbed(id, theme);
      break;
    case "item":
      source = useItemEmbed(id);
      break;
    case "quest":
      source = useQuestEmbed(id);
      break;
    case "spell":
      source = useSpellEmbed(id);
      break;
  }
  const inCampaign = computed(() => campaign.activeCampaignId === campaignId);
  return {
    html: computed(() => (inCampaign.value ? source.html.value : null)),
    isLoading: source.isLoading,
  };
}
