<template>
  <SettingsSection
    v-if="canInstall"
    title="Install App"
    description="Add Grimoire to your home screen for quick access between sessions."
  >
    <!-- Native install prompt available (Chrome/Edge) -->
    <AppButton
      v-if="hasNativePrompt"
      variant="primary"
      size="md"
      :icon="IconDownload"
      label="Install"
      @click="install"
    />
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
  </SettingsSection>
</template>

<script setup lang="ts">
import { IconDownload } from "@/lib/icons";
import { usePwaInstall } from "@/composables/usePwaInstall";
import AppButton from "@/components/common/AppButton.vue";
import SettingsSection from "@/components/common/SettingsSection.vue";

const { canInstall, hasNativePrompt, install } = usePwaInstall();
</script>
