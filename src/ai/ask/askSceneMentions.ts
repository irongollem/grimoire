/**
 * Ask Grimoire (#1270): the @-mentions of a description that names the campaign's own people and places (the music
 * card's), read the way the Add Sound dialog's Generate tab read them.
 *
 * Both halves of the card use it: the description box offers the entities on an @ (`mentionItems`), and the adapter
 * resolves what the typed text names into pictures and lore for the model (`entities`). Every read waits for
 * `enabled`, so the always-mounted panel costs no egress until a card that takes mentions is on screen or quoted.
 * The places' descriptions, the NPCs' looks and the monsters' lore are read by id, only for what the text names.
 */
import { computed, ref } from "vue";
import { useEntityMentionItems } from "@/composables/notes/useEntityMentionItems";
import { useLocationDescriptions } from "@/composables/locations/useLocationDescriptions";
import { useNpcAppearances } from "@/composables/npcs/useNpcFields";
import { useMentionedMonsters } from "@/composables/monsters/useMentionedMonsters";
import { mentionedLocationIds, mentionedNpcIds, parseSceneEntities } from "@/ai/sceneEntities";
import { useCampaignStore } from "@/stores/campaign";

export function useAskSceneMentions(enabled: () => boolean) {
  const campaign = useCampaignStore();
  const { mentionItems, partyMembers, npcs, monsterIndex, locations, factions } = useEntityMentionItems(enabled);

  /** The description to resolve; the adapter sets it from the proposal it is quoting. */
  const text = ref("");
  const mentionedLocations = computed(() => mentionedLocationIds(text.value, locations.value ?? []));
  const { data: locationDescriptions } = useLocationDescriptions(mentionedLocations);
  const mentionedNpcs = computed(() => mentionedNpcIds(text.value, npcs.value ?? []));
  const { data: npcAppearances } = useNpcAppearances(mentionedNpcs);
  const mentionedMonsters = useMentionedMonsters(() => text.value, () => monsterIndex.value);

  const entities = computed(() =>
    parseSceneEntities(text.value, {
      partyMembers: partyMembers.value,
      npcs: npcs.value,
      monsters: mentionedMonsters.value,
      locations: locations.value,
      locationDescriptions: locationDescriptions.value,
      npcAppearances: npcAppearances.value,
      factions: factions.value,
      groupPortraitUrl: campaign.activeCampaign?.group_portrait_url,
    }),
  );

  /** True while the lists the text's names are looked up in have not arrived, so a quote never resolves against nothing. */
  const loading = computed(() => enabled() && (partyMembers.value === undefined || npcs.value === undefined || monsterIndex.value === undefined || locations.value === undefined || factions.value === undefined));

  return { mentionItems, text, entities, loading };
}
