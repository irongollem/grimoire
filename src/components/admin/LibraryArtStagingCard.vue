<script setup lang="ts">
import { computed } from "vue";
import {
  UploadIcon,
  AlertCircleIcon,
  Trash2Icon,
} from "@lucide/vue";
import AppButton from "@/components/common/AppButton.vue";
import AppCheckbox from "@/components/common/AppCheckbox.vue";
import AppInput from "@/components/common/AppInput.vue";
import type { ButtonTone } from "@/components/common/appButtonVariants";

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

// AppInput's v-model needs a writable target; bridge the search prop/emit pair
// (the parent's v-model:search) into one.
const searchModel = computed({
  get: () => search,
  set: (value: string) => emit("update:search", value),
});

function assignTone(): ButtonTone {
  if (assignStatus === "error") return "danger";
  if (!selected.length) return "neutral";
  return "primary";
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
      <AppInput
        v-model="searchModel"
        type="text"
        size="caption"
        placeholder="Search monsters…"
      />

      <!-- checkbox results -->
      <div
        v-if="filteredOptions().length"
        class="max-h-32 overflow-y-auto flex flex-col gap-0.5 rounded border border-border bg-muted/30 p-1"
      >
        <label
          v-for="opt in filteredOptions()"
          :key="opt.id"
          class="flex items-center gap-1.5 px-1.5 py-1 rounded cursor-pointer hover:bg-muted/60 text-caption"
          :class="
            selected.includes(opt.id)
              ? 'bg-primary/10 text-primary'
              : 'text-foreground'
          "
        >
          <AppCheckbox
            size="sm"
            :model-value="selected.includes(opt.id)"
            :aria-label="opt.name"
            @update:model-value="emit('toggle-selection', opt.id)"
          />
          <button
            type="button"
            class="truncate text-left hover:underline hover:text-primary transition-colors"
            @click.stop="emit('preview-entity', opt.id)"
          >{{ opt.name }}</button>
          <span
            class="ml-auto shrink-0 font-cinzel text-2xs text-muted-foreground tracking-wide"
            >{{ opt.source }}</span
          >
        </label>
      </div>
      <p
        v-else-if="search.length >= 2"
        class="text-caption-sm text-muted-foreground italic"
      >
        No matches
      </p>

      <div
        v-if="error"
        class="text-caption-sm text-destructive"
      >
        {{ error }}
      </div>

      <div class="flex gap-1.5">
        <!-- Assign selected -->
        <AppButton
          variant="tinted"
          emphasis="outline"
          size="sm"
          icon-size="xs"
          class="flex-1"
          :tone="assignTone()"
          :icon="assignStatus === 'error' ? AlertCircleIcon : UploadIcon"
          :loading="assignStatus === 'assigning'"
          :disabled="!selected.length || assignStatus === 'assigning'"
          @click="emit('assign')"
        >
          <template v-if="assignStatus === 'error'">Retry</template>
          <template v-else-if="selected.length">
            Assign {{ selected.length }} selected
          </template>
          <template v-else>Assign</template>
        </AppButton>

        <!-- Discard without assigning -->
        <AppButton
          variant="subtle"
          tone="danger"
          size="icon-xs"
          tooltip="Discard"
          :icon="Trash2Icon"
          @click="emit('discard')"
        />
      </div>
    </div>
  </div>
</template>
