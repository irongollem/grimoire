<template>
  <div class="flex flex-col gap-1.5">
    <p class="text-eyebrow uppercase text-muted-foreground">{{ who ? `Familiar · ${who}` : "Familiar" }}</p>
    <!-- Drawn from parsed data as text nodes, never v-html: a model's markup shows as written. -->
    <div v-if="text" class="flex flex-col gap-1.5 text-body text-foreground" data-testid="ask-reply-text">
      <template v-for="(block, i) in blocks" :key="i">
        <p v-if="block.kind === 'paragraph'">
          <template v-for="(line, l) in block.lines" :key="l"><br v-if="l > 0" /><AskRuns :runs="line" /></template>
        </p>
        <component :is="block.kind" v-else class="ml-5" :class="block.kind === 'ul' ? 'list-disc' : 'list-decimal'">
          <li v-for="(item, n) in block.items" :key="n"><AskRuns :runs="item" /></li>
        </component>
      </template>
    </div>
    <div v-if="replayable" class="flex">
      <AppButton variant="ghost" size="xs" :icon="IconVolume" label="Read again" data-testid="ask-reply-replay" @click="emit('replay')" />
    </div>
    <div v-if="choices.length > 0" class="flex flex-wrap gap-1.5" role="group" aria-label="Answers">
      <AppButton
        v-for="choice in choices"
        :key="choice.label"
        variant="outline"
        size="sm"
        :disabled="answered"
        @click="emit('choose', choice)"
      >
        <span>{{ choice.label }}</span>
        <span v-if="choice.note" class="text-caption-sm font-normal text-muted-foreground">{{ choice.note }}</span>
      </AppButton>
    </div>
  </div>
</template>

<script setup lang="ts">
/** Grimoire's words, in print, under a small-caps "who" line; a question under them may carry chips. */
import type { AskChoice } from "@edge-shared/agent/askContract";
import { computed } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AskRuns from "@/components/ask/AskRuns.vue";
import { parseAskMarkdown } from "@/lib/ask/askMarkdown";
import { IconVolume } from "@/lib/icons";

const { text, who = null, choices = [], answered = false, replayable = false } = defineProps<{
  text: string;
  who?: string | null;
  choices?: AskChoice[];
  /** The DM has answered; the chips stay as a record of what was offered but no longer press. */
  answered?: boolean;
  /** Ooru may read this reply again (its voice is on, and the reply has finished arriving). */
  replayable?: boolean;
}>();
const blocks = computed(() => parseAskMarkdown(text));
const emit = defineEmits<{ choose: [choice: AskChoice]; replay: [] }>();
</script>
