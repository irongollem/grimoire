<template>
  <!-- ══ Popover variant — desktop trigger + absolute-positioned panel ══════ -->
  <div v-if="variant === 'popover'" ref="rootRef" class="relative shrink-0">
    <slot name="trigger" :open="open" :toggle="toggle" />

    <div
      v-show="open"
      class="absolute right-0 top-full mt-1 z-50 w-80 rounded-md border border-border bg-popover shadow-lg"
    >
      <div class="p-3 border-b border-border">
        <p class="font-cinzel text-xs font-semibold text-foreground">{{ title }}</p>
        <p class="text-caption text-muted-foreground mt-0.5 italic">
          {{ description }}
        </p>
      </div>
      <div v-if="isLoading" class="p-4 flex items-center justify-center">
        <IconLoading class="size-4 animate-spin text-muted-foreground" />
      </div>
      <div v-else-if="availableSources === undefined || availableSources.length === 0" class="p-4">
        <p class="text-caption text-muted-foreground italic">{{ emptyMessage }}</p>
      </div>
      <div v-else class="p-2 flex flex-col gap-0.5 max-h-72 overflow-y-auto">
        <label
          v-for="src in availableSources"
          :key="src.source"
          class="flex items-center gap-2.5 px-2 py-2 rounded cursor-pointer hover:bg-accent transition-colors"
          :class="isMutating ? 'pointer-events-none opacity-60' : ''"
        >
          <input
            type="checkbox"
            :checked="isEnabled(src.source)"
            class="accent-primary shrink-0"
            @change="toggleSource(src)"
          />
          <span class="text-body text-foreground flex-1 min-w-0 truncate">
            {{ src.source_title ?? src.source }}
          </span>
          <span class="font-cinzel text-2xs text-muted-foreground shrink-0">{{ src.count.toLocaleString() }}</span>
        </label>
      </div>
    </div>
  </div>

  <!-- ══ Sheet variant — inner list only; parent hosts it inside a MobileSheet ══ -->
  <div v-else class="flex flex-col">
    <p class="mb-3 text-caption italic text-muted-foreground">
      {{ description }}
    </p>
    <div v-if="isLoading" class="flex items-center justify-center py-6">
      <IconLoading class="size-5 animate-spin text-muted-foreground" />
    </div>
    <p v-else-if="availableSources === undefined || availableSources.length === 0" class="py-4 text-body italic text-muted-foreground">
      {{ emptyMessage }}
    </p>
    <div v-else class="flex flex-col gap-0.5">
      <label
        v-for="src in availableSources"
        :key="src.source"
        class="flex items-center gap-3 rounded-lg px-2 py-3 hover:bg-muted/50"
        :class="isMutating ? 'pointer-events-none opacity-60' : ''"
      >
        <input
          type="checkbox"
          :checked="isEnabled(src.source)"
          class="size-4 shrink-0 accent-primary"
          @change="toggleSource(src)"
        />
        <span class="min-w-0 flex-1 truncate text-body text-foreground">
          {{ src.source_title ?? src.source }}
        </span>
        <span class="shrink-0 font-cinzel text-2xs text-muted-foreground">{{ src.count.toLocaleString() }}</span>
      </label>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { onClickOutside } from "@vueuse/core";
import { IconLoading } from "@/lib/icons";
import {
  useEnabledSources,
  useEnableSource,
  useDisableSource,
  type AvailableSrdSource,
} from "@/composables/useEnabledSources";

// Popover: desktop trigger button (parent-supplied via #trigger slot) + a
// floating panel, self-contained click-outside-to-close.
// Sheet: just the description + list, meant to be dropped inside a parent's
// own MobileSheet — that shell already owns open/close chrome and scrolling.
const {
  variant = "popover",
  title = "",
  description,
  emptyMessage,
  availableSources,
  isLoading,
} = defineProps<{
  variant?: "popover" | "sheet";
  title?: string;
  description: string;
  emptyMessage: string;
  availableSources: AvailableSrdSource[] | undefined;
  isLoading: boolean;
}>();

const open = ref(false);
const rootRef = ref<HTMLElement | null>(null);
onClickOutside(rootRef, () => { open.value = false; });
function toggle() { open.value = !open.value; }

// Campaign-scoped — not entity-specific — so the panel owns this wiring
// directly rather than receiving it as props.
const { data: enabledSourceData } = useEnabledSources();
const enableEnable = useEnableSource();
const enableDisable = useDisableSource();

const enabledSlugs = computed(() => {
  const data = enabledSourceData.value;
  return new Set(data ? data.map((e) => e.source_slug) : []);
});
const isMutating = computed(() => enableEnable.isPending.value || enableDisable.isPending.value);

function isEnabled(slug: string) { return enabledSlugs.value.has(slug); }

function toggleSource(src: AvailableSrdSource) {
  if (isEnabled(src.source)) {
    enableDisable.mutate(src.source);
  } else {
    enableEnable.mutate({ source_slug: src.source, source_title: src.source_title });
  }
}
</script>
