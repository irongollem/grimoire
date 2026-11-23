<template>
  <section class="flex flex-col gap-2 border border-border bg-card px-3 py-2.5" :aria-label="`${item.name} result`" data-testid="ask-result">
    <h3 class="text-body font-bold text-foreground">{{ item.review ? "Suggestions are ready" : `${item.name} is ready` }}</h3>
    <ul class="flex flex-col gap-1.5">
      <li v-for="(part, i) in item.parts" :key="`${part.label}:${i}`" class="flex flex-col gap-1">
        <div class="flex items-start gap-2 text-body">
          <IconCheck v-if="part.ok" class="mt-1 size-3.5 shrink-0 text-ink-success" aria-label="Done" />
          <IconClose v-else class="mt-1 size-3.5 shrink-0 text-destructive" aria-label="Failed" />
          <span class="min-w-0 flex-1">
            {{ part.label }}
            <span v-if="!part.ok && part.error" class="block text-caption text-muted-foreground">{{ part.error }}</span>
          </span>
        </div>
        <div v-if="!part.ok && part.retry && !part.left" class="flex gap-2 pl-5">
          <AppButton
            variant="outline"
            size="xs"
            :loading="part.retrying === true"
            :disabled="part.retrying === true"
            :label="retryLabel(part)"
            data-testid="ask-retry"
            @click="emit('retry', i)"
          />
          <AppButton variant="ghost" size="xs" label="Leave it" :disabled="part.retrying === true" @click="emit('leave', i)" />
        </div>
      </li>
    </ul>
    <AppButton v-if="item.route" variant="primary" size="sm" class="self-start" :label="openLabel" :to="item.route" />
  </section>
</template>

<script setup lang="ts">
/** The end of a run in the thread: each part with a tick or a cross, a retry for what failed, and the way in. */
import { computed } from "vue";
import { IconCheck, IconClose } from "@/lib/icons";
import type { AskItem, ResultPart } from "@/composables/ask/useAskConversation";
import AppButton from "@/components/common/controls/AppButton.vue";

const { item } = defineProps<{ item: Extract<AskItem, { kind: "result" }> }>();
const emit = defineEmits<{ retry: [index: number]; leave: [index: number] }>();

const openLabel = computed(() => (item.review ? "Review suggestions" : `Open ${item.noun}`));

function retryLabel(part: ResultPart): string {
  const credits = part.retry?.credits;
  return credits === null || credits === undefined ? `Retry ${part.label}` : `Retry ${part.label} · ${credits} credits`;
}
</script>
