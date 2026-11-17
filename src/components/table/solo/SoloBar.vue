<template>
  <header class="flex min-h-13 shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-border bg-card px-3 py-1.5 md:px-4">
    <AppButton variant="ghost" size="md" :icon="IconChevronLeft" label="Leave the table" :loading="leaving" collapse-label-on-mobile @click="emit('leave')" />
    <div class="flex min-w-0 flex-col md:flex-row md:items-center md:gap-3">
      <span class="truncate text-heading-sm font-bold text-foreground">{{ campaign }}</span>
      <span class="truncate text-caption text-muted-foreground md:hidden" data-testid="solo-bar-who">{{ phoneLine }}</span>
      <span class="hidden truncate md:inline md:rounded-sm md:bg-muted md:px-2 md:py-0.5 md:text-label-lg md:text-foreground">Playing {{ character }}</span>
    </div>
    <span class="flex-1" />
    <!-- The composer's foot carries this link from tablet up; on a phone the bar does. -->
    <AppButton to="/play/table/story" variant="ghost" size="md" :icon="IconScrollText" label="The story so far" collapse-label-on-mobile class="md:hidden" />
    <!-- Off until asked for: a page that starts talking by itself is a surprise, and every voiced line is a paid call. -->
    <AppButton
      variant="ghost"
      size="md"
      :icon="voiceOn ? IconVolume : IconMute"
      :active="voiceOn"
      :aria-pressed="voiceOn"
      :aria-label="voiceOn ? 'Characters speak aloud. Turn voices off' : 'Turn on the characters\' voices'"
      data-testid="solo-voice"
      @click="emit('voice', !voiceOn)"
    />
    <AppButton variant="ghost" size="inline" aria-label="About the Dungeon Master being an AI" @click="emit('disclosure')">
      <SoloAiMark />
    </AppButton>
    <div ref="meterHost" class="relative">
      <AppButton variant="subtle" size="md" :icon="IconCoins" aria-label="What this sitting has cost" :aria-expanded="costOpen" @click="costOpen = !costOpen">
        <!-- A phone has no room for the sentence: the design's bar reads "2 · 43 left" there. -->
        <span class="font-stat text-label-lg font-semibold max-md:hidden">{{ meter }}</span>
        <span class="font-stat text-label-lg font-semibold md:hidden">{{ meterShort }}</span>
      </AppButton>
      <SoloCostPanel v-if="costOpen" :turns="turns" :credits="credits" :balance="balance" @credits="emit('credits')" />
    </div>
  </header>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { onClickOutside } from "@vueuse/core";
import AppButton from "@/components/common/controls/AppButton.vue";
import { IconChevronLeft, IconCoins, IconMute, IconScrollText, IconVolume } from "@/lib/icons";
import SoloAiMark from "./SoloAiMark.vue";
import SoloCostPanel from "./SoloCostPanel.vue";

const { credits, balance, character, hitPoints = null, leaving = false, voiceOn = false } = defineProps<{
  campaign: string;
  character: string;
  /** Credits billed in this sitting, whole. */
  credits: number;
  /** Turns the player has taken in this sitting. */
  turns: number;
  /** The account's balance; null while it is not known. */
  balance: number | null;
  /** The played character's hit points, kept in sight on a phone on every tab; null while they are not known. */
  hitPoints?: { current: number; max: number } | null;
  /** The leave call is running. */
  leaving?: boolean;
  /** The characters' spoken lines are read aloud. */
  voiceOn?: boolean;
}>();
const emit = defineEmits<{ disclosure: []; credits: []; leave: []; voice: [on: boolean] }>();

const costOpen = ref(false);
const meterHost = ref<HTMLElement | null>(null);
onClickOutside(meterHost, () => {
  costOpen.value = false;
});

const phoneLine = computed(() => (hitPoints === null ? `Playing ${character}` : `${character} · ${hitPoints.current} of ${hitPoints.max} hit points`));
const meterShort = computed(() => `${credits}${balance === null ? "" : ` · ${balance} left`}`);
const meter = computed(() => `${credits} ${credits === 1 ? "credit" : "credits"} this sitting${balance === null ? "" : ` · ${balance} left`}`);
</script>
