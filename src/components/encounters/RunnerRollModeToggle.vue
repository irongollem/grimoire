<template>
  <div class="roll-mode-bar">
    <button
      v-for="m in ROLL_MODES"
      :key="m.value"
      type="button"
      class="roll-mode-btn"
      :class="{ 'roll-mode-active': rollMode === m.value, [m.cls]: rollMode === m.value }"
      @click="emit('update:rollMode', m.value)"
    >{{ m.label }}</button>
  </div>
  <div class="chat-mode-bar">
    <button
      v-for="m in CHAT_MODES"
      :key="m.value"
      type="button"
      class="chat-mode-btn"
      :class="{ 'chat-mode-active': chatMode === m.value, [m.cls]: chatMode === m.value }"
      :title="m.title"
      @click="emit('update:chatMode', m.value)"
    >{{ m.label }}</button>
  </div>
</template>

<script setup lang="ts">
export type CheckMode = "normal" | "advantage" | "disadvantage";
export type ChatMode = "public" | "silent";

const ROLL_MODES: { value: CheckMode; label: string; cls: string }[] = [
  { value: "disadvantage", label: "DIS",    cls: "mode-dis" },
  { value: "normal",       label: "Normal", cls: "mode-normal" },
  { value: "advantage",    label: "ADV",    cls: "mode-adv" },
];

const CHAT_MODES: { value: ChatMode; label: string; cls: string; title: string }[] = [
  { value: "public", label: "📢 Public", cls: "cmode-public", title: "Roll result visible to all in chat" },
  { value: "silent", label: "🔇 Silent", cls: "cmode-silent", title: "Roll not posted to chat" },
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

<style scoped>
@reference "@/assets/main.css";

.roll-mode-bar {
  @apply flex border-b border-border shrink-0;
}
.roll-mode-btn {
  @apply flex-1 py-1.5 font-cinzel text-2xs font-bold tracking-wider text-muted-foreground hover:text-foreground transition-colors;
}
.roll-mode-active { @apply text-foreground; }
.mode-dis.roll-mode-active    { @apply bg-destructive/10 text-destructive; }
.mode-normal.roll-mode-active { @apply bg-muted/50 text-foreground; }
.mode-adv.roll-mode-active    { @apply bg-green-500/10 text-green-600 dark:text-green-400; }

.chat-mode-bar {
  @apply flex border-b border-border shrink-0;
}
.chat-mode-btn {
  @apply flex-1 py-1 font-cinzel text-[0.5625rem] font-bold tracking-wider text-muted-foreground hover:text-foreground transition-colors;
}
.chat-mode-active { @apply text-foreground; }
.cmode-public.chat-mode-active { @apply bg-primary/10 text-primary; }
.cmode-hidden.chat-mode-active { @apply bg-amber-500/10 text-amber-600 dark:text-amber-400; }
.cmode-silent.chat-mode-active { @apply bg-muted/60 text-muted-foreground; }
</style>
