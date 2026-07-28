<template>
  <li
    class="group/row relative flex items-center gap-2 overflow-hidden rounded-md border border-border bg-card/30 p-2 pl-3 transition-colors hover:border-gold-500/30"
  >
    <!-- Category spine, same language as the board's own cards: a DM should be
         able to tell a bed from a one-shot before reading anything. -->
    <span class="absolute inset-y-0 inset-s-0 w-0.75" :class="spineClass" />

    <!-- Preview -->
    <button
      type="button"
      class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:border-border/80 hover:text-foreground"
      :title="isPreviewing ? 'Stop preview' : 'Preview'"
      @click="emit('preview')"
    >
      <IconPause v-if="isPreviewing" class="h-3.5 w-3.5" />
      <IconPlay v-else class="h-3.5 w-3.5 translate-x-px" />
    </button>

    <!-- Info -->
    <div class="flex-1 min-w-0">
      <div class="flex items-center gap-1.5">
        <p class="font-cinzel text-xs text-foreground truncate">{{ hit.name }}</p>
        <span
          class="shrink-0 px-1 py-0.5 rounded text-caption-sm tracking-wide"
          :class="
            hit.license === 'public-domain'
              ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
              : 'bg-sky-500/15 text-sky-300 border border-sky-500/30'
          "
        >
          {{ hit.license === "public-domain" ? "Public domain" : "Credit required" }}
        </span>
        <!--
          Only shown when the source actually claims a seamless loop. Its
          absence is not a claim that the file loops badly, so there is no
          opposite badge — that would read as a warning we cannot back up.
        -->
        <span
          v-if="hit.isLoopable"
          class="shrink-0 px-1 py-0.5 rounded text-caption-sm tracking-wide bg-gold-500/15 text-gold-300 border border-gold-500/30"
          title="Authored to loop seamlessly — safe to run as a bed"
        >
          Loops
        </span>
      </div>
      <p class="text-caption text-muted-foreground truncate">
        by {{ hit.author }} · {{ formatDuration(hit.duration) }}
        <span v-if="hit.tags.length > 0" class="opacity-60">· {{ hit.tags.slice(0, 3).join(", ") }}</span>
      </p>
    </div>

    <!-- Add -->
    <button
      type="button"
      class="shrink-0 px-2 py-1 rounded-md border bg-gold-500/15 border-gold-500/40 text-gold-300 hover:bg-gold-500/25 font-cinzel text-xs tracking-wide transition-colors disabled:opacity-50"
      :disabled="isAdding"
      @click="emit('add')"
    >
      {{ isAdding ? "Adding…" : "Add" }}
    </button>
  </li>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { IconPause, IconPlay } from "@/lib/icons";
import { CATEGORY_SPINE } from "@/lib/soundCategories";
import type { ProviderHit } from "@/lib/soundProviders";

const { hit, isPreviewing = false, isAdding = false } = defineProps<{
  hit: ProviderHit;
  isPreviewing?: boolean;
  isAdding?: boolean;
}>();

const emit = defineEmits<{
  (e: "preview"): void;
  (e: "add"): void;
}>();

// A provider that does not classify its results falls back to effects, which is
// what the add flow will use — so the spine never promises a bus it will not get.
const spineClass = computed(() => CATEGORY_SPINE[hit.category === null ? "effects" : hit.category]);

function formatDuration(seconds: number): string {
  // 0 is the contract's "not reported", so it shows as unknown rather than 0.0s.
  if (!isFinite(seconds) || seconds <= 0) return "—";
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
</script>
