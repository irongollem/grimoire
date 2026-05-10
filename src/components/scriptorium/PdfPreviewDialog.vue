<template>
  <Teleport to="body">
    <div
      v-if="show"
      class="fixed inset-0 z-9999 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      @click.self="$emit('close')"
      @keydown.esc="$emit('close')"
    >
      <div
        class="flex flex-col w-[92vw] h-[92vh] bg-card rounded-xl border border-border overflow-hidden shadow-2xl"
      >
        <div
          class="flex items-center justify-between px-4 py-2.5 border-b border-border shrink-0 bg-card"
        >
          <div class="flex items-center gap-3 min-w-0">
            <h2 class="font-cinzel font-bold text-sm text-foreground tracking-wide truncate">
              {{ title || "Untitled Document" }}
            </h2>
            <span class="font-fell text-xs text-muted-foreground italic shrink-0"
              >Use the button below to save — not the viewer's toolbar</span
            >
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <button
              type="button"
              class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded font-cinzel text-[10px] font-semibold tracking-wider uppercase bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
              @click="$emit('save')"
            >
              <IconPrint class="h-3 w-3" />
              Save as "{{ title || "Untitled" }}.pdf"
            </button>
            <button
              type="button"
              class="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              @click="$emit('close')"
            >
              <IconClose class="h-4 w-4" />
            </button>
          </div>
        </div>
        <!-- Broken image warning -->
        <div
          v-if="brokenImages.length > 0"
          class="px-4 py-2.5 bg-destructive/10 border-b border-destructive/30 shrink-0"
        >
          <p class="font-cinzel text-xs font-semibold text-destructive mb-1">
            {{ brokenImages.length }} image{{ brokenImages.length === 1 ? '' : 's' }} failed to load and may be missing from the PDF:
          </p>
          <ul class="space-y-0.5">
            <li
              v-for="url in brokenImages"
              :key="url"
              class="font-fell text-xs text-destructive/80 italic truncate"
            >
              {{ url }}
            </li>
          </ul>
        </div>
        <embed :src="blobUrl ?? ''" type="application/pdf" class="flex-1 w-full" />
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { IconClose, IconPrint } from '@/lib/icons';

defineProps<{ show: boolean; blobUrl: string | null; title: string; brokenImages: string[] }>();
defineEmits<{ close: []; save: [] }>();
</script>
