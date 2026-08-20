<template>
  <div class="flex border-b border-border shrink-0">
    <AppButton
      v-for="m in ROLL_MODES"
      :key="m.value"
      variant="ghost"
      size="xs"
      class="flex-1"
      :tone="m.tone"
      :active="rollMode === m.value"
      :label="m.label"
      @click="emit('update:rollMode', m.value)"
    />
  </div>
  <div class="flex border-b border-border shrink-0">
    <AppButton
      v-for="m in CHAT_MODES"
      :key="m.value"
      variant="ghost"
      size="xs"
      class="flex-1"
      :active="chatMode === m.value"
      :label="m.label"
      :tooltip="m.title"
      @click="emit('update:chatMode', m.value)"
    />
  </div>
</template>

<script setup lang="ts">
import AppButton from "@/components/common/AppButton.vue";
import type { ButtonTone } from "@/components/common/appButtonVariants";

export type CheckMode = "normal" | "advantage" | "disadvantage";
export type ChatMode = "public" | "silent";

// Untoned "Normal"/"Public" render the primitive's default gold `active` tint —
// the same convergence CORRECTION 3 (#648) applies to every other neutral
// selected-chip site in the app, rather than a bespoke muted look per option.
const ROLL_MODES: { value: CheckMode; label: string; tone?: ButtonTone }[] = [
  { value: "disadvantage", label: "DIS",    tone: "danger" },
  { value: "normal",       label: "Normal" },
  { value: "advantage",    label: "ADV",    tone: "success" },
];

const CHAT_MODES: { value: ChatMode; label: string; title: string }[] = [
  { value: "public", label: "📢 Public", title: "Roll result visible to all in chat" },
  { value: "silent", label: "🔇 Silent", title: "Roll not posted to chat" },
];

defineProps<{
  rollMode: CheckMode;
  chatMode: ChatMode;
}>();

const emit = defineEmits<{
  "update:rollMode": [value: CheckMode];
  "update:chatMode": [value: ChatMode];
}>();
</script>
