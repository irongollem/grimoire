<template>
  <slot v-if="!selecting" />
  <div v-else class="relative" @click.capture.prevent.stop="emit('toggle')">
    <slot />
    <div
      :class="[CARD_OVERLAY_SCRIM, ICON_TOUCH_TARGET, CORNER[corner], 'absolute z-10 flex items-center justify-center rounded-full']"
    >
      <AppCheckbox :model-value="selected" aria-label="Select for bulk actions" />
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * Selection wrapper for a grid card (#875). Not merged into the card
 * components themselves so any list can opt a card into bulk selection
 * without touching its markup.
 *
 * `selecting === false` renders the default slot alone — no wrapping element,
 * no listener of any kind — so the card's own navigation (a RouterLink, a
 * click-to-open handler) behaves exactly as if this wrapper did not exist.
 *
 * `selecting === true` adds a capturing click interceptor on the wrapper:
 * `.prevent` stops the click's default action, which is what would otherwise
 * toggle the checkbox's own `checked` state and fire its `change` event, so a
 * click anywhere in the card — including directly on the checkbox — emits
 * `toggle` exactly once rather than twice. `.stop` keeps the card's own click
 * handlers (navigation) from ever seeing the event while selecting is on.
 *
 * The corner chip reuses the existing card-overlay idiom
 * (`CARD_OVERLAY_SCRIM` + `ICON_TOUCH_TARGET` from `appButtonVariants.ts`)
 * rather than inventing a new one — the same recipe `NpcGridCard`/
 * `RevealControl` use for a corner action, sized for touch below `md`.
 *
 * `corner` exists because the card under this wrapper already owns its own
 * corners and they differ per list: `EntityGridCard` puts its rarity badge at
 * `top-2 right-2` (`EntityGridCard.vue:55`), so a chip there covered 9-15px of
 * "Very Rare"/"Legendary" on every Vault card; a monster card instead carries
 * its reveal control top-left. The caller names the corner its own card leaves
 * free — measured, per the overlay-chip rule, not guessed.
 */
import AppCheckbox from "@/components/common/AppCheckbox.vue";
import { CARD_OVERLAY_SCRIM, ICON_TOUCH_TARGET } from "@/components/common/appButtonVariants";

const { selected, selecting, corner = "top-left" } = defineProps<{
  selected: boolean;
  selecting: boolean;
  /** Which corner of the card the checkbox chip sits in. Name the one this
   *  list's card leaves free. */
  corner?: keyof typeof CORNER;
}>();

// Static strings: Tailwind only emits classes it can read.
const CORNER = {
  "top-left": "top-2 left-2",
  "top-right": "top-2 right-2",
  "bottom-left": "bottom-2 left-2",
  "bottom-right": "bottom-2 right-2",
} as const;

const emit = defineEmits<{ toggle: [] }>();
</script>
