<script setup lang="ts">
import { ChevronDownIcon } from "lucide-vue-next";

const { title, open, withArtCount, total, stagingCount } = defineProps<{
  title: string;
  open: boolean;
  withArtCount: number;
  total: number;
  stagingCount: number;
}>();

const emit = defineEmits<{ toggle: [] }>();
</script>

<template>
  <button
    type="button"
    class="flex items-center justify-between gap-4 w-full text-left"
    @click="emit('toggle')"
  >
    <div>
      <h2 class="font-cinzel text-sm font-semibold tracking-wide text-foreground">
        {{ title }}
      </h2>
      <p class="font-fell text-xs text-muted-foreground italic mt-0.5">
        Manage canonical SRD art. Dump images from your phone, assign on desktop.
      </p>
    </div>
    <div class="flex items-center gap-2 shrink-0">
      <div v-if="total > 0" class="font-cinzel text-xs text-muted-foreground tabular-nums">
        {{ withArtCount }}&thinsp;/&thinsp;{{ total }}
      </div>
      <div
        v-if="stagingCount > 0"
        class="font-cinzel text-[10px] text-primary tabular-nums"
      >
        {{ stagingCount }} staged
      </div>
      <ChevronDownIcon
        class="h-4 w-4 text-muted-foreground transition-transform duration-200"
        :class="open ? 'rotate-180' : ''"
      />
    </div>
  </button>
</template>
