<template>
  <AppModal :open="gifts.length > 0" size="sm" @close="markSeen">
    <ModalHeader :title="`You've been given ${creditsLabel(total)}`" :icon="IconCoins" closeable @close="markSeen" />

    <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 space-y-3">
      <p v-if="messages.length === 0" class="text-body text-muted-foreground leading-snug">
        A gift from Dungeon Grimoire. They're in your balance now, ready for any AI feature.
      </p>
      <template v-else>
        <blockquote
          v-for="gift in messages"
          :key="gift.id"
          class="border-l-2 border-accent/50 pl-3 text-body text-foreground leading-snug whitespace-pre-line"
        >
          {{ gift.message }}
          <span v-if="gifts.length > 1" class="block text-caption text-muted-foreground">
            {{ creditsLabel(gift.credits) }}
          </span>
        </blockquote>
        <p class="text-caption text-muted-foreground">They're in your balance now, ready for any AI feature.</p>
      </template>
    </div>

    <div class="flex shrink-0 justify-end px-5 pb-5">
      <AppButton variant="primary" size="md" label="Thanks" @click="markSeen" />
    </div>
  </AppModal>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { IconCoins } from "@/lib/icons";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppModal from "@/components/common/overlays/AppModal.vue";
import ModalHeader from "@/components/common/overlays/ModalHeader.vue";
import { useCreditGifts } from "@/composables/billing/useCreditGifts";

/**
 * Tells an account about credits the admin gave it, once. Mounted in App.vue
 * for every signed-in account; it opens only while an unseen gift exists, and
 * Thanks (or closing it) marks every gift shown as seen.
 */
const { gifts, total, markSeen } = useCreditGifts();

const messages = computed(() => gifts.value.filter((g) => g.message));

function creditsLabel(n: number): string {
  const whole = Number.isInteger(n) ? n.toLocaleString() : n.toFixed(2);
  return n === 1 ? "1 credit" : `${whole} credits`;
}
</script>
