<template>
  <div class="flex h-full min-h-0 w-full flex-col">
    <header class="flex shrink-0 items-center justify-between gap-2 border-b border-border bg-muted/30 px-4 py-2.5">
      <div class="flex min-w-0 items-center gap-2">
        <FamiliarAvatar class="size-11" :speaking="speaking" />
        <h2 class="text-heading font-semibold text-foreground">Familiar</h2>
        <AppButton as="span" variant="tinted" size="xs" tone="info" emphasis="outline" label="Beta" data-testid="ask-beta" />
      </div>
      <div class="flex items-center gap-1">
        <AppButton
          v-if="voice.shown"
          variant="ghost"
          size="icon-xs"
          :icon="voice.on ? IconVolume : IconMute"
          icon-size="md"
          :active="voice.on"
          :aria-pressed="voice.on"
          :aria-label="voiceLabel"
          :tooltip="voiceLabel"
          data-testid="ask-voice"
          @click="emit('voice', !voice.on)"
        />
        <AppButton variant="ghost" size="inline" label="New conversation" :disabled="startingOverBlocked" data-testid="ask-new" @click="emit('new')" />
        <AppButton v-if="!docked" variant="ghost" size="icon-xs" :icon="IconClose" icon-size="md" aria-label="Close the Familiar" data-testid="ask-close" @click="emit('close')" />
      </div>
    </header>

    <!-- Where this is asked: the campaign and the page, so an answer is never about the wrong world. -->
    <p class="shrink-0 truncate border-b border-border/60 px-4 py-1.5 text-caption text-muted-foreground" data-testid="ask-context">
      <span class="font-semibold text-foreground">{{ campaignName }}</span>
      <template v-if="pageTitle"> from {{ pageTitle }}</template>
    </p>

    <!-- Why Ooru went quiet, in the context line's own voice. -->
    <p v-if="voice.note" class="shrink-0 border-b border-border/60 px-4 py-1.5 text-caption text-muted-foreground" role="status" data-testid="ask-voice-note">{{ voice.note }}</p>

    <AskThread
      :items="items"
      :adapters="adapters"
      :running="running"
      :replayable="voice.shown && voice.note === null"
      :playing-text="voice.playingText"
      @replay="emit('replay', $event)"
      @choose="(id, c) => emit('choose', id, c)"
      @hand-off="(id, i) => emit('hand-off', id, i)"
      @confirm="emit('confirm', $event)"
      @cancel="emit('cancel', $event)"
      @adjust="(id, inputs) => emit('adjust', id, inputs)"
      @concept="(id, text) => emit('concept', id, text)"
      @quick="emit('quick', $event)"
      @create="emit('create', $event)"
      @again="emit('again', $event)"
      @act="(id, section, row) => emit('act', id, section, row)"
      @discard="emit('discard', $event)"
      @pick="(id, key, value) => emit('pick', id, key, value)"
      @decide="(id, key, on) => emit('decide', id, key, on)"
      @retry="(id, i) => emit('retry', id, i)"
      @leave="(id, i) => emit('leave', id, i)"
      @credits="emit('credits', $event)"
      @upgrade="emit('upgrade')"
      @review="emit('review', $event)"
    />

    <AskComposer ref="composer" :running="running" :line="allowanceLine" @send="emit('send', $event)" />
  </div>
</template>

<script setup lang="ts">
/** The panel's face: header, where-from chip, the thread and the composer. State and wiring belong to AskPanel. */
import { computed, ref } from "vue";
import type { AskChoice, AskReportDraft } from "@edge-shared/agent/askContract";
import { IconClose, IconMute, IconVolume } from "@/lib/icons";
import { creditsText } from "@/lib/ask/askCredits";
import FamiliarAvatar from "@/components/ask/FamiliarAvatar.vue";
import type { AskAdapters } from "@/ai/ask/useAskAdapters";
import type { AskItem } from "@/composables/ask/useAskConversation";
import AppButton from "@/components/common/controls/AppButton.vue";
import AskThread from "@/components/ask/AskThread.vue";
import AskComposer from "@/components/ask/AskComposer.vue";

const props = defineProps<{
  /** In the right-hand dock, whose tab strip closes it: no close of its own. */
  docked?: boolean;
  items: AskItem[];
  adapters: AskAdapters;
  running: boolean;
  /** A generation is in flight: a new conversation would lose its result, so the button waits. */
  startingOverBlocked?: boolean;
  /** Words are arriving: the avatar moves only then. */
  speaking: boolean;
  campaignName: string;
  pageTitle: string | null;
  allowanceLine: string;
  /** Ooru reading replies aloud: the switch (hidden where voices are off), its price, and why it went quiet. */
  voice: { shown: boolean; on: boolean; perMinute: number | null; note: string | null; playingText: string | null };
}>();
const emit = defineEmits<{
  new: [];
  close: [];
  send: [text: string];
  choose: [itemId: number, choice: AskChoice];
  "hand-off": [itemId: number, index: number];
  confirm: [itemId: number];
  cancel: [itemId: number];
  adjust: [itemId: number, inputs: Record<string, unknown>];
  concept: [itemId: number, text: string];
  quick: [itemId: number];
  create: [previewId: number];
  again: [previewId: number];
  act: [previewId: number, section: number, row: number];
  discard: [previewId: number];
  pick: [previewId: number, key: string, value: string];
  decide: [itemId: number, key: string, on: boolean];
  retry: [itemId: number, index: number];
  leave: [itemId: number, index: number];
  credits: [needed: number];
  upgrade: [];
  review: [report: AskReportDraft];
  voice: [on: boolean];
  /** Read this reply of Ooru's again. */
  replay: [text: string];
}>();

const voiceLabel = computed(() => {
  const base = "Ooru reads replies aloud";
  // Priced by the minute of speech, said as such: "a minute" alone read like a line that charges while it is silent.
  return props.voice.perMinute === null ? base : `${base} · about ${creditsText(props.voice.perMinute)} per minute of speech, charged only while it reads`;
});

const composer = ref<InstanceType<typeof AskComposer> | null>(null);
defineExpose({ focus: () => composer.value?.focus() });
</script>
