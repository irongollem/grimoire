/**
 * Where an encounter is set, and what that place says about what meets the party there (#1255 item 31): the place's
 * own encounter table (or the nearest one of a place it lies inside) wins and nothing is rolled from a habitat;
 * otherwise, when the place lies in a habitat with creatures, that habitat's life is what the generator is told.
 * It was the encounter panel's "Where" line; the Familiar's encounter card and its adapter read it now. `wanted` keeps
 * every read off until a card names a place, because the Familiar's adapters live as long as its panel.
 */
import { computed } from "vue";
import { useCampaignHabitats } from "@/composables/canon/useCampaignHabitats";
import { usePlacedTables } from "@/composables/canon/usePlacedTables";
import { useLocationTree } from "@/composables/locations/useLocations";
import { encounterSourceForPlace, type EncounterHabitat } from "@/lib/canon/habitats";
import { sharesLine } from "@edge-shared/worldBlock.ts";

export function useEncounterWhere(placeId: () => string | null, wanted: () => boolean = () => true) {
  const { locationOptions } = useLocationTree(wanted);
  const { habitats, places, life } = useCampaignHabitats(wanted);
  const placedTables = usePlacedTables(wanted);

  const parentOf = computed(() => new Map(locationOptions.value.map((l) => [l.id, l.parent_id])));
  const source = computed(() => {
    const id = placeId();
    return id === null ? null : encounterSourceForPlace(id, (p) => parentOf.value.get(p) ?? null, placedTables.value, places.value);
  });

  /** The place's own table(s), by name: "Uses <this> here". */
  const ownTable = computed(() => (source.value?.from === "table" ? source.value.tables.map((t) => t.name).join(", ") : null));

  /** The habitat the place lies in with what lives there; null when there is none to roll from. */
  const habitat = computed<EncounterHabitat | null>(() => {
    const chosen = source.value;
    if (chosen === null || chosen.from !== "habitat") return null;
    const found = habitats.value.find((h) => h.id === chosen.match.habitatId);
    if (found === undefined) return null;
    const living = life.value.filter((l) => l.habitatId === found.id);
    if (!living.some((l) => l.percent > 0)) return null;
    return { name: found.name, life: living };
  });

  /** The one quiet line under Where: the table in use, else what lives there; null when neither. */
  const line = computed(() => {
    if (ownTable.value !== null) return `Uses ${ownTable.value} here`;
    const h = habitat.value;
    return h === null ? null : `${h.name}: ${sharesLine(h.life, "anything else")}`;
  });

  return { ownTable, habitat, line };
}
