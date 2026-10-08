<template>
  <div class="flex items-start gap-2 border-t border-border/50 py-2 text-caption text-muted-foreground" :class="inset === 'md' ? 'px-4' : 'px-3'">
    <p class="min-w-0 flex-1">
      Can't find it by name?
      <RouterLink to="/billing" class="text-primary hover:underline" @click="emit('navigate')">Pro searches by meaning</RouterLink>:
      “the pig tavern” finds the Gilded Sow.
    </p>
    <AppButton
      variant="ghost"
      size="icon-xs"
      :icon="IconClose"
      aria-label="Don't show this again"
      title="Don't show this again"
      @click="emit('dismiss')"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * The last row of a search that found little by name, for a free DM (#599):
 * says search by meaning exists, with the one example that shows what it does.
 * Shared by the ⌘K dropdown (`GlobalSearch`), the phone search overlay
 * (`AppTopBar`) and the dashboard's Jump to… card, which decide nothing here — `useGlobalSearch().showProUpsell` decides when it
 * shows, and `dismissProUpsell` remembers "don't show again" in this browser.
 */
import { RouterLink } from "vue-router";
import AppButton from "@/components/common/AppButton.vue";
import { IconClose } from "@/lib/icons";

const { inset = "sm" } = defineProps<{
  /** Horizontal padding matching the surface's own rows: the dropdown and the
   *  card use 0.75rem, the full-screen phone overlay 1rem. */
  inset?: "sm" | "md";
}>();

const emit = defineEmits<{ dismiss: []; navigate: [] }>();
</script>
