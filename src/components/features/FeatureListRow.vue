<template>
  <RouterLink
    :to="to"
    class="flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors"
  >
    <div class="flex-1 min-w-0">
      <div class="flex items-center gap-2 flex-wrap">
        <p class="text-heading-xs font-semibold text-foreground truncate">{{ feature.name }}</p>
        <slot name="badges" />
        <AppButton v-if="isOfficial" as="span" variant="tinted" tone="primary" emphasis="soft" size="xs" label="Official" />
        <span v-if="bookTitle" class="text-caption text-muted-foreground">{{ bookTitle }}</span>
      </div>
      <p v-if="feature.prerequisite" class="text-caption text-muted-foreground italic truncate mt-0.5">
        {{ feature.prerequisite }}
      </p>
      <div v-if="feature.tags.length" class="flex flex-wrap gap-1 mt-1">
        <AppButton
          v-for="tag in feature.tags.slice(0, 4)"
          :key="tag"
          as="span"
          variant="tinted"
          tone="neutral"
          emphasis="soft"
          size="xs"
          :label="tag"
        />
      </div>
    </div>
    <IconChevronRight class="h-4 w-4 text-muted-foreground shrink-0" />
  </RouterLink>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { RouterLink } from "vue-router";
import AppButton from "@/components/common/AppButton.vue";
import { IconChevronRight } from "@/lib/icons";
import { useSourceTitles } from "@/composables/library/useSourceTitles";
import type { ClassFeature } from "@/types/feature.types";

/** One row of the Abilities or Feats list: name, badges from the parent, the book it comes from. */
const { feature, to } = defineProps<{ feature: ClassFeature; to: string }>();
const { titleFor } = useSourceTitles();
const isOfficial = computed(() => feature.user_id === null);
const bookTitle = computed(() => titleFor(feature.source));
</script>
