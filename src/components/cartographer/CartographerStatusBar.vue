<template>
  <div
    class="absolute bottom-0 left-0 right-0 flex items-center gap-3 px-3 py-1 bg-card/95 border-t border-border text-caption-sm text-muted-foreground"
  >
    <span>
      Cursor: <strong class="text-foreground">{{ hoverCell?.[0] ?? "—" }}, {{ hoverCell?.[1] ?? "—" }}</strong>
    </span>
    <span>
      Zoom: <strong class="text-foreground">{{ Math.round(zoom * 100) }}%</strong>
    </span>
    <span v-if="packLoadError" class="text-destructive">{{ packLoadError }}</span>
    <span v-if="cellsPainted > 0">
      Floor cells: <strong class="text-foreground">{{ cellsPainted }}</strong>
    </span>
    <AppButton
      variant="ghost"
      fill="muted"
      size="icon-xs"
      tooltip="Center map (C)"
      aria-label="Center map"
      :icon="IconCenter"
      @click="emit('center')"
    />
    <span v-if="caution" class="ml-auto text-ink-caution">{{ caution }}</span>
  </div>
</template>

<script setup lang="ts">
// The strip along the canvas's foot: where the pointer is, the zoom, the pack, the floor count, and the
// "N regions changed since last publish" caution. Split out of MapWorkbench.vue (#1135).
import AppButton from "@/components/common/controls/AppButton.vue";
import { IconCenter } from "@/lib/icons";

defineProps<{
  hoverCell: [number, number] | null;
  zoom: number;
  packLoadError: string | null;
  cellsPainted: number;
  caution: string | null;
}>();
const emit = defineEmits<{ center: [] }>();
</script>
