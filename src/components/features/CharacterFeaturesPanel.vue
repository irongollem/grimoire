<template>
  <div class="space-y-4">
    <div
      v-if="error"
      role="alert"
      class="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-body text-destructive"
    >
      Couldn't load this character's features: {{ error.message }}
    </div>

    <template v-if="pending">
      <div
        v-for="n in 2"
        :key="n"
        class="rounded-lg border border-border bg-card overflow-hidden animate-pulse"
      >
        <div class="px-4 py-2.5 border-b border-border">
          <div class="h-3 w-32 rounded bg-muted" />
        </div>
        <div class="divide-y divide-border">
          <div v-for="i in 4" :key="i" class="px-4 py-2.5 flex items-center gap-3">
            <div class="h-2.5 w-8 rounded bg-muted shrink-0" />
            <div class="h-2.5 rounded bg-muted" :style="`width: ${50 + i * 12}%`" />
          </div>
        </div>
      </div>
    </template>
    <template v-else>
      <CharacterFeatureGroup
        v-for="group in classGroups"
        :key="group.className"
        :title="`${group.className} ${group.level}`"
        :subtitle="group.subclassName"
        :features="group.features"
        :pools="pools"
        :remaining="remaining"
        :class-choices="classChoices"
        :names="names"
        :readonly="readonly"
        @spend="(key: string, amount: number) => emit('spend', key, amount)"
        @restore="(key: string, amount: number) => emit('restore', key, amount)"
        @navigate-spells="emit('navigate-spells')"
      />
      <CharacterFeatureGroup
        v-if="feats.length > 0"
        title="Feats"
        :features="feats"
        :pools="pools"
        :remaining="remaining"
        :class-choices="classChoices"
        :names="names"
        :readonly="readonly"
        @spend="(key: string, amount: number) => emit('spend', key, amount)"
        @restore="(key: string, amount: number) => emit('restore', key, amount)"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import CharacterFeatureGroup from "@/components/features/CharacterFeatureGroup.vue";
import { pickIdsOf, spellPickIdsOf, type PickNames } from "@/components/features/featurePicks";
import { useFeaturesByIds } from "@/composables/rules/useFeatures";
import { useSpellsByIds } from "@/composables/spells/useSpellsByIds";
import type { GrantedFeature, ResourcePool } from "@/rules/features/characterFeatures";
import type { Remaining } from "@/rules/features/uses";

/**
 * Everything a character's features and feats add up to, as the Features tab
 * shows it: a card list per class, then the feats. Reads only what it is given
 * (plus the names behind id-shaped picks); the tab does the spending.
 */
const { granted, pools, remaining, classChoices, pending, error, readonly = false } = defineProps<{
  granted: GrantedFeature[];
  pools: readonly ResourcePool[];
  remaining: (key: string) => Remaining;
  classChoices: Record<string, unknown>;
  pending: boolean;
  error: Error | null;
  readonly?: boolean;
}>();

const emit = defineEmits<{
  spend: [key: string, amount: number];
  restore: [key: string, amount: number];
  "navigate-spells": [];
}>();

interface ClassGroup {
  className: string;
  subclassName: string | null;
  level: number;
  features: GrantedFeature[];
}

const classGroups = computed<ClassGroup[]>(() => {
  const groups = new Map<string, ClassGroup>();
  for (const g of granted) {
    if (g.grant.kind === "feat") continue;
    const existing = groups.get(g.grant.className);
    if (existing) {
      existing.features.push(g);
    } else {
      groups.set(g.grant.className, {
        className: g.grant.className,
        subclassName: g.grant.subclassName,
        level: g.grant.classLevel,
        features: [g],
      });
    }
  }
  return [...groups.values()];
});

const feats = computed(() => granted.filter((g) => g.grant.kind === "feat"));

// A pick can name a feature by id (a feat taken at an Ability Score Improvement);
// the granted ones are already loaded, the rest are fetched by id.
const grantedNames = computed(() => new Map(granted.map((g) => [g.feature.id, g.feature.name])));
const unknownPickIds = computed(() =>
  pickIdsOf(granted.map((g) => g.mechanics), classChoices).filter((id) => !grantedNames.value.has(id)),
);
const { data: fetchedFeatures } = useFeaturesByIds(unknownPickIds);
const fetchedNames = computed(() => new Map((fetchedFeatures.value ?? []).map((f) => [f.id, f.name])));

// A spell pick holds spell ids, which are not features: they resolve through the spells.
const { data: spellsById } = useSpellsByIds(() => spellPickIdsOf(granted.map((g) => g.mechanics), classChoices));

const names: PickNames = {
  feature: (id) => grantedNames.value.get(id) ?? fetchedNames.value.get(id) ?? null,
  spell: (id) => spellsById.value.get(id)?.name ?? null,
};
</script>
