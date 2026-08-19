<template>
  <Teleport to="body">
    <div
      v-if="show"
      class="fixed inset-0 z-9999 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      @click.self="$emit('close')"
      @keydown.esc="$emit('close')"
    >
      <div
        class="flex flex-col w-[min(35rem,94vw)] max-h-[min(40rem,90vh)] bg-card rounded-xl border border-border shadow-2xl overflow-hidden"
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
          <AppButton
            variant="ghost"
            fill="muted"
            size="icon-xs"
            icon-size="md"
            :icon="IconClose"
            aria-label="Close"
            @click="$emit('close')"
          />
        </div>

        <!-- Scrollable body -->
        <div class="flex-1 overflow-y-auto px-4 py-3 space-y-5">
          <!-- Registry groups -->
          <section v-for="group in visibleGroups" :key="group">
            <h3
              class="font-cinzel text-2xs font-semibold tracking-widest uppercase text-muted-foreground mb-2"
            >
              {{ group }}
            </h3>
            <div class="space-y-1">
              <AppButton
                v-for="entry in entriesByGroup[group]"
                :key="entry.label"
                variant="menu"
                size="body"
                surface="card"
                block
                :disabled="isDisabled(entry)"
                :class="isDisabled(entry) ? 'border border-border' : 'border border-border hover:border-primary/30 group'"
                @click="activate(entry)"
              >
                <template #icon>
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
                </template>
                <div class="min-w-0">
                  <p
                    class="font-cinzel text-xs font-semibold text-foreground leading-tight"
                  >
                    {{ entry.label }}
                  </p>
                  <p
                    class="text-caption text-muted-foreground italic leading-snug mt-0.5"
                  >
                    {{ entry.description }}
                  </p>
                </div>
              </AppButton>
            </div>
          </section>

          <!-- Images — hardcoded section because actions trigger external state -->
          <section>
            <h3
              class="font-cinzel text-2xs font-semibold tracking-widest uppercase text-muted-foreground mb-2"
            >
              Images
            </h3>
            <div class="space-y-1">
              <AppButton
                variant="menu"
                size="body"
                surface="card"
                block
                class="border border-border hover:border-primary/30 group"
                @click="insertImageFromUrl"
              >
                <template #icon>
                  <div
                    class="shrink-0 w-8 h-8 rounded-md flex items-center justify-center bg-primary/10 text-primary group-hover:bg-primary/20"
                  >
                    <IconLink class="h-4 w-4" />
                  </div>
                </template>
                <div class="min-w-0">
                  <p
                    class="font-cinzel text-xs font-semibold text-foreground leading-tight"
                  >
                    From URL…
                  </p>
                  <p
                    class="text-caption text-muted-foreground italic leading-snug mt-0.5"
                  >
                    Insert an image by pasting its web address
                  </p>
                </div>
              </AppButton>

              <AppButton
                variant="menu"
                size="body"
                surface="card"
                block
                class="border border-border hover:border-primary/30 group"
                @click="openAssetLibrary"
              >
                <template #icon>
                  <div
                    class="shrink-0 w-8 h-8 rounded-md flex items-center justify-center bg-primary/10 text-primary group-hover:bg-primary/20"
                  >
                    <IconLibrary class="h-4 w-4" />
                  </div>
                </template>
                <div class="min-w-0">
                  <p
                    class="font-cinzel text-xs font-semibold text-foreground leading-tight"
                  >
                    From library…
                  </p>
                  <p
                    class="text-caption text-muted-foreground italic leading-snug mt-0.5"
                  >
                    Browse and insert saved NPCs, monsters, spells, or locations
                  </p>
                </div>
              </AppButton>

              <AppButton
                variant="menu"
                size="body"
                surface="card"
                block
                class="border border-border hover:border-primary/30 group"
                @click="openArtPicker"
              >
                <template #icon>
                  <div
                    class="shrink-0 w-8 h-8 rounded-md flex items-center justify-center bg-primary/10 text-primary group-hover:bg-primary/20"
                  >
                    <IconGridView class="h-4 w-4" />
                  </div>
                </template>
                <div class="min-w-0">
                  <p
                    class="font-cinzel text-xs font-semibold text-foreground leading-tight"
                  >
                    Browse photos…
                  </p>
                  <p
                    class="text-caption text-muted-foreground italic leading-snug mt-0.5"
                  >
                    Pick from your uploaded NPC, monster, location, or document art
                  </p>
                </div>
              </AppButton>
            </div>
          </section>
        </div>

        <!-- Footer -->
        <div class="px-4 py-2.5 border-t border-border shrink-0 bg-muted/30">
          <p class="text-caption text-muted-foreground italic">
            More block types arrive with each Homebrewery-parity update.
          </p>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { IconClose, IconLibrary, IconLink, IconGridView } from '@/lib/icons';
import AppButton from "@/components/common/AppButton.vue";
import type { Editor } from "@tiptap/core";
import type { FurnitureKind } from "@/types/scriptorium.types";
import {
  BLOCK_REGISTRY,
  BLOCK_GROUP_ORDER,
  type BlockEntry,
} from "@/lib/scriptorium/blockRegistry";

const props = defineProps<{
  show: boolean;
  editor: Editor | undefined;
  isTwoColumn?: boolean;
}>();

const emit = defineEmits<{
  close: [];
  "open-asset-panel": [];
  "open-art-picker": [];
  "add-furniture": [kind: FurnitureKind];
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
  return entry.enabled ? !entry.enabled(props.editor, { isTwoColumn: props.isTwoColumn }) : false;
}

// ── Actions ────────────────────────────────────────────────────────────────────

function activate(entry: BlockEntry) {
  if (!props.editor || isDisabled(entry)) return;
  if (entry.furnitureKind) {
    emit("add-furniture", entry.furnitureKind);
  } else {
    entry.action?.(props.editor);
  }
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

function openArtPicker() {
  emit("open-art-picker");
  emit("close");
}
</script>
