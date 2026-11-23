<template>
  <span class="relative inline-flex shrink-0">
    <AppButton
      variant="ghost"
      :size="size"
      :icon="IconAsk"
      icon-size="md"
      :aria-label="ask.hasUnread ? 'Ask Grimoire, a result is ready' : 'Ask Grimoire'"
      :tooltip="`Ask Grimoire, beta (${hotkeyText})`"
      data-testid="ask-button"
      @click="ask.openPanel()"
    />
    <!-- A result arrived that the DM has not seen. -->
    <span
      v-if="ask.hasUnread"
      class="pointer-events-none absolute -top-0.5 -right-0.5 size-2 rounded-full bg-primary"
      data-testid="ask-unread"
    />
  </span>
</template>

<script setup lang="ts">
import { IconAsk } from "@/lib/icons";
import { formatCombo, isMacPlatform } from "@/lib/hotkeys";
import { useAskUiStore } from "@/stores/ui/ask";
import AppButton from "@/components/common/controls/AppButton.vue";

const { size = "icon-sm" } = defineProps<{ size?: "icon-sm" | "icon-xs" | "inline" }>();

const ask = useAskUiStore();
const hotkeyText = formatCombo("mod+j", isMacPlatform());
</script>
