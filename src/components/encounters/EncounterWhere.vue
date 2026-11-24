<template>
  <div data-testid="encounter-where">
    <label class="block text-caption text-muted-foreground mb-1">Where</label>
    <EntityCombobox
      :model-value="placeId ?? ''"
      :options="locationOptions"
      placeholder="Nowhere in particular"
      @update:model-value="(id: string) => emit('update:placeId', id || null)"
    >
      <template #option="{ opt }">
        <span :style="{ paddingLeft: `${(opt as PlaceOption).depth * 0.75}rem` }">{{ opt.name }}</span>
      </template>
    </EntityCombobox>
    <p v-if="ownTable" class="mt-1 text-caption text-muted-foreground" data-testid="encounter-where-table">
      Uses {{ ownTable }} here
    </p>
    <p v-else-if="habitat" class="mt-1 text-caption text-muted-foreground" data-testid="encounter-where-life">
      {{ habitat.name }}: {{ summary }}
    </p>
  </div>
</template>

<script setup lang="ts">
/**
 * The encounter generator's "Where" (#1255 item 31): the place the encounter happens in, which is the party's place
 * until the DM picks another. When the place (or one it lies inside) has an encounter table of its own, one quiet line
 * says "Uses <table> here" and nothing is rolled from a habitat; otherwise, when it lies in a habitat with creatures,
 * the line says what lives there and the panel rolls from it (`encounterSourceForPlace`: the table wins). It owns the reads so a closed panel fetches nothing; the panel is told the habitat.
 */
import { computed, watch } from "vue";
import EntityCombobox from "@/components/common/controls/EntityCombobox.vue";
import { useCampaignHabitats } from "@/composables/canon/useCampaignHabitats";
import { usePlacedTables } from "@/composables/canon/usePlacedTables";
import { useLocationTree } from "@/composables/locations/useLocations";
import { encounterSourceForPlace, type EncounterHabitat } from "@/lib/canon/habitats";
import { sharesLine } from "@edge-shared/worldBlock.ts";

type PlaceOption = { id: string; name: string; depth: number };

const { placeId } = defineProps<{ placeId: string | null }>();
const emit = defineEmits<{
  "update:placeId": [id: string | null];
  /** The habitat the chosen place lies in, with what lives there; null when there is none to roll from. */
  habitat: [habitat: EncounterHabitat | null];
}>();

const { locationOptions } = useLocationTree();
const { habitats, places, life } = useCampaignHabitats();

const parentOf = computed(() => new Map(locationOptions.value.map((l) => [l.id, l.parent_id])));

const placedTables = usePlacedTables();
const source = computed(() => (placeId === null ? null : encounterSourceForPlace(placeId, (id) => parentOf.value.get(id) ?? null, placedTables.value, places.value)));

const ownTable = computed(() => (source.value?.from === "table" ? source.value.tables.map((t) => t.name).join(", ") : null));

const habitat = computed<EncounterHabitat | null>(() => {
  const chosen = source.value;
  if (chosen === null || chosen.from !== "habitat") return null;
  const found = habitats.value.find((h) => h.id === chosen.match.habitatId);
  if (found === undefined) return null;
  const living = life.value.filter((l) => l.habitatId === found.id);
  if (!living.some((l) => l.percent > 0)) return null;
  return { name: found.name, life: living };
});

const summary = computed(() => (habitat.value === null ? "" : sharesLine(habitat.value.life, "anything else")));

watch(habitat, (h) => emit("habitat", h), { immediate: true });
</script>
