<template>
  <div class="rounded-lg border border-border bg-card p-4 flex flex-col gap-4">
    <div class="flex items-center justify-between gap-4 flex-wrap">
      <p class="font-cinzel text-sm font-bold text-foreground">Print Sheet ({{ queue.length }} tokens)</p>
      <div class="flex items-center gap-2 flex-wrap">

        <!-- Back style -->
        <SegmentedControl
          v-model="backStyleModel"
          :options="backStyleOptions"
        />

        <!-- Token size -->
        <SegmentedControl
          v-model="printSizeModel"
          :options="printSizeOptions"
        />

        <AppButton
          variant="primary"
          size="md"
          :disabled="rendering"
          :label="rendering ? 'Rendering…' : 'Print Sheet'"
          @click="emit('print')"
        />
      </div>
    </div>

    <!-- Queue items -->
    <div class="flex flex-wrap gap-2">
      <div
        v-for="(qe, qi) in queue"
        :key="`q-${qi}`"
        class="flex items-center gap-1.5 rounded-full border border-border bg-muted pl-1 pr-2 py-0.5"
      >
        <div
          class="h-6 w-6 rounded-full shrink-0 overflow-hidden border border-border flex items-center justify-center text-2xs font-cinzel font-bold"
          :style="{ background: `linear-gradient(135deg, ${qe.entity.bgGradient[0]}, ${qe.entity.bgGradient[1]})` }"
        >
          <FocalImage v-if="qe.entity.imageUrl" :src="qe.entity.imageUrl" format="token" />
          <span v-else class="text-white/60">{{ qe.entity.name.charAt(0) }}</span>
        </div>
        <span class="font-cinzel text-xs text-foreground">{{ qe.entity.name }}</span>
        <AppButton variant="ghost" tone="danger" size="inline-xs" ariaLabel="Remove" label="✕" @click="emit('remove', qi)" />
      </div>
    </div>

    <p class="text-caption text-muted-foreground italic">
      Fronts then backs. Flip on the long edge for duplex alignment.
      Back: <strong>{{ TOKEN_BACK_STYLES.find(b => b.id === backStyle)?.desc }}</strong>
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import FocalImage from "@/components/common/FocalImage.vue";
import SegmentedControl from "@/components/common/SegmentedControl.vue";
import {
  TOKEN_PRINT_SIZES,
  TOKEN_BACK_STYLES,
  type TokenPrintSizeId,
  type TokenBackStyleId,
  type PrintQueueEntry,
} from "@/components/tokenforge/tokenForgePrint";

const {
  queue,
  printSize,
  backStyle,
  rendering = false,
} = defineProps<{
  queue: PrintQueueEntry[];
  printSize: TokenPrintSizeId;
  backStyle: TokenBackStyleId;
  rendering?: boolean;
}>();

const emit = defineEmits<{
  'update:printSize': [value: TokenPrintSizeId];
  'update:backStyle': [value: TokenBackStyleId];
  remove: [index: number];
  print: [];
}>();

const backStyleOptions = TOKEN_BACK_STYLES.map((bs) => ({ value: bs.id, label: bs.label }));
const printSizeOptions = TOKEN_PRINT_SIZES.map((ts) => ({ value: ts.id, label: ts.label }));

const backStyleModel = computed<TokenBackStyleId>({
  get: () => backStyle,
  set: (value) => emit('update:backStyle', value),
});
const printSizeModel = computed<TokenPrintSizeId>({
  get: () => printSize,
  set: (value) => emit('update:printSize', value),
});
</script>
