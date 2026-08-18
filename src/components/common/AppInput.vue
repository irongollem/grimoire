<template>
  <input
    ref="el"
    :value="model"
    :type="type"
    :disabled="disabled"
    :readonly="readonly"
    :placeholder="placeholder"
    :class="cn(fieldVariants({ tone, size, control: 'input' }), alignClass, block ? 'w-full' : '', className)"
    @input="onInput"
  />
</template>

<script setup lang="ts" generic="T extends string | number | null | undefined">
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
import { computed, useTemplateRef, type HTMLAttributes } from "vue";
import { cn } from "@/lib/utils";
import { fieldVariants, type FieldTone, type FieldSize } from "./fieldVariants";

/**
 * Generic over the value type, for the same reason AppSelect is: a great many
 * fields behind this component are optional in the domain (`fx.value?`,
 * `entry.currency_label?`, `lvl.color?`), and a model fixed to
 * `string | number | null` cannot express that. Three separate call sites in the
 * #648 sweep independently grew their own bridging — `?? ''` here, a pair of
 * `numOrUndef`/`strOrUndef` helpers there — which is the hand-rolling this
 * component exists to stop, one layer up. Widening the *constraint* rather than
 * the model keeps each call site's own type intact: a `Ref<string>` site still
 * resolves `T` to `string` and still cannot be handed `undefined`.
 */
const [model, modifiers] = defineModel<T, "number" | "trim">({
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
  size?: FieldSize;
  /** Surface it sits on — see fieldVariants. */
  tone?: FieldTone;
  align?: "left" | "center" | "right";
  block?: boolean;
  disabled?: boolean;
  readonly?: boolean;
  placeholder?: string;
  class?: HTMLAttributes["class"];
}>();

const alignClass = computed(() =>
  align === "center" ? "text-center" : align === "right" ? "text-right" : "",
);

function onInput(event: Event) {
  const raw = (event.target as HTMLInputElement).value;
  if (modifiers.number) {
    // An empty numeric field is absent, not zero — `?? 0` here would silently
    // turn a cleared box into a real value the user never typed.
    model.value = (raw === "" ? null : Number(raw)) as T;
    return;
  }
  model.value = (modifiers.trim ? raw.trim() : raw) as T;
}

// A bare `ref` on this component would resolve to the component instance, so the
// very common `nextTick(() => inputRef.value?.focus())` after revealing an inline
// editor would silently do nothing. Expose the element and the methods callers
// actually reach for.
const el = useTemplateRef<HTMLInputElement>("el");
defineExpose({
  el,
  focus: (options?: FocusOptions) => el.value?.focus(options),
  select: () => el.value?.select(),
});
</script>
