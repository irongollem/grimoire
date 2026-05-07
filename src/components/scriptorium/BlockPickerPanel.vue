<template>
  <Teleport to="body">
    <div
      v-if="show"
      class="fixed inset-0 z-9999 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      @click.self="$emit('close')"
      @keydown.esc="$emit('close')"
    >
      <div
        class="flex flex-col w-[min(560px,94vw)] max-h-[min(640px,90vh)] bg-card rounded-xl border border-border shadow-2xl overflow-hidden"
      >
        <!-- Header -->
        <div
          class="flex items-center justify-between px-4 py-3 border-b border-border shrink-0"
        >
          <h2
            class="font-cinzel font-bold text-sm tracking-wide text-foreground"
          >
            Insert Block
          </h2>
          <button
            type="button"
            class="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            @click="$emit('close')"
          >
            <IconClose class="h-4 w-4" />
          </button>
        </div>

        <!-- Scrollable body -->
        <div class="flex-1 overflow-y-auto px-4 py-3 space-y-5">
          <!-- Registry groups -->
          <section v-for="group in visibleGroups" :key="group">
            <h3
              class="font-cinzel text-[10px] font-semibold tracking-widest uppercase text-muted-foreground mb-2"
            >
              {{ group }}
            </h3>
            <div class="space-y-1">
              <button
                v-for="entry in entriesByGroup[group]"
                :key="entry.label"
                type="button"
                :disabled="isDisabled(entry)"
                class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border bg-card text-left transition-colors"
                :class="
                  isDisabled(entry)
                    ? 'opacity-40 cursor-not-allowed'
                    : 'hover:bg-muted hover:border-primary/30 group'
                "
                @click="activate(entry)"
              >
                <div
                  class="shrink-0 w-8 h-8 rounded-md flex items-center justify-center"
                  :class="
                    isDisabled(entry)
                      ? 'bg-muted text-muted-foreground'
                      : 'bg-primary/10 text-primary group-hover:bg-primary/20'
                  "
                >
                  <component :is="entry.icon" class="h-4 w-4" />
                </div>
                <div class="min-w-0">
                  <p
                    class="font-cinzel text-xs font-semibold text-foreground leading-tight"
                  >
                    {{ entry.label }}
                  </p>
                  <p
                    class="font-fell text-xs text-muted-foreground italic leading-snug mt-0.5"
                  >
                    {{ entry.description }}
                  </p>
                </div>
              </button>
            </div>
          </section>

          <!-- Images — hardcoded section because actions trigger external state -->
          <section>
            <h3
              class="font-cinzel text-[10px] font-semibold tracking-widest uppercase text-muted-foreground mb-2"
            >
              Images
            </h3>
            <div class="space-y-1">
              <button
                type="button"
                class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border bg-card text-left hover:bg-muted hover:border-primary/30 transition-colors group"
                @click="insertImageFromUrl"
              >
                <div
                  class="shrink-0 w-8 h-8 rounded-md flex items-center justify-center bg-primary/10 text-primary group-hover:bg-primary/20"
                >
                  <IconLink class="h-4 w-4" />
                </div>
                <div class="min-w-0">
                  <p
                    class="font-cinzel text-xs font-semibold text-foreground leading-tight"
                  >
                    From URL…
                  </p>
                  <p
                    class="font-fell text-xs text-muted-foreground italic leading-snug mt-0.5"
                  >
                    Insert an image by pasting its web address
                  </p>
                </div>
              </button>

              <button
                type="button"
                class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border bg-card text-left hover:bg-muted hover:border-primary/30 transition-colors group"
                @click="openAssetLibrary"
              >
                <div
                  class="shrink-0 w-8 h-8 rounded-md flex items-center justify-center bg-primary/10 text-primary group-hover:bg-primary/20"
                >
                  <IconLibrary class="h-4 w-4" />
                </div>
                <div class="min-w-0">
                  <p
                    class="font-cinzel text-xs font-semibold text-foreground leading-tight"
                  >
                    From library…
                  </p>
                  <p
                    class="font-fell text-xs text-muted-foreground italic leading-snug mt-0.5"
                  >
                    Browse and insert saved NPCs, monsters, spells, or locations
                  </p>
                </div>
              </button>
            </div>
          </section>
        </div>

        <!-- Footer -->
        <div class="px-4 py-2.5 border-t border-border shrink-0 bg-muted/30">
          <p class="font-fell text-xs text-muted-foreground italic">
            More block types arrive with each Homebrewery-parity update.
          </p>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { IconClose, IconLibrary, IconLink } from '@/lib/icons';
import type { Editor } from "@tiptap/core";
import {
  BLOCK_REGISTRY,
  BLOCK_GROUP_ORDER,
  type BlockEntry,
} from "@/lib/scriptorium/blockRegistry";

const props = defineProps<{
  show: boolean;
  editor: Editor | undefined;
}>();

const emit = defineEmits<{
  close: [];
  "open-asset-panel": [];
}>();

// ── Group logic ────────────────────────────────────────────────────────────────

/** Entries keyed by group, preserving registry insertion order within each. */
const entriesByGroup = computed(() => {
  const map: Record<string, BlockEntry[]> = {};
  for (const entry of BLOCK_REGISTRY) {
    if (!map[entry.group]) map[entry.group] = [];
    map[entry.group].push(entry);
  }
  return map;
});

/** Only show groups that have at least one registered entry. */
const visibleGroups = computed(() =>
  BLOCK_GROUP_ORDER.filter((g) => (entriesByGroup.value[g]?.length ?? 0) > 0),
);

function isDisabled(entry: BlockEntry): boolean {
  if (!props.editor) return true;
  return entry.enabled ? !entry.enabled(props.editor) : false;
}

// ── Actions ────────────────────────────────────────────────────────────────────

function activate(entry: BlockEntry) {
  if (!props.editor || isDisabled(entry)) return;
  entry.action(props.editor);
  emit("close");
}

function insertImageFromUrl() {
  if (!props.editor) return;
  // Simple prompt — no dependency on a modal library
  const url = window.prompt("Image URL:");
  if (!url?.trim()) return;
  props.editor.chain().focus().setImage({ src: url.trim() }).run();
  emit("close");
}

function openAssetLibrary() {
  emit("open-asset-panel");
  emit("close");
}
</script>
