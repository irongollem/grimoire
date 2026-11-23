<template>
  <AppButton
    variant="menu"
    size="body"
    block
    class="w-full gap-3 border-b border-border/50 text-left"
    :class="[padding, touch ? 'min-h-11' : '']"
    data-testid="ask-search-row"
    @click="emit('ask')"
  >
    <IconAsk class="size-4 shrink-0 text-primary" />
    <span class="flex min-w-0 flex-1 flex-col">
      <span>Ask Grimoire</span>
      <AskHandText class="truncate text-caption">{{ query.trim() }}</AskHandText>
    </span>
    <KeyCap v-if="!touch">{{ combo }}</KeyCap>
  </AppButton>
</template>

<script setup lang="ts">
/**
 * The first row of the search results once two characters are typed: the same words, put to Grimoire instead.
 * Not part of the arrow-key list, so plain Enter does exactly what it did before; the key cap is the way in
 * from the keyboard.
 */
import { IconAsk } from "@/lib/icons";
import { formatCombo, isMacPlatform } from "@/lib/hotkeys";
import AppButton from "@/components/common/controls/AppButton.vue";
import KeyCap from "@/components/common/controls/KeyCap.vue";
import AskHandText from "@/components/ask/AskHandText.vue";

const { query, padding = "px-3", touch = false } = defineProps<{
  query: string;
  /** Horizontal padding class, matching the host's rows. */
  padding?: string;
  /** The phone overlay: a finger-sized row and no key cap. */
  touch?: boolean;
}>();
const emit = defineEmits<{ ask: [] }>();

const combo = formatCombo("mod+enter", isMacPlatform());
</script>
