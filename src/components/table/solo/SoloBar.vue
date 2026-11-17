<template>
  <header class="flex min-h-13 shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-border bg-card px-3 py-1.5 md:px-4">
    <AppButton variant="ghost" size="md" :icon="IconChevronLeft" label="Leave the table" :loading="leaving" collapse-label-on-mobile @click="emit('leave')" />
    <div class="flex min-w-0 flex-col md:flex-row md:items-center md:gap-3">
      <span class="truncate text-heading-sm font-bold text-foreground">{{ campaign }}</span>
      <span class="truncate text-caption text-muted-foreground md:rounded-sm md:bg-muted md:px-2 md:py-0.5 md:text-label-lg md:text-foreground">Playing {{ character }}</span>
    </div>
    <span class="flex-1" />
    <!-- The composer's foot carries this link from tablet up; on a phone the bar does. -->
    <AppButton to="/table/story" variant="ghost" size="md" :icon="IconScrollText" label="The story so far" collapse-label-on-mobile class="md:hidden" />
    <AppButton variant="ghost" size="inline" aria-label="About the Dungeon Master being an AI" @click="emit('disclosure')">
      <SoloAiMark />
    </AppButton>
    <div ref="meterHost" class="relative">
      <AppButton variant="subtle" size="md" :icon="IconCoins" aria-label="What this sitting has cost" :aria-expanded="costOpen" @click="costOpen = !costOpen">
        <span class="font-stat text-label-lg font-semibold">{{ meter }}</span>
      </AppButton>
      <SoloCostPanel v-if="costOpen" :turns="turns" :credits="credits" :balance="balance" @credits="emit('credits')" />
    </div>
  </header>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { onClickOutside } from "@vueuse/core";
import AppButton from "@/components/common/controls/AppButton.vue";
import { IconChevronLeft, IconCoins, IconScrollText } from "@/lib/icons";
import SoloAiMark from "./SoloAiMark.vue";
import SoloCostPanel from "./SoloCostPanel.vue";

const { credits, balance, leaving = false } = defineProps<{
  campaign: string;
  character: string;
  /** Credits billed in this sitting, whole. */
  credits: number;
  /** Turns the player has taken in this sitting. */
  turns: number;
  /** The account's balance; null while it is not known. */
  balance: number | null;
  /** The leave call is running. */
  leaving?: boolean;
}>();
const emit = defineEmits<{ disclosure: []; credits: []; leave: [] }>();

const costOpen = ref(false);
const meterHost = ref<HTMLElement | null>(null);
onClickOutside(meterHost, () => {
  costOpen.value = false;
});

const meter = computed(() => `${credits} ${credits === 1 ? "credit" : "credits"} this sitting${balance === null ? "" : ` · ${balance} left`}`);
</script>
