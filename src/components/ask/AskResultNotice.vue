<template>
  <!-- A torn slip, bottom right, for a result that finished while the DM was elsewhere. -->
  <div
    data-slip
    role="status"
    class="fixed right-4 bottom-[calc(5rem+env(safe-area-inset-bottom)+var(--dock-bottom,0px))] z-50 flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2 bg-popover px-4 py-3 text-popover-foreground md:bottom-[calc(1rem+var(--dock-bottom,0px))]"
    data-testid="ask-notice"
  >
    <p class="text-body font-bold">{{ notice.review ? "Suggestions are ready." : `${notice.name} is ready.` }}</p>
    <p class="text-caption text-muted-foreground">{{ detail }}</p>
    <div class="flex gap-2">
      <AppButton variant="ghost" size="sm" label="Stay here" @click="emit('dismiss')" />
      <AppButton v-if="notice.route" variant="primary" size="sm" :label="notice.review ? 'Review suggestions' : `Open ${notice.noun}`" @click="emit('open', notice.route)" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";

import type { AskNotice } from "@/composables/ask/useAskConversation";

const { notice } = defineProps<{ notice: AskNotice }>();
const emit = defineEmits<{ dismiss: []; open: [route: string] }>();

const detail = computed(() => `${notice.noun} in ${notice.campaign} · ${notice.credits} ${notice.credits === 1 ? "credit" : "credits"}`);
</script>
