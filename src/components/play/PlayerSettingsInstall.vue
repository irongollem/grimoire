<template>
  <section v-if="canInstall" class="rounded-lg border border-primary/30 bg-primary/5 overflow-hidden">
    <header class="px-4 py-3 border-b border-primary/20">
      <h3 class="font-cinzel text-sm font-bold text-foreground tracking-wide">Install App</h3>
      <p class="text-caption text-muted-foreground italic mt-0.5">
        Add Grimoire to your home screen for quick access between sessions.
      </p>
    </header>
    <div class="p-4">
      <!-- Native install prompt available (Chrome/Edge) -->
      <button
        v-if="hasNativePrompt"
        type="button"
        class="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-label-lg font-semibold text-primary-foreground hover:opacity-90 transition-opacity cursor-pointer"
        @click="install"
      >
        <IconDownload class="h-3.5 w-3.5" />
        Install
      </button>
      <!-- Fallback: manual instructions -->
      <div v-else class="space-y-1.5">
        <p class="font-cinzel text-xs text-muted-foreground tracking-wide">To install manually:</p>
        <p class="text-body text-foreground">
          Android Chrome — tap the <span class="font-cinzel text-xs">⋮</span> menu → <em>Add to Home screen</em>
        </p>
        <p class="text-body text-foreground">
          iOS Safari — tap <span class="font-cinzel text-xs">⎋</span> Share → <em>Add to Home Screen</em>
        </p>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { IconDownload } from "@/lib/icons";
import { usePwaInstall } from "@/composables/usePwaInstall";

const { canInstall, hasNativePrompt, install } = usePwaInstall();
</script>
