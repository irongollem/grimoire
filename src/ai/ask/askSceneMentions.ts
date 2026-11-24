/**
 * Ask Grimoire (#1270): the @-mentions of a description that names the campaign's own people and places (the music
 * card's), read the way the Add Sound dialog's Generate tab read them.
 *
 * Both halves of the card use it: the description box offers the entities on an @ (`mentionItems`), and the adapter
 * resolves what the typed text names into pictures and lore for the model (`entities`). Every read waits for
 * `enabled`, so the always-mounted panel costs no egress until a card that takes mentions is on screen or quoted.
 * The places' descriptions, the NPCs' looks and the monsters' lore are read by id, only for what the text names.
 */
import { computed, ref, shallowRef } from "vue";
import { useEntityMentionItems } from "@/composables/notes/useEntityMentionItems";
import { useLocationDescriptions } from "@/composables/locations/useLocationDescriptions";
import { useNpcAppearances } from "@/composables/npcs/useNpcFields";
import { useMentionedMonsters, useMentionedMonstersState } from "@/composables/monsters/useMentionedMonsters";
import { mentionedLocationIds, mentionedMonsterIds, mentionedNpcIds, parseSceneEntities, type ResolvedSceneEntity } from "@/ai/sceneEntities";
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

/** The most descriptions the resolver remembers at once: a card being typed into adds one per keystroke. */
const REMEMBERED_TEXTS = 40;

/**
 * The mentions of several descriptions at once, for adapters whose quote is asked about more than one card (two music
 * cards, two scene cards). `useAskSceneMentions` holds ONE text, so two cards rewrote each other's; here nothing is
 * shared but the lookups. `resolve(text)` is a pure read of that description: its entities come from the campaign's
 * lists and the by-id reads of what ANY remembered description names (one read serves all), and its `loading` is true
 * only while what THIS description needs has not arrived. Asking about a description new to the resolver remembers it
 * (the only write, and once per description), which makes the by-id reads fetch what it names.
 */
export function useAskSceneResolver() {
  const campaign = useCampaignStore();
  const texts = shallowRef<readonly string[]>([]);
  // The people and places are read only once a description has named one: the resolver lives as long as the panel.
  const { partyMembers, npcs, monsterIndex, locations, factions } = useEntityMentionItems(() => texts.value.length > 0);

  // A plain set answers "known?" without making the asking computed depend on what it is about to write.
  const known = new Set<string>();
  function remember(text: string): void {
    if (known.has(text)) return;
    known.add(text);
    const next = [...texts.value, text].slice(-REMEMBERED_TEXTS);
    known.clear();
    for (const t of next) known.add(t);
    texts.value = next;
  }

  const locationIds = computed(() => texts.value.flatMap((t) => mentionedLocationIds(t, locations.value ?? [])));
  const npcIds = computed(() => texts.value.flatMap((t) => mentionedNpcIds(t, npcs.value ?? [])));
  const locationReads = useLocationDescriptions(locationIds);
  const npcReads = useNpcAppearances(npcIds);
  const monsterReads = useMentionedMonstersState(() => texts.value.join("\n"), () => monsterIndex.value);

  function resolve(text: string): { entities: ResolvedSceneEntity[]; loading: boolean } {
    if (!text.includes("@")) return { entities: [], loading: false };
    remember(text);
    const entities = parseSceneEntities(text, {
      partyMembers: partyMembers.value,
      npcs: npcs.value,
      monsters: monsterReads.monsters.value,
      locations: locations.value,
      locationDescriptions: locationReads.data.value,
      npcAppearances: npcReads.data.value,
      factions: factions.value,
      groupPortraitUrl: campaign.activeCampaign?.group_portrait_url,
    });
    const listsMissing = partyMembers.value === undefined || npcs.value === undefined || monsterIndex.value === undefined || locations.value === undefined || factions.value === undefined;
    if (listsMissing) return { entities, loading: true };
    const waitsOn = (ids: readonly string[], data: unknown, failed: boolean) => ids.length > 0 && data === undefined && !failed;
    const loading =
      waitsOn(mentionedLocationIds(text, locations.value ?? []), locationReads.data.value, locationReads.isError.value) ||
      waitsOn(mentionedNpcIds(text, npcs.value ?? []), npcReads.data.value, npcReads.isError.value) ||
      (monsterReads.loading.value && mentionedMonsterIds(text, monsterIndex.value ?? []).length > 0);
    return { entities, loading };
  }

  return { resolve };
}
