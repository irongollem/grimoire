<template>
  <section class="flex flex-col gap-2 border border-border bg-card px-3 py-2.5" :aria-label="`${item.name} result`" data-testid="ask-result">
    <h3 class="text-body font-bold text-foreground">{{ item.review ? "Suggestions are ready" : `${item.name} is ready` }}</h3>
    <!--
      What was painted, so the DM sees the face without leaving the page they asked from; marked as AI like every picture.
      Drawn at its own shape: a portrait is taller than wide, and a square crop cuts the face off.
    -->
    <div v-if="picture" class="relative w-full max-w-60 self-start">
      <img
        :src="picture"
        :alt="`${item.name}, as painted`"
        class="h-auto w-full border border-border"
        data-testid="ask-result-picture"
      />
      <AiImageBadge :src="picture" />
    </div>
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
    <div v-if="item.route || (item.links?.length ?? 0) > 0" class="flex flex-wrap items-center gap-2">
      <AppButton v-if="item.route && item.open" variant="primary" size="sm" :label="openLabel" @click="openInPage(item.route, item.open)" />
      <AppButton v-else-if="item.route" variant="primary" size="sm" :label="openLabel" :to="item.route" />
      <AppButton v-for="link in item.links ?? []" :key="link.route" variant="outline" size="sm" :label="link.label" :to="link.route" data-testid="ask-result-link" />
    </div>
  </section>
</template>

<script setup lang="ts">
import { creditsText } from "@/lib/ask/askCredits";
/** The end of a run in the thread: each part with a tick or a cross, a retry for what failed, and the way in. */
import { computed } from "vue";
import { useRouter } from "vue-router";
import { IconCheck, IconClose } from "@/lib/icons";
import type { AskItem, ResultPart } from "@/composables/ask/useAskConversation";
import AppButton from "@/components/common/controls/AppButton.vue";
import AiImageBadge from "@/components/common/ai/AiImageBadge.vue";

const { item } = defineProps<{ item: Extract<AskItem, { kind: "result" }> }>();
const emit = defineEmits<{ retry: [index: number]; leave: [index: number] }>();

const router = useRouter();

/** Suggestions live in the page's own panel: go there, then open it with them in it. */
async function openInPage(route: string, open: () => void) {
  await router.push(route);
  open();
}

/** A repainted part's picture replaces the first one: the newest is the one now on the record. */
const picture = computed(() => {
  const repainted = [...item.parts].reverse().find((part) => part.ok && part.picture);
  return repainted?.picture ?? item.picture ?? null;
});

const openLabel = computed(() => (item.review ? "Review suggestions" : `Open ${item.noun}`));

function retryLabel(part: ResultPart): string {
  const credits = part.retry?.credits;
  return credits === null || credits === undefined ? `Retry ${part.label}` : `Retry ${part.label} · ${creditsText(credits)}`;
}
</script>
