<template>
  <div ref="scroller" class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-3 py-3" data-testid="ask-thread">
    <p v-if="items.length === 0" class="py-6 text-center text-body text-muted-foreground">
      Ask what your campaign already says, ask for ideas, or ask for something to be made.
    </p>
    <template v-for="item in items" :key="item.id">
      <!-- The DM's words, right-aligned and in the hand. -->
      <div v-if="item.kind === 'user'" class="flex justify-end">
        <span data-hand="text" class="max-w-[85%] whitespace-pre-line bg-muted/50 px-3 py-1.5 text-right text-base leading-6" data-testid="ask-user-message">{{ item.text }}</span>
      </div>
      <AskReply v-else-if="item.kind === 'reply'" :text="item.text" :who="item.who" />
      <AskReply
        v-else-if="item.kind === 'ask'"
        :text="item.question"
        :choices="item.choices"
        :answered="item.answered"
        @choose="emit('choose', item.id, $event)"
      />
      <AskRead v-else-if="item.kind === 'read'" :records="item.records" />
      <AskIdeas v-else-if="item.kind === 'ideas'" :ideas="item.ideas" :handed-off="item.handedOff" @hand-off="emit('hand-off', item.id, $event)" />
      <AskQuoteCard
        v-else-if="item.kind === 'proposal'"
        :item="item"
        :adapters="adapters"
        @confirm="emit('confirm', item.id)"
        @cancel="emit('cancel', item.id)"
        @adjust="emit('adjust', item.id, $event)"
        @credits="emit('credits', $event)"
        @upgrade="emit('upgrade')"
      />
      <p v-else-if="item.kind === 'confirmed'" class="text-caption text-muted-foreground">{{ item.text }}</p>
      <AskResultCard
        v-else-if="item.kind === 'result'"
        :item="item"
        @retry="emit('retry', item.id, $event)"
        @leave="emit('leave', item.id, $event)"
      />
      <AskUpsell v-else-if="item.kind === 'upsell'" @credits="emit('credits', 1)" @upgrade="emit('upgrade')" />
      <p v-else-if="item.kind === 'error'" class="text-body text-destructive" role="alert">{{ item.message }}</p>
    </template>
    <div v-if="running" class="flex items-center gap-2 text-caption text-muted-foreground" data-testid="ask-running">
      <BannerLoader class="h-3.5" />
      Thinking…
    </div>
  </div>
</template>

<script setup lang="ts">
/** The conversation: one block per thing said, drawn by kind. It holds no state; the conversation does. */
import { nextTick, ref, watch } from "vue";
import type { AskChoice } from "@edge-shared/agent/askContract";
import type { AskAdapters } from "@/ai/ask/useAskAdapters";
import type { AskItem } from "@/composables/ask/useAskConversation";
import BannerLoader from "@/components/brand/BannerLoader.vue";
import AskReply from "@/components/ask/AskReply.vue";
import AskRead from "@/components/ask/AskRead.vue";
import AskIdeas from "@/components/ask/AskIdeas.vue";
import AskQuoteCard from "@/components/ask/AskQuoteCard.vue";
import AskResultCard from "@/components/ask/AskResultCard.vue";
import AskUpsell from "@/components/ask/AskUpsell.vue";

const { items, adapters, running = false } = defineProps<{ items: AskItem[]; adapters: AskAdapters; running?: boolean }>();
const emit = defineEmits<{
  choose: [itemId: number, choice: AskChoice];
  "hand-off": [itemId: number, index: number];
  confirm: [itemId: number];
  cancel: [itemId: number];
  adjust: [itemId: number, inputs: Record<string, unknown>];
  retry: [itemId: number, index: number];
  leave: [itemId: number, index: number];
  credits: [needed: number];
  upgrade: [];
}>();

const scroller = ref<HTMLElement | null>(null);

// Keep the newest line in view as it is written.
watch(
  () => [items.length, items.at(-1)?.kind === "reply" ? (items.at(-1) as Extract<AskItem, { kind: "reply" }>).text.length : 0],
  async () => {
    await nextTick();
    scroller.value?.scrollTo({ top: scroller.value.scrollHeight });
  },
);
</script>
