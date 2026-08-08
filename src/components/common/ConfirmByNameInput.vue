<template>
  <div class="space-y-2">
    <p class="text-eyebrow font-semibold text-muted-foreground">
      TYPE <span class="text-foreground">{{ name }}</span> TO CONFIRM
    </p>
    <input
      v-model="typed"
      type="text"
      autocomplete="off"
      :placeholder="name"
      :disabled="disabled"
      class="w-full bg-muted border border-border rounded-md px-3 py-2 font-fell text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 disabled:opacity-50 disabled:cursor-not-allowed"
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
const typed = defineModel<string>({ required: true });

const { accent = "destructive" } = defineProps<{
  /** The exact string the user has to reproduce — usually the campaign name. */
  name: string;
  /** Focus-ring colour; `primary` for actions that are permanent but not deletions. */
  accent?: "destructive" | "primary";
  disabled?: boolean;
}>();
</script>
