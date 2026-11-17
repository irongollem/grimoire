<template>
  <!-- The story has turned into a fight (#1021, story 13). It is fought on the fight screen with the game's own
       rules, not told here, so this card is the way there and says to come back. -->
  <section class="flex flex-wrap items-center gap-x-4 gap-y-2 border border-border bg-card px-4 py-3" role="status" data-testid="solo-fight">
    <div class="flex min-w-0 flex-1 flex-col gap-0.5">
      <span class="text-eyebrow text-destructive">A fight</span>
      <span class="text-heading-sm text-foreground">{{ name }}</span>
      <span class="text-caption text-muted-foreground">It is fought on the fight screen. Come back to the table when it is over and the story goes on from how it ended.</span>
    </div>
    <AppButton variant="live" size="md" label="Go to the fight" @click="emit('go')" />
  </section>
</template>

<script setup lang="ts">
import AppButton from "@/components/common/controls/AppButton.vue";

defineProps<{ name: string }>();
const emit = defineEmits<{ go: [] }>();
</script>
