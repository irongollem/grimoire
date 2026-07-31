<template>
  <!--
    Renders nothing without a trigger, so call sites can drop it in
    unconditionally rather than guarding every one of them.
  -->
  <span
    v-if="trigger !== null"
    class="group/chip inline-flex min-w-0 max-w-full items-center rounded-sm border border-burgundy-400 bg-burgundy-500"
    :class="small ? 'gap-0.5 px-1 py-px' : 'gap-1 px-1.5 py-0.5'"
    :title="`Started by ${trigger.kind}: ${trigger.label}`"
  >
    <IconFire :class="small ? 'h-2.5 w-2.5' : 'h-3 w-3'" class="shrink-0 text-gold-100" />
    <span
      class="truncate font-cinzel font-bold tracking-wide text-gold-100"
      :class="small ? 'text-2xs' : 'text-xs'"
    >
      {{ trigger.label }}
    </span>
    <!--
      Seeing why is only half of it. The other half is being able to undo it
      from the place you saw it, so the release lives on the chip rather than
      sending the DM back to find the encounter.
    -->
    <button
      v-if="releasable"
      type="button"
      class="shrink-0 text-gold-100 opacity-40 transition-opacity [@media(hover:hover)]:opacity-0 group-hover/chip:opacity-100 focus-visible:opacity-100"
      title="Release this trigger — hands the slot back to what was playing before"
      @click.stop="release"
    >
      <IconClose :class="small ? 'h-2.5 w-2.5' : 'h-3 w-3'" />
    </button>
  </span>
</template>

<script setup lang="ts">
import { IconClose, IconFire } from "@/lib/icons";
import { releaseAudioTheme } from "@/lib/audio/audioTriggers";
import type { ActiveTrigger } from "@/composables/useAudioThemeTriggers";

/**
 * "This is playing because something in the campaign asked for it."
 *
 * Burgundy is reserved for exactly this meaning across the whole soundboard.
 * The three category hues are spoken for, so a fourth colour reads as "a
 * different kind of thing" rather than as a fifth category.
 */

const { trigger, small = false, releasable = true } = defineProps<{
  trigger: ActiveTrigger | null;
  /** Denser variant for pads and widget rows. */
  small?: boolean;
  /** Set false where releasing would be confusing, e.g. a read-only list. */
  releasable?: boolean;
}>();

function release(): void {
  if (trigger === null) return;
  // The same release the producer would have called, so the slot hands back to
  // whatever preceded it rather than simply going quiet.
  releaseAudioTheme(trigger.sourceId);
}
</script>
