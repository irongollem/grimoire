<template>
  <AppModal
    :open="open"
    :size="size"
    :origin-key="originKey"
    :labelled-by="headingId"
    panel-class="h-[min(48rem,calc(100dvh-2rem))]"
    @close="dismiss"
    @after-leave="emit('close')"
  >
    <!-- Header — name, what it is, whatever the entity wants to offer, close. -->
    <header class="flex shrink-0 items-start gap-3 border-b border-border px-5 py-4">
      <div class="min-w-0 flex-1">
        <h2 :id="headingId" class="truncate font-cinzel text-lg font-bold tracking-wide text-foreground">
          {{ title }}
        </h2>
        <p v-if="subtitle" class="truncate text-body text-muted-foreground italic">
          {{ subtitle }}
        </p>
      </div>

      <div class="flex shrink-0 items-center gap-2">
        <slot name="actions" />
        <AppButton
          variant="ghost"
          size="icon-sm"
          :icon="IconClose"
          tooltip="Close"
          aria-label="Close"
          @click="dismiss"
        />
      </div>
    </header>

    <!--
      `overscroll-contain`: without it, scrolling past the end of this body hands
      the remaining wheel travel to whatever is behind the backdrop, so the list
      the modal is sitting on creeps away underneath it.

      `contained` mirrors PageHeader's prop of the same name and means the same
      thing: the body's content is a two-column layout that scrolls its own
      columns, so a scroller here would be a second one wrapped around it. It
      only applies from `lg`, because that is where those layouts become two
      columns — a tablet gets the stacked version, which needs this scroller.
    -->
    <div
      class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4"
      :class="contained ? 'lg:overflow-hidden' : ''"
    >
      <div v-if="loading" class="flex justify-center py-16">
        <LoadingSpinner />
      </div>
      <slot v-else />
    </div>
  </AppModal>
</template>

<script setup lang="ts">
/**
 * An entity's read view, presented over the list it came from.
 *
 * The chrome is deliberately entity-shaped rather than NPC-shaped — a name, a
 * one-line "what this is", a row for whatever actions that entity offers, and a
 * scrolling body — because every list grid in the app has the same detail
 * problem and `EntityGridCard` is already shared between them. Adopting this
 * for monsters is a route change and a different body, not a second modal.
 *
 * ## Mounted is open
 *
 * There is no `open` prop, because a route-driven modal has no state to track:
 * the route matched, so the modal exists. What that does cost is an exit — a
 * route change unmounts this component outright, and an unmounted `<Transition>`
 * has nothing left to animate, so the panel would simply blink out.
 *
 * Hence the local flag. Dismissal lowers it, the panel animates away, and only
 * then does `close` reach the caller to do the navigating. The caller stays
 * declarative ("closing means going back to the list") and never learns that an
 * animation was involved.
 */
import { nextTick, onMounted, ref, useId } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import AppModal from "@/components/common/AppModal.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import { IconClose } from "@/lib/icons";

const { title, subtitle, loading, contained, originKey, size = "xl" } = defineProps<{
  title: string;
  /** The "what this is" line — species and occupation, size and type. */
  subtitle?: string;
  loading?: boolean;
  /** The body owns its own desktop scrolling — see the note in the template. */
  contained?: boolean;
  /** Route this modal was opened towards, so it can fly out of its card. */
  originKey?: string;
  size?: "lg" | "xl" | "full";
}>();

const emit = defineEmits<{
  /** The panel is gone. Navigate now. */
  close: [];
}>();

// Names the dialog for screen readers without the caller having to invent an
// id, and stays unique if two of these ever exist at once.
const headingId = useId();

const open = ref(false);

// Raised a tick after mount so the panel appears as a change rather than as the
// initial render — a `<Transition>` only animates the former.
onMounted(() => void nextTick(() => { open.value = true; }));

function dismiss() {
  open.value = false;
}
</script>
