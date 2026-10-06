<template>
  <div
    class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-md border border-primary/40 bg-card/80 px-4 py-3"
    role="group"
    :aria-label="`Keep ${memorial.character_name} on your wall?`"
  >
    <p class="text-body text-foreground">
      You are no longer in <strong class="font-semibold">{{ memorial.campaign_name }}</strong>. Keep
      <strong class="font-semibold">{{ memorial.character_name }}</strong>'s card on your wall?
    </p>
    <div class="flex shrink-0 gap-2">
      <AppButton variant="primary" size="sm" label="Keep" :disabled="busy" @click="emit('keep')" />
      <AppButton variant="subtle" size="sm" label="Let go" :disabled="busy" @click="emit('let-go')" />
    </div>
  </div>
</template>

<script setup lang="ts">
import AppButton from "@/components/common/AppButton.vue";
import type { CharacterMemorial } from "@/types/memorial.types";

/** Asked once per memorial after the owner leaves its campaign (#982): the wall outlives a membership. */
defineProps<{ memorial: CharacterMemorial; busy: boolean }>();
const emit = defineEmits<{ keep: []; "let-go": [] }>();
</script>
