<template>
  <textarea
    v-if="wrap"
    ref="el"
    rows="1"
    data-field="input"
    data-wrap
    :data-field-size="size"
    :data-field-tone="tone"
    :value="model"
    :disabled="disabled"
    :readonly="readonly"
    :placeholder="placeholder"
    :class="cn(fieldClass, 'block resize-none overflow-hidden [field-sizing:content]')"
    @input="onInput"
    @change="onChange"
    @keydown.enter.prevent="onEnter"
  />
  <input
    v-else
    ref="el"
    data-field="input"
    :data-field-size="size"
    :data-field-tone="tone"
    :value="model"
    :type="type"
    :disabled="disabled"
    :readonly="readonly"
    :placeholder="placeholder"
    :class="fieldClass"
    @input="onInput"
    @change="onChange"
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
 * `v-model.number`, `v-model.trim` and `v-model.lazy` all work as they do on a
 * native input — the modifiers are read off defineModel and applied on commit,
 * because a component that ignores them would silently hand a numeric field a
 * string, or fire a parse on every keystroke.
 *
 * `.lazy` is not decoration. Twenty-one inputs across ten files bind `:value`
 * plus `@change`/`@blur` by hand precisely because they must NOT commit per
 * keystroke: a level field that parses "STR" one letter at a time collapses it
 * before the word exists, and a tiptap toolbar that writes on every keypress
 * moves the image while you are still typing the number. Without this modifier
 * those sites could not use the primitive at all — three separate agents in the
 * #648 sweep reached them independently and each correctly refused to convert.
 *
 * `wrap` is for a field that holds one whole sentence (a canon truth, a clue, a
 * step). It renders a one-row <textarea> that grows with its text, so nothing is
 * cut off, with the same chrome and padding as the one-line input. It is still
 * ONE paragraph: Enter (and Shift+Enter) commits like a native input instead of
 * adding a line, and pasted line breaks become single spaces. `type` is ignored
 * and `.number` is not supported in wrap mode. `el` is then a textarea; reach for
 * `focus()` / `select()` rather than the element if the difference matters.
 */
import { computed, nextTick, onMounted, useTemplateRef, watch, type HTMLAttributes } from "vue";
import { cn } from "@/lib/utils";
import { fieldVariants, type FieldTone, type FieldSize, type FieldShape } from "./fieldVariants";

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
const [model, modifiers] = defineModel<T, "number" | "trim" | "lazy">({
  required: true,
});

const {
  type = "text",
  size = "sm",
  tone = "default",
  align = "left",
  shape = "default",
  block = true,
  wrap = false,
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
  /** `pill` rounds the field fully — the mobile search bars. */
  shape?: FieldShape;
  block?: boolean;
  /** One-paragraph text that wraps and grows instead of clipping; see the docblock. */
  wrap?: boolean;
  disabled?: boolean;
  readonly?: boolean;
  placeholder?: string;
  class?: HTMLAttributes["class"];
}>();

const alignClass = computed(() =>
  align === "center" ? "text-center" : align === "right" ? "text-right" : "",
);

const fieldClass = computed(() =>
  cn(fieldVariants({ tone, size, control: "input", shape }), alignClass.value, block ? "w-full" : "", className),
);

/**
 * `.lazy` swaps which DOM event commits. `change` covers both ways a field is
 * finished — blurring it and pressing Enter — which is why the hand-rolled sites
 * that listened for `@blur` *and* `@keydown.enter` need only this one.
 */
function onInput(event: Event) {
  if (wrap) collapseBreaks(event.target as HTMLTextAreaElement);
  fit();
  if (!modifiers.lazy) commit(event);
}

/** A statement is one paragraph: a pasted line break becomes a single space. */
function collapseBreaks(field: HTMLTextAreaElement) {
  const flat = field.value.replace(/\s*[\r\n]+\s*/g, " ");
  if (flat !== field.value) field.value = flat;
}

/** Enter finishes the field the way a native input does; `change` is what `.lazy` listens to. */
function onEnter(event: KeyboardEvent) {
  const field = event.target as HTMLTextAreaElement;
  if (modifiers.lazy) commit(event);
  field.blur();
}

function onChange(event: Event) {
  if (modifiers.lazy) commit(event);
}

function commit(event: Event) {
  const typed = (event.target as HTMLInputElement).value;
  const raw = wrap ? typed.replace(/\s*[\r\n]+\s*/g, " ") : typed;
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

/**
 * Browsers without `field-sizing: content` (older Firefox and Safari) get the
 * height from the content here instead. Where the CSS does it, this does nothing.
 */
const sizesItself = typeof CSS !== "undefined" && typeof CSS.supports === "function" && CSS.supports("field-sizing", "content");
function fit() {
  const field = el.value;
  if (!wrap || sizesItself || !field) return;
  field.style.height = "auto";
  field.style.height = `${field.scrollHeight + (field.offsetHeight - field.clientHeight)}px`;
}
onMounted(fit);
watch(model, () => nextTick(fit));
defineExpose({
  el,
  focus: (options?: FocusOptions) => el.value?.focus(options),
  select: () => el.value?.select(),
});
</script>
