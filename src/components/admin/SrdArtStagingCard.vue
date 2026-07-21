<script setup lang="ts">
import {
  UploadIcon,
  AlertCircleIcon,
  Loader2Icon,
  Trash2Icon,
} from "lucide-vue-next";

// ── Types ─────────────────────────────────────────────────────────────────────

interface StagingItem {
  id: string;
  storage_path: string;
  image_url: string;
  created_at: string;
}

interface EntityOption {
  id: string;
  name: string;
  source: string;
}

// ── Props & emits ─────────────────────────────────────────────────────────────

const {
  item,
  options,
  search = "",
  selected = [],
  assignStatus = "idle",
  error = "",
} = defineProps<{
  item: StagingItem;
  /** Full entity option list — card filters locally. */
  options: EntityOption[];
  search?: string;
  selected?: string[];
  assignStatus?: "idle" | "assigning" | "done" | "error";
  error?: string;
}>();

const emit = defineEmits<{
  "update:search": [value: string];
  "toggle-selection": [entityId: string];
  assign: [];
  discard: [];
  "preview-entity": [entityId: string];
}>();

// ── Local helpers ─────────────────────────────────────────────────────────────

function filteredOptions(): EntityOption[] {
  const q = search.toLowerCase().trim();
  if (q.length < 2) return [];
  return options.filter((o) => o.name.toLowerCase().includes(q)).slice(0, 20);
}
</script>

<template>
  <div class="rounded-lg border border-border bg-card overflow-hidden flex flex-col">
    <!-- preview — plain img to avoid backfillVariants on staging files -->
    <div class="relative h-44 bg-muted overflow-hidden">
      <img
        :src="item.image_url"
        alt=""
        class="w-full h-full object-cover object-top"
      />
    </div>

    <!-- controls -->
    <div class="p-2 flex flex-col gap-2">
      <!-- search -->
      <input
        :value="search"
        type="text"
        placeholder="Search monsters…"
        class="w-full rounded border border-border bg-background px-2 py-1 font-fell text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
        @input="emit('update:search', ($event.target as HTMLInputElement).value)"
      />

      <!-- checkbox results -->
      <div
        v-if="filteredOptions().length"
        class="max-h-32 overflow-y-auto flex flex-col gap-0.5 rounded border border-border bg-muted/30 p-1"
      >
        <label
          v-for="opt in filteredOptions()"
          :key="opt.id"
          class="flex items-center gap-1.5 px-1.5 py-1 rounded cursor-pointer hover:bg-muted/60 font-fell text-xs"
          :class="
            selected.includes(opt.id)
              ? 'bg-primary/10 text-primary'
              : 'text-foreground'
          "
        >
          <input
            type="checkbox"
            class="h-3 w-3 accent-primary shrink-0"
            :checked="selected.includes(opt.id)"
            @change="emit('toggle-selection', opt.id)"
          />
          <button
            type="button"
            class="truncate text-left hover:underline hover:text-primary transition-colors"
            @click.stop="emit('preview-entity', opt.id)"
          >{{ opt.name }}</button>
          <span
            class="ml-auto shrink-0 font-cinzel text-[0.5625rem] text-muted-foreground tracking-wide"
            >{{ opt.source }}</span
          >
        </label>
      </div>
      <p
        v-else-if="search.length >= 2"
        class="font-fell text-2xs text-muted-foreground italic"
      >
        No matches
      </p>

      <div
        v-if="error"
        class="font-fell text-2xs text-destructive"
      >
        {{ error }}
      </div>

      <div class="flex gap-1.5">
        <!-- Assign selected -->
        <button
          class="flex-1 flex items-center justify-center gap-1 py-1 rounded font-cinzel text-[0.6875rem] tracking-wide border transition-colors"
          :disabled="!selected.length || assignStatus === 'assigning'"
          :class="
            assignStatus === 'error'
              ? 'border-destructive text-destructive hover:bg-destructive/10'
              : !selected.length
                ? 'border-border text-muted-foreground cursor-not-allowed'
                : 'border-primary text-primary hover:bg-primary/10'
          "
          @click="emit('assign')"
        >
          <Loader2Icon
            v-if="assignStatus === 'assigning'"
            class="h-3 w-3 animate-spin"
          />
          <AlertCircleIcon
            v-else-if="assignStatus === 'error'"
            class="h-3 w-3"
          />
          <UploadIcon v-else class="h-3 w-3" />
          <template v-if="assignStatus === 'error'">Retry</template>
          <template v-else-if="selected.length">
            Assign {{ selected.length }} selected
          </template>
          <template v-else>Assign</template>
        </button>

        <!-- Discard without assigning -->
        <button
          class="flex items-center gap-1 px-2 py-1 rounded border border-border font-cinzel text-[0.6875rem] tracking-wide text-muted-foreground hover:text-destructive hover:border-destructive/50 transition-colors"
          title="Discard"
          @click="emit('discard')"
        >
          <Trash2Icon class="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  </div>
</template>
