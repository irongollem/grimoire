<template>
  <header class="flex min-h-13 shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-border bg-card px-3 py-1.5 md:px-4">
    <AppButton variant="ghost" size="md" :icon="IconChevronLeft" label="Leave the table" :loading="leaving" collapse-label-on-mobile @click="emit('leave')" />
    <div class="flex min-w-0 flex-col md:flex-row md:items-center md:gap-3">
      <span class="truncate text-heading-sm font-bold text-foreground">{{ campaign }}</span>
      <span class="truncate text-caption text-muted-foreground md:hidden" data-testid="solo-bar-who">{{ phoneLine }}</span>
      <span class="hidden truncate md:inline md:rounded-sm md:bg-muted md:px-2 md:py-0.5 md:text-label-lg md:text-foreground">Playing {{ character }}</span>
    </div>
    <span class="flex-1" />
    <!-- In the bar at every width: under the composer it took a line from the story for a page that is rarely opened. -->
    <AppButton to="/play/table/story" variant="ghost" size="md" :icon="IconScrollText" label="The story so far" collapse-label-on-mobile />
    <!-- Three voices, each with its own switch (the maintainer, 17 Nov 2026: "one for narrator, one for spoken words,
         perhaps even one for your own PC"). All off until asked for: a page that starts talking by itself is a
         surprise, and every voiced line is a paid call. -->
    <div class="flex items-center" role="group" aria-label="Read aloud">
      <AppButton
        v-for="v in VOICES"
        :key="v.part"
        variant="ghost"
        size="md"
        :active="voices[v.part]"
        :aria-pressed="voices[v.part]"
        :aria-label="voices[v.part] ? `${v.what} read aloud. Turn it off` : `Read ${v.what.toLowerCase()} aloud`"
        :title="voices[v.part] ? `${v.what}: read aloud` : `${v.what}: silent`"
        :data-testid="`solo-voice-${v.part}`"
        @click="emit('voice', v.part, !voices[v.part])"
      >
        <!-- Its own slot, not `:icon`: the two masks are a wide glyph and take a wide box. A switch that is off is
             drawn faint, so the three read as on or off at a glance. -->
        <template #icon>
          <component :is="v.icon" v-bind="v.box ? { viewBox: v.box } : {}" :class="[v.box ? 'h-6 w-13' : 'size-6', 'shrink-0', voices[v.part] ? '' : 'opacity-40']" />
        </template>
      </AppButton>
    </div>
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
import { IconChevronLeft, IconCoins, IconScrollText } from "@/lib/icons";
import { IconVoiceCharacters, IconVoiceNarrator, IconVoicePlayer, VOICE_CHARACTERS_BOX } from "@/lib/table/tableIcons";
import { NO_VOICES, type VoicePart, type VoiceParts } from "@/lib/table/voiceLines";
import SoloAiMark from "./SoloAiMark.vue";
import SoloCostPanel from "./SoloCostPanel.vue";

const { credits, balance, character, hitPoints = null, leaving = false, voices = NO_VOICES } = defineProps<{
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
  /** What is read aloud: the narrator, the characters, the player's own character. */
  voices?: VoiceParts;
}>();
const emit = defineEmits<{ disclosure: []; credits: []; leave: []; voice: [part: VoicePart, on: boolean] }>();

const VOICES: ReadonlyArray<{ part: VoicePart; what: string; icon: typeof IconVoiceNarrator; box?: string }> = [
  { part: "narrator", what: "The narrator", icon: IconVoiceNarrator },
  { part: "characters", what: "The characters", icon: IconVoiceCharacters, box: VOICE_CHARACTERS_BOX },
  { part: "player", what: "Your own character", icon: IconVoicePlayer },
];

const costOpen = ref(false);
const meterHost = ref<HTMLElement | null>(null);
onClickOutside(meterHost, () => {
  costOpen.value = false;
});

const phoneLine = computed(() => (hitPoints === null ? `Playing ${character}` : `${character} · ${hitPoints.current} of ${hitPoints.max} hit points`));
const meterShort = computed(() => `${credits}${balance === null ? "" : ` · ${balance} left`}`);
const meter = computed(() => `${credits} ${credits === 1 ? "credit" : "credits"} this sitting${balance === null ? "" : ` · ${balance} left`}`);
</script>
