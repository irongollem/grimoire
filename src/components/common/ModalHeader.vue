<template>
  <header :class="cn('flex shrink-0 items-start gap-3 border-b border-border px-5 py-4', headerClass)">
    <!--
      Decorative, and marked so. The circle repeats what the title already says
      — a warning triangle beside "Are you sure?" — and a screen reader that
      announces both reads the dialog twice over.
    -->
    <div
      v-if="icon"
      aria-hidden="true"
      class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
      :class="HEADER_TONE_CIRCLE[tone]"
    >
      <component :is="icon" class="h-4.5 w-4.5" />
    </div>

    <div class="min-w-0 flex-1">
      <!--
        `text-heading-sm` rather than the `font-cinzel text-sm … tracking-wide`
        these dialogs each hand-rolled: the role token already carries Cinzel,
        and it deliberately carries no tracking, because letter-spacing belongs
        to the small uppercase label roles and not to headings (#552).
      -->
      <h2 :id="titleId" class="truncate text-heading-sm font-bold text-foreground">
        {{ title }}
      </h2>
      <p v-if="subtitle" :id="subtitleId" class="mt-0.5 text-muted-foreground" :class="HEADER_SUBTITLE_ROLES[subtitleRole]">
        {{ subtitle }}
      </p>
    </div>

    <div v-if="closeable || $slots.actions" class="flex shrink-0 items-center gap-2">
      <slot name="actions" />
      <AppButton
        v-if="closeable"
        variant="ghost"
        size="icon-xs"
        icon-size="md"
        :icon="IconClose"
        aria-label="Close"
        @click="emit('close')"
      />
    </div>
  </header>
</template>

<script setup lang="ts">
/**
 * The title bar of a dialog: an optional tinted icon, the name, an optional
 * line of "what this is", and the close control.
 *
 * Extracted in #753, after #746 put twelve dialogs on `AppModal` and made it
 * obvious that the shell stops exactly where the duplication starts — nine of
 * them then opened with the same twenty lines, differing only in icon, tint and
 * title.
 *
 * ## It names the dialog for you
 *
 * The heading's id is registered upward through `modalAria`, so the surrounding
 * `AppModal` picks up `aria-labelledby` (and `aria-describedby` from the
 * subtitle) without the call site passing anything. That is the point of the
 * component as much as the markup is: an unnamed dialog is invisible as a bug —
 * it looks perfect and reads as an anonymous "dialog" to a screen reader — so
 * the wiring has to be something you get by default rather than remember.
 *
 * Used outside a modal it is simply a heading block; the registration is a
 * no-op.
 */
import { onScopeDispose, useId, watchEffect, type Component } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import { IconClose } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { useModalAria } from "./modalAria";
import {
  HEADER_SUBTITLE_ROLES,
  HEADER_TONE_CIRCLE,
  type HeaderSubtitleRole,
  type HeaderTone,
} from "./modalHeaderVariants";

const {
  title,
  subtitle,
  subtitleRole = "caption",
  icon,
  tone = "gold",
  closeable = false,
  headerClass,
} = defineProps<{
  title: string;
  /** The "what this is" line. Becomes the dialog's `aria-describedby`. */
  subtitle?: string;
  subtitleRole?: HeaderSubtitleRole;
  /** Decorative glyph for the tinted circle. Omit for a bare title. */
  icon?: Component;
  tone?: HeaderTone;
  /** Show the × control. Dialogs answered by their footer buttons do not. */
  closeable?: boolean;
  headerClass?: string;
}>();

const emit = defineEmits<{ close: [] }>();

const titleId = useId();
const subtitleId = useId();

// Registered rather than emitted: the ids have to reach the panel element,
// which is this component's ancestor, and an ancestor cannot read a child prop.
//
// In an effect rather than read once, because a subtitle often arrives late —
// an entity's identity line is a `computed` over a query. Registered eagerly it
// would describe the dialog with an element that does not exist yet, which is
// worse than not describing it at all: `aria-describedby` pointing at a missing
// id is skipped silently.
const aria = useModalAria();
if (aria) {
  watchEffect(() => {
    aria.labelledBy.value = titleId;
    aria.describedBy.value = subtitle ? subtitleId : null;
  });

  // Withdrawn on the way out, because the registry outlives any one header: an
  // `AppModal` mounted once and reused — `ConfirmDialog` lives in `App.vue` —
  // would otherwise keep pointing at the id of a heading that has been removed,
  // which is the "worse than absent" case above.
  //
  // Guarded on the id still being ours so a header that replaces another does
  // not have its fresh registration wiped by the outgoing one's teardown, which
  // runs after the newcomer has already registered.
  onScopeDispose(() => {
    if (aria.labelledBy.value === titleId) aria.labelledBy.value = null;
    if (aria.describedBy.value === subtitleId) aria.describedBy.value = null;
  });
}
</script>
