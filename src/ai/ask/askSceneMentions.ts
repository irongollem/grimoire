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
 * shared but the lookups. `resolve(text)` is a read of that description: its entities come from the campaign's lists
 * and the by-id reads of what ANY remembered description names (one read serves all), and its `loading` is true only
 * while what THIS description needs has not arrived. Those reads keep what they had while a second card's new mention
 * grows the set, so the first card's quote does not flip back to "Still reading". Asking about a description new to the
 * resolver registers it, but never in the asking computed: the write is queued to a microtask, and until it lands the
 * description reads as loading.
 */
export function useAskSceneResolver() {
  const campaign = useCampaignStore();
  const texts = shallowRef<readonly string[]>([]);
  // The people and places are read only once a description has named one: the resolver lives as long as the panel.
  const { partyMembers, npcs, monsterIndex, locations, factions } = useEntityMentionItems(() => texts.value.length > 0);

  const pending = new Set<string>();
  function register(text: string): void {
    if (pending.has(text)) return;
    pending.add(text);
    if (pending.size > 1) return;
    queueMicrotask(() => {
      const next = [...texts.value, ...[...pending].filter((t) => !texts.value.includes(t))].slice(-REMEMBERED_TEXTS);
      pending.clear();
      texts.value = next;
    });
  }

  const locationIds = computed(() => texts.value.flatMap((t) => mentionedLocationIds(t, locations.value ?? [])));
  const npcIds = computed(() => texts.value.flatMap((t) => mentionedNpcIds(t, npcs.value ?? [])));
  const locationReads = useLocationDescriptions(locationIds, { keepPrevious: true });
  const npcReads = useNpcAppearances(npcIds, { keepPrevious: true });
  const monsterReads = useMentionedMonstersState(() => texts.value.join("\n"), () => monsterIndex.value, { keepPrevious: true });

  /** Waiting on a read: nothing has arrived, or it is on its way and does not yet hold every id this description needs. */
  function waitsOn(ids: readonly string[], rows: ReadonlyMap<string, unknown> | undefined, fetching: boolean, failed: boolean): boolean {
    if (ids.length === 0 || failed) return false;
    return rows === undefined || (fetching && ids.some((id) => !rows.has(id)));
  }

  function resolve(text: string): { entities: ResolvedSceneEntity[]; loading: boolean } {
    if (!text.includes("@")) return { entities: [], loading: false };
    const registered = texts.value.includes(text);
    if (!registered) register(text);
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
    if (!registered || listsMissing) return { entities, loading: true };
    const loading =
      waitsOn(mentionedLocationIds(text, locations.value ?? []), locationReads.data.value, locationReads.isFetching.value, locationReads.isError.value) ||
      waitsOn(mentionedNpcIds(text, npcs.value ?? []), npcReads.data.value, npcReads.isFetching.value, npcReads.isError.value) ||
      waitsOn(mentionedMonsterIds(text, monsterIndex.value ?? []), monsterReads.rows.value, monsterReads.fetching.value, monsterReads.failed.value);
    return { entities, loading };
  }

  return { resolve };
}
