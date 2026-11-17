<template>
  <div ref="scroller" class="min-h-0 flex-1 overflow-y-auto px-4 pt-6 md:px-6" data-testid="solo-story" @scroll.passive="onScroll">
    <div class="mx-auto flex w-full max-w-160 flex-col gap-4.5 pb-6">
      <template v-for="item in items" :key="item.id">
        <SoloNarration v-if="item.kind === 'narration'" :text="item.text" />
        <SoloPlayerLine v-else-if="item.kind === 'player'" :mode="item.mode" :text="item.text" :who="character" :unsent="item.unsent === true" />
        <SoloSpoken
          v-else-if="item.kind === 'spoken'"
          :speaker="item.speaker.name"
          :text="item.text"
          :to="item.to"
          :pigment="pigmentOf(item.speaker)"
          :portrait="portraitOf(item.speaker)"
          :replayable="voiceOn && item.voice !== undefined"
          @replay="emit('replay', item)"
        />
        <SoloActed v-else-if="item.kind === 'acted'" :speaker="item.speaker.name" :text="item.text" :pigment="pigmentOf(item.speaker)" />
        <SoloRolled v-else-if="item.kind === 'roll'" :line="rollLine(item.roll, character)" />
        <SoloRolled v-else-if="item.kind === 'dmRoll'" :line="dmRollLine(item.roll)" by-server />
        <SoloRolled v-else-if="item.kind === 'board'" :line="{ total: String(item.total), title: item.title, detail: item.detail }" :by-server="item.byServer" />
        <SoloMargin v-else :text="item.text" :count="item.count" />
      </template>

      <SoloFailure v-if="failure" v-bind="failure" @resend="emit('resend')" @credits="emit('credits')" />

      <span v-if="running" class="text-eyebrow flex items-center gap-2 text-foreground" role="status">
        <BannerLoader class="h-3.5" /> Writing…
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from "vue";
import BannerLoader from "@/components/brand/BannerLoader.vue";
import { dmRollLine } from "@/lib/table/dmRoll";
import { rollLine } from "@/lib/table/tableRoll";
import { isAtBottom } from "@/lib/table/storyScroll";
import { speakerKey, type VoicePigment } from "@/lib/table/speakerColours";
import type { StoryItem, TableLine } from "@/lib/table/soloTypes";
import type { TurnFailure } from "@/lib/table/turnRefusal";
import SoloActed from "./SoloActed.vue";
import SoloFailure from "./SoloFailure.vue";
import SoloMargin from "./SoloMargin.vue";
import SoloNarration from "./SoloNarration.vue";
import SoloPlayerLine from "./SoloPlayerLine.vue";
import SoloRolled from "./SoloRolled.vue";
import SoloSpoken from "./SoloSpoken.vue";

const { items, colours, portraits, character, failure = null, running = false, voiceOn = false } = defineProps<{
  items: readonly StoryItem[];
  colours: ReadonlyMap<string, VoicePigment>;
  /** A portrait per character record, already with a disguise applied where the character is concealed. */
  portraits: ReadonlyMap<string, { src: string; focalPoint: { x: number; y: number } | null }>;
  /** The character being played: the name over the player's own lines. */
  character: string;
  failure?: TurnFailure | null;
  running?: boolean;
  /** The characters' voices are switched on: a line that can be voiced offers to be heard again. */
  voiceOn?: boolean;
}>();
const emit = defineEmits<{ resend: []; credits: []; replay: [item: StoryItem] }>();

const scroller = ref<HTMLElement | null>(null);
// Following: the newest line stays in view while the player is at the foot, and lets go the moment they scroll up.
let following = true;

function pigmentOf(speaker: TableLine["speaker"]): VoicePigment {
  return colours.get(speakerKey(speaker)) ?? "rubric";
}

function portraitOf(speaker: TableLine["speaker"]) {
  return speaker.id === null ? null : (portraits.get(speaker.id) ?? null);
}

function onScroll(): void {
  if (scroller.value) following = isAtBottom(scroller.value);
}

function toBottom(): void {
  const el = scroller.value;
  if (el) el.scrollTop = el.scrollHeight;
}

watch(
  () => [items.length, items[items.length - 1], failure, running] as const,
  async () => {
    if (!following) return;
    await nextTick();
    toBottom();
  },
  { flush: "post" },
);

// A sitting opened from the list starts at its end, where the story left off.
watch(scroller, (el) => {
  if (el) void nextTick(toBottom);
}, { once: true });
</script>
