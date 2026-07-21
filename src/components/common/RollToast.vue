<template>
  <Teleport to="body">
    <Transition name="toast">
      <div
        v-if="visible"
        class="fixed bottom-6 right-6 z-50 rounded-lg border border-primary/40 bg-card shadow-lg px-4 py-3 min-w-56 max-w-72"
      >
        <p class="text-label text-muted-foreground mb-0.5">{{ current!.label }}</p>
        <div class="flex items-baseline gap-2">
          <span class="font-cinzel text-3xl font-bold text-foreground">{{ current!.masked ? "?" : current!.total }}</span>
          <span class="text-body text-muted-foreground">
            <template v-if="current!.masked">result hidden — DM eyes only</template>
            <template v-else>
              d20 ({{ current!.dice }})
              <template v-if="current!.modifier !== 0">
                {{ current!.modifier >= 0 ? "+" : "" }}{{ current!.modifier }}
              </template>
            </template>
          </span>
        </div>
        <div class="h-1 w-full rounded-full bg-muted mt-2 overflow-hidden">
          <div :key="barKey" class="h-full bg-primary rounded-full animate-[shrink_3s_linear_forwards]" />
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, watch, onUnmounted } from "vue";

export interface RollResult {
  label: string;
  dice: number;
  modifier: number;
  total: number;
  masked?: boolean;
}

const props = defineProps<{ result: RollResult | null }>();

const visible = ref(false);
const current = ref<RollResult | null>(null);
const barKey = ref(0);
let timer: ReturnType<typeof setTimeout> | null = null;

watch(() => props.result, (r) => {
  if (!r) return;
  current.value = r;
  visible.value = true;
  barKey.value++;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => { visible.value = false; }, 3000);
});

onUnmounted(() => { if (timer) clearTimeout(timer); });
</script>

<style scoped>
.toast-enter-active { transition: all 0.2s ease-out; }
.toast-leave-active { transition: all 0.15s ease-in; }
.toast-enter-from   { opacity: 0; transform: translateY(0.5rem) scale(0.95); }
.toast-leave-to     { opacity: 0; transform: translateY(0.25rem) scale(0.97); }
</style>
