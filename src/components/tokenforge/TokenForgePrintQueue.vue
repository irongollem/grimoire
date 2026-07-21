<template>
  <div class="rounded-lg border border-border bg-card p-4 flex flex-col gap-4">
    <div class="flex items-center justify-between gap-4 flex-wrap">
      <p class="font-cinzel text-sm font-bold text-foreground">Print Sheet ({{ queue.length }} tokens)</p>
      <div class="flex items-center gap-2 flex-wrap">

        <!-- Back style -->
        <div class="flex rounded-md overflow-hidden border border-border">
          <button
            v-for="bs in TOKEN_BACK_STYLES"
            :key="bs.id"
            type="button"
            class="px-3 py-1.5 font-cinzel text-[0.6875rem] font-semibold transition-colors"
            :class="backStyle === bs.id ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground'"
            @click="emit('update:backStyle', bs.id)"
          >{{ bs.label }}</button>
        </div>

        <!-- Token size -->
        <div class="flex rounded-md overflow-hidden border border-border">
          <button
            v-for="ts in TOKEN_PRINT_SIZES"
            :key="ts.id"
            type="button"
            class="px-3 py-1.5 font-cinzel text-[0.6875rem] font-semibold transition-colors"
            :class="printSize === ts.id ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground'"
            @click="emit('update:printSize', ts.id)"
          >{{ ts.label }}</button>
        </div>

        <button
          type="button"
          :disabled="rendering"
          class="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-label-lg font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
          @click="emit('print')"
        >
          {{ rendering ? 'Rendering…' : 'Print Sheet' }}
        </button>
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
          class="h-6 w-6 rounded-full shrink-0 overflow-hidden border border-border flex items-center justify-center text-[0.5625rem] font-cinzel font-bold"
          :style="{ background: `linear-gradient(135deg, ${qe.entity.bgGradient[0]}, ${qe.entity.bgGradient[1]})` }"
        >
          <FocalImage v-if="qe.entity.imageUrl" :src="qe.entity.imageUrl" format="token" />
          <span v-else class="text-white/60">{{ qe.entity.name.charAt(0) }}</span>
        </div>
        <span class="font-cinzel text-[0.6875rem] text-foreground">{{ qe.entity.name }}</span>
        <button type="button" class="text-muted-foreground hover:text-destructive transition-colors text-xs leading-none" @click="emit('remove', qi)">✕</button>
      </div>
    </div>

    <p class="font-fell text-xs text-muted-foreground italic">
      Fronts then backs. Flip on the long edge for duplex alignment.
      Back: <strong>{{ TOKEN_BACK_STYLES.find(b => b.id === backStyle)?.desc }}</strong>
    </p>
  </div>
</template>

<script setup lang="ts">
import FocalImage from "@/components/common/FocalImage.vue";
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
</script>
