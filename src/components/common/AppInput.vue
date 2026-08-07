<template>
  <input
    :value="model"
    :type="type"
    :disabled="disabled"
    :readonly="readonly"
    :placeholder="placeholder"
    :class="cn(base, toneClass, sizeClass, alignClass, block ? 'w-full' : '', className)"
    @input="onInput"
  />
</template>

<script setup lang="ts">
/**
 * Native <input> with the app's chrome on it (#561) — the ~34 sites that each
 * re-declared `bg-background border border-border rounded-md … font-cinzel
 * focus:ring-1 focus:ring-ring` inline.
 *
 * This is Cinzel-faced input: names, counters, dice quantities, currency. Prose
 * fields belong in RichTextEditor, not here.
 *
 * `v-model.number` and `v-model.trim` work as they do on a native input — the
 * modifiers are read off defineModel and applied in `onInput`, because a component
 * that ignores them would silently hand a numeric field a string.
 */
import { computed, type HTMLAttributes } from "vue";
import { cn } from "@/lib/utils";

const [model, modifiers] = defineModel<string | number | null, "number" | "trim">({
  required: true,
});

const {
  type = "text",
  size = "sm",
  tone = "default",
  align = "left",
  block = true,
  disabled = false,
  readonly = false,
  placeholder,
  class: className,
} = defineProps<{
  type?: "text" | "number" | "search" | "url" | "email" | "password";
  size?: "xs" | "sm" | "md" | "lg";
  /** Surface it sits on: `default` on a page, `muted` inside a card, `bare` for inline edits. */
  tone?: "default" | "muted" | "bare";
  align?: "left" | "center";
  block?: boolean;
  disabled?: boolean;
  readonly?: boolean;
  placeholder?: string;
  class?: HTMLAttributes["class"];
}>();

const base =
  "font-cinzel text-foreground placeholder:text-muted-foreground transition-colors focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed";

const toneClass = computed(() => {
  switch (tone) {
    case "muted":
      return "bg-muted/40 border border-border focus:ring-1 focus:ring-ring";
    case "bare":
      return "bg-transparent border-0 focus:ring-0";
    case "default":
    default:
      return "bg-background border border-border focus:ring-1 focus:ring-ring";
  }
});

const sizeClass = computed(() => {
  switch (size) {
    case "xs":
      return "rounded px-1.5 py-0.5 text-label";
    // min-h-11 is a ≥44px tap target on touch; ≥md reverts so desktop is unchanged.
    case "md":
      return "rounded-md px-3 py-2 min-h-11 md:min-h-0 text-label-lg";
    case "lg":
      return "rounded-md px-3 py-2 text-sm tracking-wider";
    case "sm":
    default:
      return "rounded-md px-3 py-1.5 text-label-lg";
  }
});

const alignClass = computed(() => (align === "center" ? "text-center" : ""));

function onInput(event: Event) {
  const raw = (event.target as HTMLInputElement).value;
  if (modifiers.number) {
    // An empty numeric field is absent, not zero — `?? 0` here would silently
    // turn a cleared box into a real value the user never typed.
    model.value = raw === "" ? null : Number(raw);
    return;
  }
  model.value = modifiers.trim ? raw.trim() : raw;
}
</script>
