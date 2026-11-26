<template>
  <div class="flex flex-col gap-2" data-testid="species-when">
    <label class="flex items-center gap-2 text-body">
      <span class="text-muted-foreground">It is about</span>
      <AppSelect :model-value="species.activity ?? NONE" size="sm" aria-label="When it is about" @update:model-value="(v: string) => setActivity(v)">
        <option :value="NONE">Choose…</option>
        <option v-for="a in ACTIVITIES" :key="a" :value="a">{{ ACTIVITY_LABEL[a] }}</option>
      </AppSelect>
    </label>
    <ul class="m-0 flex list-none flex-col gap-1.5 p-0">
      <li v-for="kind in SEASON_KINDS" :key="kind" class="flex flex-wrap items-center gap-x-3 gap-y-1" :data-testid="`season-${kind}`">
        <span class="w-16 text-label font-semibold capitalize">{{ kind }}</span>
        <InlineEditText :model-value="seasons[kind]?.note ?? null" placeholder="Add a note" :ariaLabel="`Note for ${kind}`" :maxlength="120" text-class="text-caption" @commit="(v) => setSeason(kind, { note: v })" />
        <AppCheckbox :model-value="seasons[kind]?.away ?? false" label="Away" label-role="caption" @update:model-value="(v: boolean) => setSeason(kind, { away: v })" />
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
/**
 * When a species is about (#1283): by day, by night and so on, and what each season does to it, a note and an Away mark
 * (gone, asleep or migrated, so it is off the roll that season). Each change saves at once.
 */
import { ref, watch } from "vue";
import AppCheckbox from "@/components/common/controls/AppCheckbox.vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import InlineEditText from "@/components/common/controls/InlineEditText.vue";
import { useSpeciesEditing } from "@/composables/canon/useCampaignSpecies";
import { ACTIVITY_LABEL } from "@/lib/canon/ecology";
import { ACTIVITIES, type Activity, type Species, type SpeciesSeason } from "@/lib/canon/ecologyTypes";
import { SEASON_KINDS, type SeasonKind } from "@/types/calendar.types";

const { species } = defineProps<{ species: Species }>();
const { updateSpecies } = useSpeciesEditing();

const NONE = "";

function setActivity(value: string) {
  const next = ACTIVITIES.find((a): a is Activity => a === value) ?? null;
  void updateSpecies(species.id, { activity: next });
}

/**
 * The seasons as this editor last wrote them. Each change builds on this, not on the prop: the prop only catches up when
 * the write's refetch lands, so two quick changes built on it would each overwrite the other's season. It takes the
 * prop again once no write is in flight (another tab's change, a reload).
 */
const seasons = ref<Partial<Record<SeasonKind, SpeciesSeason>>>({ ...species.seasons });
let writing = 0;
watch(() => species.seasons, (next) => {
  if (writing === 0) seasons.value = { ...next };
});

/** Changes one season and keeps the rest; a season with no note and not away is dropped, not stored empty. */
async function setSeason(kind: SeasonKind, change: Partial<SpeciesSeason>) {
  const current: SpeciesSeason = seasons.value[kind] ?? { away: false, note: null };
  const next: SpeciesSeason = { ...current, ...change };
  const all: Partial<Record<SeasonKind, SpeciesSeason>> = { ...seasons.value };
  if (next.away || next.note !== null) all[kind] = next;
  else delete all[kind];
  seasons.value = all;
  writing += 1;
  try {
    await updateSpecies(species.id, { seasons: all });
  } finally {
    writing -= 1;
  }
}
</script>
