<template>
  <div class="space-y-2">
    <p class="text-eyebrow font-semibold text-muted-foreground">
      TYPE <span class="text-foreground">{{ name }}</span> TO CONFIRM
    </p>
    <AppInput
      v-model="typed"
      type="text"
      size="body"
      tone="muted"
      autocomplete="off"
      :placeholder="name"
      :disabled="disabled"
      :class="accent === 'destructive' ? 'focus:ring-destructive' : 'focus:ring-primary'"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * Type-the-name gate for irreversible campaign-level actions (delete, transfer
 * ownership). The parent owns the "does it match" decision so it can fold that
 * into whatever other preconditions the action has.
 */
import AppInput from "./AppInput.vue";

const typed = defineModel<string>({ required: true });

const { accent = "destructive" } = defineProps<{
  /** The exact string the user has to reproduce — usually the campaign name. */
  name: string;
  /** Focus-ring colour; `primary` for actions that are permanent but not deletions. */
  accent?: "destructive" | "primary";
  disabled?: boolean;
}>();
</script>
