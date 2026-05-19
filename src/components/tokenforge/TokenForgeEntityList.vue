<template>
  <div class="flex flex-col gap-1.5 max-h-[70vh] overflow-y-auto pr-1">

    <!-- Custom entry form -->
    <template v-if="sourceTab === 'custom'">
      <div class="rounded-lg border border-dashed border-border bg-card p-3 flex flex-col gap-2">
        <input
          :value="customName"
          placeholder="Name…"
          class="w-full bg-transparent border-b border-border px-1 py-1 font-cinzel text-sm font-bold text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary transition-colors"
          @input="emit('update:customName', ($event.target as HTMLInputElement).value)"
        />
        <label class="inline-flex items-center gap-2 cursor-pointer font-cinzel text-[11px] tracking-wider text-muted-foreground hover:text-foreground transition-colors">
          <IconUpload class="h-3 w-3 shrink-0" />
          {{ customImageUrl ? 'Change image' : 'Upload image (optional)' }}
          <input type="file" accept="image/*" class="sr-only" @change="emit('custom-image-pick', $event)" />
        </label>
        <button
          type="button"
          :disabled="!customName.trim()"
          class="font-cinzel text-xs text-primary tracking-wider hover:opacity-80 disabled:opacity-40 transition-opacity text-left"
          @click="emit('apply-custom')"
        >Use → Token Preview</button>
      </div>
    </template>

    <!-- Entity list -->
    <button
      v-for="e in entities"
      :key="e.id"
      type="button"
      class="flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors text-left w-full"
      :class="selectedId === e.id
        ? 'border-primary bg-primary/8 shadow-sm'
        : 'border-border bg-card hover:border-primary/30'"
      @click="emit('select', e)"
    >
      <!-- Portrait thumb -->
      <div
        class="h-9 w-9 rounded-full shrink-0 overflow-hidden border border-border flex items-center justify-center text-xs font-cinzel font-bold"
        :style="{ background: `linear-gradient(135deg, ${e.bgGradient[0]}, ${e.bgGradient[1]})` }"
      >
        <FocalImage v-if="e.imageUrl" :src="e.imageUrl" format="token" />
        <span v-else class="text-white/60">{{ e.name.charAt(0).toUpperCase() }}</span>
      </div>
      <div class="flex-1 min-w-0">
        <p class="font-cinzel text-sm font-semibold text-foreground truncate">{{ e.name }}</p>
        <p class="font-fell text-xs text-muted-foreground truncate">{{ e.subtitle }}</p>
      </div>
      <span v-if="!e.imageUrl" class="font-cinzel text-[9px] text-muted-foreground/40 tracking-wider shrink-0">No art</span>
    </button>

    <p v-if="entities.length === 0 && sourceTab !== 'custom'" class="font-fell text-sm text-muted-foreground italic px-2 py-4">
      No {{ emptyLabel }} yet.
    </p>
  </div>
</template>

<script setup lang="ts">
import { IconUpload } from "@/lib/icons";
import FocalImage from "@/components/common/FocalImage.vue";
import type { TokenEntity } from "@/lib/tokenRenderer";

const {
  sourceTab,
  entities,
  selectedId,
  customName,
  customImageUrl,
  emptyLabel,
} = defineProps<{
  sourceTab: string;
  entities: TokenEntity[];
  selectedId: string | null | undefined;
  customName: string;
  customImageUrl: string | null;
  emptyLabel: string;
}>();

const emit = defineEmits<{
  select: [entity: TokenEntity];
  'update:customName': [value: string];
  'custom-image-pick': [event: Event];
  'apply-custom': [];
}>();
</script>
