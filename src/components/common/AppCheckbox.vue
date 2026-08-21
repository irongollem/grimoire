<template>
  <label
    :class="
      cn(
        'flex gap-2',
        effectiveAlign === 'start' ? 'items-start' : 'items-center',
        disabled ? 'cursor-not-allowed' : 'cursor-pointer',
        className,
      )
    "
  >
    <input
      ref="el"
      type="checkbox"
      v-bind="$attrs"
      :checked="isChecked"
      :disabled="disabled"
      :class="checkboxBoxVariants({ size, align: effectiveAlign, accent })"
      @change="onChange"
    />
    <span v-if="hint" class="flex flex-col gap-0.5">
      <span :class="labelClasses">
        <slot>{{ label }}</slot>
      </span>
      <span class="text-caption text-muted-foreground">{{ hint }}</span>
    </span>
    <span v-else-if="label || $slots.default" :class="labelClasses">
      <slot>{{ label }}</slot>
    </span>
  </label>
</template>

<script setup lang="ts" generic="T extends boolean | string[]">
/**
 * Native checkbox with the app's one box recipe and a role-keyed label (#751).
 * Replaces the 100 raw `<input type="checkbox">` sites whose boxes had
 * drifted into twelve visual states — the primitive rule's "checkbox carries
 * no chrome" carve-out, measured, was false.
 *
 * The control stays a native input on purpose: free keyboard/label/screen-
 * reader behaviour, and `accent-color` handles the theme. Only the recipe is
 * owned here.
 *
 * Array models: bound to a `string[]`, this behaves like Vue's native
 * checkbox-group binding — `value` names this box's entry, checking adds it,
 * unchecking removes it. Bound to a boolean it is a plain toggle and `value`
 * is unused.
 *
 * `class` styles the wrapping label (layout: flex-1, truncate, justify);
 * `label-class` styles the label TEXT — override one token there (the amber
 * journal tint, a group-hover colour), never re-declare the role.
 *
 * Deliberately NOT converted to this component:
 * - `EventModalTravelFields.vue`'s travel chip — its checkbox is `sr-only`
 *   inside a fully-styled chip label; the visible control is the chip, so
 *   AppCheckbox's box recipe has nothing to own there.
 * - `type="radio"` and `type="file"` inputs — still the raw-input exception
 *   in CLAUDE.md; this component narrowed that exception, not removed it.
 */
import { computed, useTemplateRef, type HTMLAttributes } from "vue";
import { cn } from "@/lib/utils";
import {
  checkboxBoxVariants,
  checkboxLabelVariants,
  type CheckboxAccent,
  type CheckboxAlign,
  type CheckboxLabelLayout,
  type CheckboxLabelRole,
  type CheckboxLabelTone,
  type CheckboxLabelWeight,
  type CheckboxSize,
} from "./checkboxVariants";

defineOptions({ inheritAttrs: false });

// Generic so `v-model` on a `ref<boolean>` stays boolean-typed and an array
// site stays `string[]` — a union model would force every boolean call site
// to accept string[] in its ref, which is a lie at 97 of the 100 sites.
//
// The model stays strictly `boolean | string[]` — NOT `| undefined`. Four call
// sites bind an optional flag (`fx.dcAddTracker?`, `d.isLeapOnly?`,
// `local.titleScrim?`); they spell the tri-state → binary conversion out at the
// site with `:model-value="x ?? false"` rather than having it widen the emit
// payload here, which would hand every one of the other sites a
// `boolean | undefined` their handlers would then have to re-narrow.
const model = defineModel<T>({ required: true });

const {
  label,
  labelRole = "body",
  labelWeight,
  labelTone,
  labelLayout = "inline",
  size = "md",
  align = "center",
  accent = "primary",
  hint,
  value,
  disabled = false,
  class: className,
  labelClass,
} = defineProps<{
  /** Plain-text label. For rich labels (nested markup, conditional colour)
   *  use the default slot instead. */
  label?: string;
  /** #552 typography role for the label text — see checkboxVariants. */
  labelRole?: CheckboxLabelRole;
  /** #552 typography role for the label text — see checkboxVariants. */
  labelWeight?: CheckboxLabelWeight;
  /** Overrides the role's bundled colour. */
  labelTone?: CheckboxLabelTone;
  /** `row` makes the label a flex row for slot content with trailing meta. */
  labelLayout?: CheckboxLabelLayout;
  size?: CheckboxSize;
  /** `start` aligns the box to the first line of a multi-line label.
   *  A `hint` forces this automatically. */
  align?: CheckboxAlign;
  /** Tick colour — `gold` and `amber` are named theming cohorts, see
   *  checkboxVariants. */
  accent?: CheckboxAccent;
  /** Caption line under the label. */
  hint?: string;
  /** This box's entry in a `string[]` model. Unused for boolean models. */
  value?: string;
  disabled?: boolean;
  class?: HTMLAttributes["class"];
  labelClass?: HTMLAttributes["class"];
}>();

const labelClasses = computed(() =>
  cn(
    checkboxLabelVariants({
      labelRole,
      weight: labelWeight,
      tone: labelTone,
      layout: labelLayout,
    }),
    labelClass,
  ),
);

const effectiveAlign = computed<CheckboxAlign>(() =>
  hint || align === "start" ? "start" : "center",
);

const isChecked = computed(() =>
  Array.isArray(model.value)
    ? value !== undefined && model.value.includes(value)
    : model.value,
);

function onChange(event: Event) {
  const checked = (event.target as HTMLInputElement).checked;
  if (Array.isArray(model.value)) {
    if (value === undefined) return;
    const next = checked
      ? [...model.value, value]
      : model.value.filter((entry) => entry !== value);
    model.value = next as T;
  } else {
    model.value = checked as T;
  }
}

// A bare `ref` on this component would resolve to the component instance, so
// `boxRef.value?.focus()` at a call site would silently do nothing. Expose the
// element and the method callers actually reach for.
const el = useTemplateRef<HTMLInputElement>("el");
defineExpose({
  el,
  focus: (options?: FocusOptions) => el.value?.focus(options),
});
</script>
