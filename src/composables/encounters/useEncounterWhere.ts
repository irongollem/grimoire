/**
 * Where an encounter is set, and what that place says about what meets the party there (#1255 item 31): the place's
 * own encounter table (or the nearest one of a place it lies inside) wins and nothing is rolled from a habitat;
 * otherwise, when the place lies in a habitat with creatures, that habitat's life is what the generator is told.
 * It was the encounter panel's "Where" line; the Familiar's encounter card and its adapter read it now. `wanted` keeps
 * every read off until a card names a place, because the Familiar's adapters live as long as its panel.
 *
 * Since #1283 the habitat is the roll at this hour and in this season: the season is read from the campaign's date on
 * its calendar (none when it has no calendar or the calendar has no seasons), the hour is the card's own choice.
 */
import { computed } from "vue";
import { useCampaignHabitats } from "@/composables/canon/useCampaignHabitats";
import { useCampaignSpecies } from "@/composables/canon/useCampaignSpecies";
import { usePlacedTablesState } from "@/composables/canon/usePlacedTables";
import { useLocationTree } from "@/composables/locations/useLocations";
import { seasonOn } from "@/lib/calendar/seasons";
import type { TimeOfDay } from "@/lib/canon/ecologyTypes";
import { buildEncounterHabitat, encounterSourceForPlace, whereLine, type EncounterHabitat } from "@/lib/canon/habitats";
import { useCalendarStore } from "@/stores/calendar";
import { useCampaignStore } from "@/stores/campaign";

export function useEncounterWhere(placeId: () => string | null, wanted: () => boolean = () => true, timeOfDay: () => TimeOfDay | null = () => null) {
  const { locationOptions } = useLocationTree(wanted);
  const { habitats, places, habitatSpecies, life, ready: habitatsReady } = useCampaignHabitats(wanted);
  const { species, forms, links, statBlockNameByForm, ready: speciesReady } = useCampaignSpecies(wanted);
  const campaign = useCampaignStore();
  const calendar = useCalendarStore();
  const season = computed(() => {
    const c = campaign.activeCampaign;
    return c === null ? null : (seasonOn(calendar.adapter, c.current_year, c.current_month, c.current_day, null)?.season.kind ?? null);
  });
  const { tables: placedTables, ready: tablesReady } = usePlacedTablesState(wanted);

  const parentOf = computed(() => new Map(locationOptions.value.map((l) => [l.id, l.parent_id])));
  function sourceOf(id: string | null) {
    return id === null ? null : encounterSourceForPlace(id, (p) => parentOf.value.get(p) ?? null, placedTables.value, places.value);
  }
  const source = computed(() => sourceOf(placeId()));

  /** True once every read a place's source needs (its parents, the placed tables, the habitats) has answered. */
  const ready = computed(() => wanted() && habitatsReady.value && speciesReady.value && tablesReady.value);

  /** The place's own table(s), by name: "Uses <this> here". */
  const ownTable = computed(() => (source.value?.from === "table" ? source.value.tables.map((t) => t.name).join(", ") : null));

  /** The habitat the place lies in with what lives there, as the roll stands at this hour; null when there is none to roll from. */
  function habitatOf(chosen: ReturnType<typeof sourceOf>, hour: TimeOfDay | null): EncounterHabitat | null {
    if (chosen === null || chosen.from !== "habitat") return null;
    const found = habitats.value.find((h) => h.id === chosen.match.habitatId);
    if (found === undefined) return null;
    const built = buildEncounterHabitat({
      habitat: found,
      habitatSpecies: habitatSpecies.value.filter((h) => h.habitatId === found.id),
      life: life.value.filter((l) => l.habitatId === found.id),
      species: species.value,
      forms: forms.value,
      links: links.value,
      statBlockNameByForm: statBlockNameByForm.value,
      when: { timeOfDay: hour, season: season.value },
    });
    // Kept when nothing can be met right now (all away or resting): its notes and the "not about" constraint still matter.
    return built.entries.length > 0 || built.notes.length > 0 ? built : null;
  }
  const habitat = computed<EncounterHabitat | null>(() => habitatOf(source.value, timeOfDay()));

  /**
   * The habitat of any one place, read at the moment it is asked: for a caller that answers about several places (an
   * Ask card per proposal) and so cannot hold one `placeId`. Only trustworthy once `ready`; before that the lists are empty.
   */
  function habitatFor(id: string, hour: TimeOfDay | null = timeOfDay()): EncounterHabitat | null {
    return habitatOf(sourceOf(id), hour);
  }

  /** The one quiet line under Where: the table in use, else what lives there now and what changes it; null when neither. */
  const line = computed(() => {
    if (ownTable.value !== null) return `Uses ${ownTable.value} here`;
    const h = habitat.value;
    return h === null ? null : h.notes.length === 0 ? whereLine(h) : `${whereLine(h)}. ${h.notes.join(" ")}`;
  });

  return { ownTable, habitat, line, habitatFor, ready };
}
