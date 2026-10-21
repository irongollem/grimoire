<template>
  <div>
    <div class="flex items-center justify-between mb-2">
      <label class="text-label-lg font-semibold text-muted-foreground">
        SEASONS ({{ seasons.length }})
      </label>
      <AppButton
        variant="outline"
        size="xs"
        label="+ Add season"
        :disabled="months.length === 0"
        @click="addSeason"
      />
    </div>
    <p class="text-caption text-muted-foreground italic mb-2">
      A season lasts until the next one begins, wrapping into the next year.
    </p>
    <div class="space-y-2">
      <div
        v-for="(s, i) in seasons"
        :key="i"
        class="grid grid-cols-12 gap-2 items-center rounded-md border border-border bg-muted/40 px-2 py-1.5"
      >
        <AppInput v-model="s.name" tone="card" size="body" placeholder="Season name" class="col-span-4" />
        <span class="col-span-1 text-label text-muted-foreground text-center">FROM</span>
        <AppInput
          v-model.number="s.startsOn.day"
          tone="card"
          size="body"
          type="number"
          min="1"
          align="center"
          class="col-span-2"
          aria-label="Starts on day"
        />
        <AppSelect v-model.number="s.startsOn.month" size="body" block class="col-span-4 min-w-0" aria-label="Starts in month">
          <option v-for="(mo, mi) in months" :key="mi" :value="mi + 1">{{ mi + 1 }}. {{ mo.name }}</option>
        </AppSelect>
        <AppButton
          variant="ghost"
          tone="danger"
          size="icon-xs"
          :icon="IconDelete"
          :aria-label="`Remove ${s.name || 'season ' + (i + 1)}`"
          class="col-span-1"
          @click="removeSeason(i)"
        />
        <span class="col-span-4 text-label text-muted-foreground">WEATHER LIKE</span>
        <AppSelect
          :model-value="s.kind ?? 'spring'"
          size="body"
          block
          class="col-span-8 min-w-0"
          aria-label="Weather like"
          @update:model-value="s.kind = $event as SeasonKind"
        >
          <option v-for="k in SEASON_KINDS" :key="k" :value="k">{{ SEASON_KIND_LABELS[k] }}</option>
        </AppSelect>
      </div>
      <p v-if="seasons.length === 0" class="text-caption text-muted-foreground italic">
        No seasons defined.
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { IconDelete } from "@/lib/icons";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import { SEASON_KINDS, type CalendarSeason, type SeasonKind } from "@/types/calendar.types";
import type { SettingMonthDef } from "@/settings/types";

const seasons = defineModel<CalendarSeason[]>({ required: true });
const { months } = defineProps<{ months: SettingMonthDef[] }>();

const SEASON_KIND_LABELS: Record<SeasonKind, string> = {
  spring: "Spring (mild, wet)",
  summer: "Summer (warmest)",
  autumn: "Autumn (cooling)",
  winter: "Winter (coldest)",
};

/** A new season's weather follows its name when it names one of the four, else "spring". */
function kindFromName(name: string): SeasonKind {
  const n = name.toLowerCase();
  return SEASON_KINDS.find((k) => n.includes(k)) ?? (n.includes("fall") ? "autumn" : "spring");
}

/**
 * A new season starts on the first day of the first month no season already
 * starts on, so adding two never leaves one unreachable behind the other.
 */
function addSeason() {
  const taken = new Set(seasons.value.filter((s) => s.startsOn.day === 1).map((s) => s.startsOn.month));
  const month = months.findIndex((_, i) => !taken.has(i + 1)) + 1 || 1;
  const name = `Season ${seasons.value.length + 1}`;
  seasons.value = [...seasons.value, { name, kind: kindFromName(name), startsOn: { month, day: 1 } }];
}

function removeSeason(i: number) {
  seasons.value = seasons.value.filter((_, idx) => idx !== i);
}
</script>
