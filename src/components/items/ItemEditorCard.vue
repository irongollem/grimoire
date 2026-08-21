<template>
  <div
    class="rounded-lg border p-4 flex flex-col"
    :class="[
      tone === 'amber' ? 'border-amber-700/40 bg-amber-950/10' : 'border-border bg-card/50',
      gap === 3 ? 'gap-3' : 'gap-2',
    ]"
  >
    <div v-if="toggleLabel" class="flex items-center justify-between gap-2">
      <h3
        class="text-label-lg font-bold uppercase"
        :class="tone === 'amber' ? 'text-amber-300/80' : 'text-muted-foreground'"
      >
        {{ title }}
        <span
          v-if="hint"
          class="normal-case font-fell font-normal"
          :class="tone === 'amber' ? 'text-muted-foreground/70' : 'text-muted-foreground/60'"
        > — {{ hint }}</span>
      </h3>
      <AppCheckbox
        v-model="toggle"
        label-role="label-lg"
        :label="toggleLabel"
        :class="[toggleShrink && 'shrink-0']"
      />
    </div>
    <h3
      v-else
      class="text-label-lg font-bold uppercase"
      :class="tone === 'amber' ? 'text-amber-300/80' : 'text-muted-foreground'"
    >
      {{ title }}
      <span
        v-if="hint"
        class="normal-case font-fell font-normal"
        :class="tone === 'amber' ? 'text-muted-foreground/70' : 'text-muted-foreground/60'"
      > — {{ hint }}</span>
    </h3>
    <slot />
  </div>
</template>

<script setup lang="ts">
/**
 * Shared shell for the bordered "card" recipe repeated across ItemDetail's
 * form: uppercase heading with an optional inline hint, an optional
 * right-aligned checkbox toggle, and a body slot. The RichTextEditor body
 * stays at each call site — editors differ in v-model, placeholder,
 * size and allow-upload, and the Curse card's editor is itself
 * conditional on the toggle, so absorbing it here would only re-hide that
 * variation rather than remove it.
 */
import AppCheckbox from "@/components/common/AppCheckbox.vue";

const {
  title,
  hint,
  toggleLabel,
  toggleShrink = false,
  tone = "default",
  gap = 2,
} = defineProps<{
  title: string;
  /** Rendered as " — {hint}" after the title, e.g. "optional". */
  hint?: string;
  /** Presence of this prop is what decides whether the toggle renders. */
  toggleLabel?: string;
  /** Written Contents' toggle label carries shrink-0; Curse's doesn't. */
  toggleShrink?: boolean;
  tone?: "default" | "amber";
  gap?: 2 | 3;
}>();

const toggle = defineModel<boolean>("toggle", { default: false });
</script>
