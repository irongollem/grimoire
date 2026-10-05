<template>
  <button
    ref="trigger"
    type="button"
    class="absolute inset-0 rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    :aria-expanded="open"
    :aria-label="`Armor Class ${breakdown.total}. Show how it is worked out.`"
    @click="open = !open"
  />
  <Teleport to="body">
    <div
      v-if="open"
      ref="floatingRef"
      :style="floatingStyle"
      role="dialog"
      aria-label="How your Armor Class is worked out"
      class="z-50 w-72 max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-card p-3 shadow-xl"
    >
      <p v-if="beastForm" class="text-body">
        In {{ beastForm }} form your Armor Class is the beast's. Your own, {{ breakdown.total }}, comes back when you change back.
      </p>
      <AcBreakdownList :breakdown="breakdown" />
      <AppButton to="/play/inventory" variant="link" size="inline" class="mt-2" label="Open inventory" @click="open = false" />
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useAnchoredPopover } from "@/composables/useAnchoredPopover";
import AppButton from "@/components/common/AppButton.vue";
import AcBreakdownList from "@/components/player/AcBreakdownList.vue";
import type { AcBreakdown } from "@/rules/armorClass";

/** Tap the Armor Class shield to see how the number is made. Sits over its parent, which must be `relative`. */
defineProps<{
  breakdown: AcBreakdown;
  /** The beast's name while wild-shaped. */
  beastForm?: string | null;
}>();

const open = ref(false);
const trigger = ref<HTMLElement | null>(null);
const { floatingRef, floatingStyle } = useAnchoredPopover(trigger, open, () => (open.value = false));
</script>
