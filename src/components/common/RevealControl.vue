<template>
  <!--
    The single reveal control (#750).

    Before this there were four: `PlayerVisibilityToggle`, two separate mobile
    bottom sheets, `RevealedFieldsPanel`, and eight ad-hoc popovers written into
    individual list and sheet views. NPCs alone used four of them, monsters had
    one only on mobile, and two surfaces had none at all — so "share this with
    my players" looked and behaved differently depending on where you happened
    to be standing.

    One button, one body, two presentations: a popover on pointer-and-space,
    a bottom sheet where a popover would be cramped. The body is identical, so
    the thing a DM learns once holds everywhere.
  -->
  <div ref="containerRef" class="relative">
    <AppButton
      :variant="state === 'private' ? 'subtle' : 'tinted'"
      :tone="state === 'private' ? undefined : 'primary'"
      :emphasis="state === 'everyone' ? 'strong' : 'soft'"
      :size="overlay ? 'icon-sm' : 'sm'"
      :class="overlay ? 'bg-background/85 shadow-sm backdrop-blur-sm' : undefined"
      :icon="state === 'private' ? IconHide : IconReveal"
      :label="overlay ? undefined : label"
      :title="title"
      :aria-label="overlay ? title : undefined"
      :aria-expanded="open"
      aria-haspopup="dialog"
      @click="toggleOpen"
    />

    <!-- Pointer presentation -->
    <div
      v-if="open && !useSheet"
      class="absolute z-50 w-64 overflow-hidden rounded-lg border border-border bg-popover shadow-lg"
      :class="[openUpward ? 'bottom-full mb-1' : 'top-full mt-1', openLeftward ? 'left-0' : 'right-0']"
      role="dialog"
      :aria-label="title"
    >
      <RevealBody
        :party="party"
        :adapter="adapter"
        :state="state"
        @close="open = false"
      >
        <slot name="what" />
      </RevealBody>
    </div>

    <!-- Small-screen presentation: same body, room to breathe -->
    <MobileSheet v-if="useSheet" v-model:open="open" :title="title">
      <RevealBody
        :party="party"
        :adapter="adapter"
        :state="state"
        @close="open = false"
      >
        <slot name="what" />
      </RevealBody>
    </MobileSheet>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import MobileSheet from "@/components/common/MobileSheet.vue";
import RevealBody from "@/components/common/RevealBody.vue";
import { useParty } from "@/composables/useParty";
import { IconHide, IconReveal } from "@/lib/icons";
import { revealLabel, revealState } from "@/lib/reveal";
import type { RevealAdapter } from "@/lib/reveal";

const { adapter, entityName, form = "button" } = defineProps<{
  /** Bridges whichever storage model this entity uses. See `lib/reveal`. */
  adapter: RevealAdapter;
  /** Used in the control's title and the sheet's heading. */
  entityName?: string;
  /**
   * The two shapes this control comes in. Deliberately an enum rather than
   * loose size/label props: the point of one reveal control is that a DM
   * recognises it instantly, and nineteen call sites each choosing their own
   * size and label is how the previous four variants came about.
   *
   *   button  — icon plus the current audience ("Hidden", "3 players",
   *             "Whole party"). For detail headers and action rows, where
   *             there is room to say what the state actually is.
   *   overlay — icon only, on a translucent backdrop so it stays legible on
   *             top of artwork. For list cards and gallery tiles, where it
   *             sits over an image and a word would cover the art.
   */
  form?: "button" | "overlay";
}>();

const overlay = computed(() => form === "overlay");

const { data: partyData } = useParty();
const party = computed(() => partyData.value ?? []);
const partyIds = computed(() => party.value.map((m) => m.id));

const state = computed(() => revealState(partyIds.value, adapter.isMemberVisible));
const sharedCount = computed(() => partyIds.value.filter(adapter.isMemberVisible).length);
const label = computed(() => revealLabel(state.value, sharedCount.value));

const title = computed(() =>
  entityName ? `Reveal ${entityName} to players` : "Reveal to players",
);

const open = ref(false);
const containerRef = ref<HTMLElement | null>(null);

/**
 * Presentation follows the pointer, not the entity. A popover anchored to a
 * button is wrong on a narrow screen — it lands half off-viewport and the touch
 * targets inside are too small — so below `md` the same body opens as a sheet.
 */
const useSheet = ref(false);
const media = typeof window !== "undefined" ? window.matchMedia("(max-width: 47.9375rem)") : null;
function syncPresentation() {
  useSheet.value = media?.matches ?? false;
}

const POPOVER_W = 256;
const POPOVER_H_EST = 320;
const openUpward = ref(false);
const openLeftward = ref(false);

function computePosition() {
  const el = containerRef.value;
  if (!el) return;
  const rect = el.getBoundingClientRect();
  openUpward.value =
    window.innerHeight - rect.bottom < POPOVER_H_EST && rect.top > window.innerHeight - rect.bottom;
  openLeftward.value = rect.right < POPOVER_W && window.innerWidth - rect.left >= POPOVER_W;
}

function toggleOpen() {
  if (!open.value) {
    syncPresentation();
    computePosition();
  }
  open.value = !open.value;
}

function onOutsideClick(event: MouseEvent) {
  if (useSheet.value) return; // the sheet owns its own dismissal
  if (containerRef.value && !containerRef.value.contains(event.target as Node)) open.value = false;
}

onMounted(() => {
  syncPresentation();
  media?.addEventListener("change", syncPresentation);
  document.addEventListener("mousedown", onOutsideClick);
});
onUnmounted(() => {
  media?.removeEventListener("change", syncPresentation);
  document.removeEventListener("mousedown", onOutsideClick);
});
</script>
