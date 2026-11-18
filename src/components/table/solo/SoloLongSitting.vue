<template>
  <!-- Offered, never forced (the maintainer, 18 Nov 2026): a sitting that has gone on for a long time is better
       continued in a new one, which is when its notes get written. Sits where the composer's notices sit. -->
  <div class="mb-2 flex flex-wrap items-center gap-x-3 gap-y-2 border border-border bg-card px-3 py-2.5" role="status" data-testid="solo-long-sitting">
    <p class="min-w-0 flex-1 basis-64 text-body text-foreground">
      This sitting has been going for a long time. Shall we go on in a new one? This one's notes get written, and the story picks up right where you are.
    </p>
    <div class="flex items-center gap-2">
      <AppButton variant="outline" size="md" label="Begin a new sitting" :loading="leaving" @click="emit('begin')" />
      <AppButton variant="ghost" size="md" label="Not now" :disabled="leaving" @click="emit('notNow')" />
    </div>
  </div>
</template>

<script setup lang="ts">
import AppButton from "@/components/common/controls/AppButton.vue";

const { leaving = false } = defineProps<{ leaving?: boolean }>();
const emit = defineEmits<{ begin: []; notNow: [] }>();
</script>
