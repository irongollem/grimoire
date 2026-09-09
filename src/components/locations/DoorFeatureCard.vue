<template>
  <div v-if="feature" class="flex flex-col gap-1.5 rounded-md border border-border bg-background px-3 py-2">
    <div class="flex items-center gap-2">
      <RouterLink
        :to="`/dungeon-features/${feature.id}`"
        class="min-w-0 flex-1 truncate font-cinzel text-label-lg font-bold text-foreground transition-colors hover:text-primary"
      >{{ feature.name }}</RouterLink>
    </div>
    <p class="text-caption text-muted-foreground">
      Feature · {{ feature.feature_type }}{{ feature.trigger_type ? ` · trigger: ${feature.trigger_type}` : "" }}
    </p>
    <p v-if="dcLine" class="text-caption text-muted-foreground">{{ dcLine }}</p>
    <p v-if="feature.trigger_description" class="text-caption text-muted-foreground">Opens by — {{ feature.trigger_description }}</p>
    <div v-if="$slots.actions" class="flex flex-wrap justify-end gap-2 pt-0.5">
      <slot name="actions" />
    </div>
  </div>
  <p v-else-if="isLoading" class="text-caption italic text-muted-foreground">Loading feature…</p>
</template>

<script setup lang="ts">
/**
 * The frame-11 governing-feature card: whatever a door's `dungeon_feature_id`
 * points at, read from where it was authored rather than retyped into
 * `lock_note` (#868). Small and reused verbatim by S11's run surface, which is
 * why the only thing it owns beyond display is an `#actions` slot — "Reveal to
 * party" is S11's action on S11's play state, not this story's to add.
 *
 * "Change feature" is likewise not here: swapping which feature governs a door
 * is a site-editing action that belongs to whichever panel mounts this card
 * (`SiteWaysOutPanel`), not to the read-only card itself.
 */
import { computed } from "vue";
import { RouterLink } from "vue-router";
import { useDungeonFeature } from "@/composables/dungeon-features/useDungeonFeatures";

const { featureId } = defineProps<{ featureId: string }>();

const { data: feature, isLoading } = useDungeonFeature(computed(() => featureId));

// Never `?? 0`: an absent DC is a DC nobody set, not a DC of zero — so it is
// dropped from the line entirely rather than printed as "DC 0".
const dcLine = computed(() => {
  if (!feature.value) return "";
  const parts: string[] = [];
  if (feature.value.perception_dc !== null) parts.push(`Perception DC ${feature.value.perception_dc}`);
  if (feature.value.investigation_dc !== null) parts.push(`Investigation DC ${feature.value.investigation_dc}`);
  if (feature.value.arcana_dc !== null) parts.push(`Arcana DC ${feature.value.arcana_dc}`);
  return parts.join(" · ");
});
</script>
