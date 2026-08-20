<template>
  <div v-if="backgroundAsiBonuses.length" class="rounded-lg border border-primary/30 bg-primary/5 overflow-hidden">
    <div class="px-4 py-2.5 border-b border-primary/20 bg-primary/10 flex items-center gap-2">
      <p class="text-label-lg font-semibold text-primary">Background Ability Increase</p>
      <span class="text-eyebrow text-primary/60">2024 PHB</span>
    </div>
    <div class="px-4 py-3 flex flex-wrap gap-1.5">
      <span
        v-for="entry in backgroundAsiBonuses"
        :key="entry.key"
        class="inline-flex items-center rounded-md bg-primary/10 border border-primary/20 px-2 py-0.5 font-cinzel text-xs text-primary"
      >{{ entry.label }} +{{ entry.delta }}</span>
    </div>
  </div>

  <BackgroundOriginFeatBadge v-if="backgroundOriginFeat" :origin-feat="backgroundOriginFeat" />
  <div v-else-if="backgroundFeat" class="rounded-lg border border-amber-500/30 bg-amber-500/5 overflow-hidden">
    <div class="px-4 py-2.5 border-b border-amber-500/20 bg-amber-500/10 flex items-center gap-2">
      <p class="text-label-lg font-semibold text-amber-600 dark:text-amber-400">Background Feat</p>
      <span class="text-eyebrow text-amber-600/60 dark:text-amber-400/60">2024 PHB</span>
    </div>
    <div class="px-4 py-3">
      <p class="font-cinzel text-sm font-bold text-foreground">{{ backgroundFeat }}</p>
    </div>
  </div>

  <div v-if="choiceEntries.length > 0" class="rounded-lg border border-border bg-card overflow-hidden">
    <div class="px-4 py-2.5 border-b border-border">
      <p class="text-label-lg font-semibold text-muted-foreground">Choices</p>
    </div>
    <div class="divide-y divide-border">
      <div
        v-for="entry in choiceEntries"
        :key="entry.key"
        class="flex gap-3 px-4 py-2.5"
      >
        <span class="text-label text-muted-foreground w-32 shrink-0 pt-0.5">
          {{ entry.label }}
        </span>
        <div class="flex flex-wrap gap-1.5">
          <span
            v-for="val in entry.values"
            :key="val"
            class="inline-flex items-center rounded-md bg-primary/10 border border-primary/20 px-2 py-0.5 text-body text-foreground"
          >{{ val }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import BackgroundOriginFeatBadge from "@/components/backgrounds/BackgroundOriginFeatBadge.vue";
import { isInternalChoiceKey } from "@/lib/classChoices";
import { useAllFeatures } from "@/composables/useFeatures";
import type { BackgroundOriginFeat } from "@/types/background.types";
import type { SaveKey } from "@/types/party.types";

const { classChoices, backgroundAsiBonuses, backgroundOriginFeat, backgroundFeat, excludeKeys = [] } = defineProps<{
  classChoices: Record<string, unknown>;
  backgroundAsiBonuses: { key: SaveKey; label: string; delta: number }[];
  backgroundOriginFeat: BackgroundOriginFeat | null;
  backgroundFeat: string | null;
  /** Keys owned by another card (e.g. spell_pick steps shown in Spell Choices) — hidden here to avoid duplication. */
  excludeKeys?: string[];
}>();

// Feat / feature_pick choices store class_features UUIDs; resolve them to names
// so the card never shows a raw id. Unknown values (subclass names, text picks)
// pass through unchanged. The map is empty until the query resolves, in which
// case the raw value is shown as a graceful fallback.
const { data: allFeatures } = useAllFeatures();
const featureNameById = computed(() => {
  const map = new Map<string, string>();
  for (const f of allFeatures.value ?? []) map.set(f.id, f.name);
  return map;
});

function displayValue(value: unknown): string {
  const raw = String(value);
  return featureNameById.value.get(raw) ?? raw;
}

// ── Class choices (read-only) ─────────────────────────────────────────────────

const CHOICE_LABELS: Record<string, string> = {
  subclass:               "Subclass",
  fighting_style:         "Fighting Style",
  pact_boon:              "Pact Boon",
  expertise:              "Expertise",
  eldritch_invocations:   "Invocations",
  metamagic_options:      "Metamagic",
  infusions_known:        "Infusions",
  favored_enemy:          "Favored Enemy",
  natural_explorer:       "Natural Explorer",
  ranger_conclave:        "Ranger Conclave",
  divine_domain:          "Divine Domain",
  druid_circle:           "Druid Circle",
  arcane_tradition:       "Arcane Tradition",
  sorcerous_origin:       "Sorcerous Origin",
  bardic_college:         "Bardic College",
  monastic_tradition:     "Monastic Tradition",
  roguish_archetype:      "Roguish Archetype",
  martial_archetype:      "Martial Archetype",
  barbarian_path:         "Primal Path",
};

const choiceEntries = computed(() => {
  const excluded = new Set(excludeKeys);
  return Object.entries(classChoices)
    .filter(([key, v]) =>
      !isInternalChoiceKey(key) && !excluded.has(key) &&
      v !== null && v !== undefined && v !== "",
    )
    .map(([key, value]) => ({
      key,
      label: CHOICE_LABELS[key] ?? key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
      values: (Array.isArray(value) ? (value as unknown[]) : [value]).map(displayValue),
    }));
});
</script>
