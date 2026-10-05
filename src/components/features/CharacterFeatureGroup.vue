<template>
  <section class="rounded-lg border border-border bg-card overflow-hidden">
    <header class="px-4 py-2.5 border-b border-border">
      <h3 class="text-label-lg font-semibold text-muted-foreground">
        {{ title }}
        <span v-if="subtitle" class="font-fell font-normal ml-1 text-muted-foreground/70">({{ subtitle }})</span>
      </h3>
    </header>
    <div v-if="features.length === 0" class="px-4 py-3">
      <p class="text-body text-muted-foreground italic">{{ emptyText }}</p>
    </div>
    <div v-else class="divide-y divide-border">
      <CharacterFeatureCard
        v-for="(g, i) in features"
        :key="`${g.grant.kind}-${g.feature.id}-${g.grant.kind === 'feat' ? `${g.grant.via}-${g.grant.atLevel}-${i}` : ''}`"
        :granted="g"
        :pools="pools"
        :remaining="remaining"
        :picks="picksOf(g)"
        :variant="variantOf(g)"
        :readonly="readonly"
        @spend="(key: string, amount: number) => emit('spend', key, amount)"
        @restore="(key: string, amount: number) => emit('restore', key, amount)"
        @navigate-spells="emit('navigate-spells')"
      />
    </div>
  </section>
</template>

<script setup lang="ts">
import CharacterFeatureCard from "@/components/features/CharacterFeatureCard.vue";
import { picksFor, type FeaturePick } from "@/components/features/featurePicks";
import type { GrantedFeature, ResourcePool } from "@/rules/features/characterFeatures";
import type { Remaining } from "@/rules/features/uses";

/** A titled list of feature cards: one class (with its subclass) or the feats. */
const { title, subtitle = null, features, pools, remaining, classChoices, nameOfId, readonly = false, emptyText = "Nothing here yet." } = defineProps<{
  title: string;
  subtitle?: string | null;
  features: GrantedFeature[];
  pools: readonly ResourcePool[];
  remaining: (key: string) => Remaining;
  classChoices: Record<string, unknown>;
  nameOfId: (id: string) => string | null;
  readonly?: boolean;
  emptyText?: string;
}>();

const emit = defineEmits<{
  spend: [key: string, amount: number];
  restore: [key: string, amount: number];
  "navigate-spells": [];
}>();

function picksOf(g: GrantedFeature): FeaturePick[] {
  return picksFor(g.mechanics, classChoices, nameOfId);
}

/** The background's choice baked into its origin feat ("Wizard" for Magic Initiate). */
function variantOf(g: GrantedFeature): string | null {
  if (g.grant.kind !== "feat" || g.grant.via !== "origin") return null;
  const variant = classChoices.origin_feat_variant;
  return typeof variant === "string" && variant.trim() !== "" ? variant : null;
}
</script>
