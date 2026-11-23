<template>
  <div class="flex h-full min-h-0 w-full flex-col">
    <header class="flex shrink-0 items-center justify-between gap-2 border-b border-border bg-muted/30 px-4 py-2.5">
      <div class="flex min-w-0 items-center gap-2">
        <IconAsk class="size-4 shrink-0 text-primary" />
        <h2 class="text-heading font-semibold text-foreground">Familiar</h2>
        <AppButton as="span" variant="tinted" size="xs" tone="info" emphasis="outline" label="Beta" data-testid="ask-beta" />
      </div>
      <div class="flex items-center gap-1">
        <AppButton variant="ghost" size="inline" label="New conversation" data-testid="ask-new" @click="emit('new')" />
        <AppButton variant="ghost" size="icon-xs" :icon="IconClose" icon-size="md" aria-label="Close the Familiar" data-testid="ask-close" @click="emit('close')" />
      </div>
    </header>

    <!-- Where this is asked: the campaign and the page, so an answer is never about the wrong world. -->
    <p class="shrink-0 truncate border-b border-border/60 px-4 py-1.5 text-caption text-muted-foreground" data-testid="ask-context">
      <span class="font-semibold text-foreground">{{ campaignName }}</span>
      <template v-if="pageTitle"> from {{ pageTitle }}</template>
    </p>

    <AskThread
      :items="items"
      :adapters="adapters"
      :running="running"
      @choose="(id, c) => emit('choose', id, c)"
      @hand-off="(id, i) => emit('hand-off', id, i)"
      @confirm="emit('confirm', $event)"
      @cancel="emit('cancel', $event)"
      @adjust="(id, inputs) => emit('adjust', id, inputs)"
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
import { ref } from "vue";
import type { AskChoice, AskReportDraft } from "@edge-shared/agent/askContract";
import { IconAsk, IconClose } from "@/lib/icons";
import type { AskAdapters } from "@/ai/ask/useAskAdapters";
import type { AskItem } from "@/composables/ask/useAskConversation";
import AppButton from "@/components/common/controls/AppButton.vue";
import AskThread from "@/components/ask/AskThread.vue";
import AskComposer from "@/components/ask/AskComposer.vue";

defineProps<{
  items: AskItem[];
  adapters: AskAdapters;
  running: boolean;
  campaignName: string;
  pageTitle: string | null;
  allowanceLine: string;
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
  decide: [itemId: number, key: string, on: boolean];
  retry: [itemId: number, index: number];
  leave: [itemId: number, index: number];
  credits: [needed: number];
  upgrade: [];
  review: [report: AskReportDraft];
}>();

const composer = ref<InstanceType<typeof AskComposer> | null>(null);
defineExpose({ focus: () => composer.value?.focus() });
</script>
