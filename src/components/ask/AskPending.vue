<template>
  <!-- A creation under way: it holds the place of its quote and never the conversation, which carries on below it. -->
  <section
    v-if="state === 'running'"
    class="flex items-center gap-2.5 border border-dashed border-border bg-card/60 px-3 py-2"
    :aria-label="`${action}, under way`"
    aria-live="polite"
    data-testid="ask-pending"
  >
    <BannerLoader class="h-5 shrink-0" />
    <span class="min-w-0 flex-1">
      <span class="block text-body font-semibold text-foreground">{{ action }}…</span>
      <span class="block text-caption text-muted-foreground">Keep asking. It lands at the bottom when it is done.</span>
    </span>
  </section>

  <!-- Done: the result moved to the bottom, where it was added; this is the way back down to it. -->
  <p v-else class="flex items-center gap-1.5 text-caption text-muted-foreground" data-testid="ask-landed">
    <span>{{ state === "done" ? `${landedName ?? action} is ready.` : `${action} did not finish.` }}</span>
    <AppButton
      v-if="landedAt !== undefined"
      variant="link"
      size="inline-caption"
      :icon="IconChevronDown"
      label="See it below"
      data-testid="ask-landed-jump"
      @click="emit('jump', landedAt)"
    />
  </p>
</template>

<script setup lang="ts">
/** A confirmed run's place in the thread: under way, then a link to where it landed. */
import { IconChevronDown } from "@/lib/icons";
import AppButton from "@/components/common/controls/AppButton.vue";
import BannerLoader from "@/components/brand/BannerLoader.vue";

const { state, action, landedAt, landedName = null } = defineProps<{
  state: "running" | "done" | "failed";
  action: string;
  landedAt?: number;
  landedName?: string | null;
}>();
const emit = defineEmits<{ jump: [itemId: number] }>();
</script>
