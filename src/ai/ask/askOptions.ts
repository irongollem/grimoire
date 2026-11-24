/**
 * Ask Grimoire (#1270): the option lists and record pickers the card's form draws from.
 *
 * The contract names a long or campaign-dependent list by key (`list: "species"`) and a record picker by kind
 * (`record: "faction"`); this file is where those names meet the sources the generators' own panels read, so the card
 * offers exactly what the panel did. A list is a function that returns a computed, so it is read only once a form
 * asks for it (a closed panel must cost no egress).
 */
import { computed, type ComputedRef } from "vue";
import type { AskRecordType } from "@edge-shared/agent/askContract";
import { FACTION_ALIGNMENTS, FACTION_TYPES, NPC_FACTION_ROLES } from "@/types/faction.types";
import { MONSTER_TYPES } from "@/types/monster.types";
import { ITEM_TYPES, ITEM_TYPE_LABELS } from "@/types/item.types";
import { SPELL_SCHOOLS } from "@/types/spell.types";
import { CLERIC_DOMAINS, DEITY_ALIGNMENTS } from "@/types/deity.types";
import { SKILLS } from "@/types/party.types";
import { RULE_CATEGORIES } from "@/types/rule.types";
import { LOCATION_TYPE_LABELS } from "@/types/location.types";
import { CR_LIST } from "@/types/trap.types";
import { DUNGEON_FEATURE_TRIGGERS, DUNGEON_FEATURE_TYPES } from "@/types/dungeonFeature.types";
import { useAllPantheons } from "@/composables/deities/useDeities";
import { NPC_TEMPLATES } from "@/data/npcTemplates";
import { useCampaignPeoples } from "@/composables/canon/useCampaignPeoples";
import { useCampaignSpecies } from "@/composables/rules/useSpecies";
import { useAllFactions } from "@/composables/factions/useFactions";
import { useNpcs } from "@/composables/npcs/useNpcs";
import { useParty } from "@/composables/party/useParty";
import { useChronicleSessionOptions } from "@/ai/ask/askSessionNotes";
import { useLocationTree } from "@/composables/locations/useLocations";
import { useSubclassParents } from "@/composables/rules/useGenerateCustomSubclass";
import { useItemIndex } from "@/composables/items/useItemIndex";
import { CRAFTING_DISCIPLINES } from "@/lib/crafting/disciplines";

export interface AskOption {
  value: string;
  label: string;
}

export interface AskRecordOption {
  id: string;
  name: string;
}

/** The "automatic" and "none" words of the stat block template list: the template the page picks, and no stat block. */
export const STAT_TEMPLATE_AUTO = "auto";
export const STAT_TEMPLATE_NONE = "none";

function fixed(words: readonly string[]): AskOption[] {
  return words.map((word) => ({ value: word, label: word }));
}

/** A fixed set of lowercase words, each shown with its first letter capitalised (the page's selects did it with CSS). */
function capitalised(words: readonly string[]): AskOption[] {
  return words.map((word) => ({ value: word, label: word.charAt(0).toUpperCase() + word.slice(1) }));
}

/** Every list a contract input may name by `list`. */
export const ASK_LISTS: Readonly<Record<string, () => ComputedRef<AskOption[]>>> = {
  /** The world's peoples in the DM's order, then the campaign's species not already listed (as the NPC page lists them). */
  species: () => {
    const { peoples } = useCampaignPeoples();
    const { data: campaignSpecies } = useCampaignSpecies();
    return computed(() => {
      const names = peoples.value.filter((p) => p.readable).map((p) => p.name);
      const listed = new Set(names.map((n) => n.toLowerCase()));
      for (const { name } of campaignSpecies.value) {
        if (listed.has(name.toLowerCase())) continue;
        listed.add(name.toLowerCase());
        names.push(name);
      }
      return fixed(names);
    });
  },
  alignment: () => computed(() => fixed(FACTION_ALIGNMENTS)),
  faction_type: () => computed(() => fixed(FACTION_TYPES)),
  deity_alignment: () => computed(() => fixed(DEITY_ALIGNMENTS)),
  cleric_domain: () => computed(() => fixed(CLERIC_DOMAINS)),
  monster_type: () => computed(() => capitalised(MONSTER_TYPES)),
  spell_school: () => computed(() => capitalised(SPELL_SCHOOLS)),
  item_type: () => computed(() => ITEM_TYPES.map((value) => ({ value, label: ITEM_TYPE_LABELS[value] }))),
  /** The page's skill picker sends the skill's label as the focus, so the label is the value. */
  skill: () => computed(() => fixed(SKILLS.map((skill) => skill.label))),
  rule_category: () => computed(() => fixed(RULE_CATEGORIES)),
  location_type: () => computed(() => Object.entries(LOCATION_TYPE_LABELS).map(([value, label]) => ({ value, label }))),
  /** The campaign's pantheons, by id (the deity page's picker), read only while a deity card is open. */
  pantheon: () => {
    const { data: pantheons } = useAllPantheons();
    return computed(() => (pantheons.value ?? []).map((p) => ({ value: p.id, label: p.name })));
  },
  faction_role: () => computed(() => fixed(NPC_FACTION_ROLES)),
  /** The trap page's challenge ratings, "1/8" to "30", as it lists them. */
  trap_cr: () => computed(() => fixed(CR_LIST)),
  dungeon_feature_type: () => computed(() => fixed(DUNGEON_FEATURE_TYPES)),
  dungeon_feature_trigger: () => computed(() => fixed(DUNGEON_FEATURE_TRIGGERS)),
  /** The classes a subclass can belong to, by name (the archetype page's picker: a class is known by its name, and a homebrew one of the same name wins). */
  parent_class: () => {
    const { options } = useSubclassParents(() => true);
    return computed(() => options.value.map((o) => ({ value: o.name, label: o.name })));
  },
  crafting_discipline: () => computed(() => CRAFTING_DISCIPLINES.map((d) => ({ value: d.id, label: d.label }))),
  /** The NPC page's starter stat blocks, with its "automatic on Generate" and "none". */
  npc_stat_template: () => computed(() => [
    { value: STAT_TEMPLATE_AUTO, label: "Automatic on Generate" },
    { value: STAT_TEMPLATE_NONE, label: "None" },
    ...NPC_TEMPLATES.map((t) => ({ value: t.id, label: `${t.name} (CR ${t.stat_block.challenge_rating}), ${t.category}` })),
  ]),
};

/** The record kinds a form can pick from so far; a kind a generator adds is added here with it. */
export const ASK_RECORD_PICKERS = ["npc", "party_member", "location", "faction", "note", "item"] as const satisfies readonly AskRecordType[];
export type AskRecordPickerType = (typeof ASK_RECORD_PICKERS)[number];

export function isRecordPicker(type: AskRecordType): type is AskRecordPickerType {
  return (ASK_RECORD_PICKERS as readonly AskRecordType[]).includes(type);
}

/**
 * The pickers for the record kinds `wanted()` names, read from the composables the panels use. A kind nobody wants is
 * not read, and its picker is an empty list.
 */
export function useAskRecordOptions(wanted: () => ReadonlySet<AskRecordType>): Record<AskRecordPickerType, ComputedRef<AskRecordOption[]>> {
  const { data: npcs } = useNpcs(() => wanted().has("npc"));
  const { data: party } = useParty(() => wanted().has("party_member"));
  const { data: factions } = useAllFactions(() => wanted().has("faction"));
  const { locationOptions } = useLocationTree(() => wanted().has("location"));
  // The campaign's item index: its own items and the enabled library books', as the recipe page's Output item picker lists them.
  const { data: items } = useItemIndex(() => ({ enabled: wanted().has("item") }));
  // A note here is a session's chronicle (the Scriptorium recap's subject), named by its session.
  const { options: sessionNotes } = useChronicleSessionOptions(() => wanted().has("note"));
  const named = (rows: readonly AskRecordOption[] | undefined) => (rows ?? []).map((r) => ({ id: r.id, name: r.name }));
  return {
    npc: computed(() => named(npcs.value)),
    party_member: computed(() => named(party.value)),
    faction: computed(() => named(factions.value)),
    location: computed(() => named(locationOptions.value)),
    note: computed(() => named(sessionNotes.value)),
    item: computed(() => named(items.value)),
  };
}
