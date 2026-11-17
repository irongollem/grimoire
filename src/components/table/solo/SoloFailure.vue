<template>
  <!-- "Your words are never lost, the reason is one plain sentence under your line, and nothing is charged for a turn
       that was not kept." (Wrong, 08) -->
  <div class="ml-7 flex flex-wrap items-center gap-3 border border-border bg-card px-3 py-2.5" role="alert">
    <p class="min-w-0 flex-1 text-body text-foreground">{{ message }}</p>
    <AppButton v-if="action === 'resend'" variant="outline" size="md" label="Send again" @click="emit('resend')" />
    <AppButton v-else-if="action === 'credits'" variant="primary" size="md" label="Get credits" @click="emit('credits')" />
  </div>
</template>

<script setup lang="ts">
import AppButton from "@/components/common/controls/AppButton.vue";
import type { TurnFailure } from "@/lib/table/turnRefusal";

defineProps<TurnFailure>();
const emit = defineEmits<{ resend: []; credits: [] }>();
</script>
