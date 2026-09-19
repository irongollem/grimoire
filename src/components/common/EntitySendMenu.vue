<template>
  <!--
    `flex`, not a plain block: AppButton (via PageHeaderAction) renders
    inline-flex, and an inline-level child sits on a text baseline — a block
    wrapper would leave a descender gap under the trigger that only shows up
    once this sits in a row of buttons someone else placed (see
    RunnerPcWildshape / RevealControl, which hit the same thing).
  -->
  <div ref="triggerRef" class="flex w-fit">
    <PageHeaderAction
      label="Send to…"
      :icon="IconSend"
      :icon-right="IconChevronDown"
      :aria-expanded="open"
      aria-haspopup="dialog"
      @click="open = !open"
    />
  </div>

  <!--
    Teleported to `body` rather than absolutely positioned under the trigger.
    `PageHeader`'s header section is `overflow-x-hidden`, and per CSS a
    `visible` overflow on one axis computes to `auto` when the other axis is
    not `visible` — so the header is a scroll container on the vertical axis
    too, and an absolutely-positioned panel hanging below the trigger gets
    clipped by it. `useAnchoredPopover` positions against the trigger's
    viewport rect instead, so clipping never enters into it.

    The two destinations are fixed rather than slot-driven: every entity
    editor in the app carries exactly this pair (Scriptorium export, copy to
    another campaign), so there is nothing here for a slot to vary.

    `role="dialog"` with a label, not `role="menu"`, and the same on the
    trigger's `aria-haspopup` — deliberately the shape `RevealControl` already
    uses for its teleported panel. An ARIA menu is a promise of roving arrow-key
    focus, which this does not implement; two ordinary tab-reachable buttons in
    a labelled panel is what is actually here, so that is what it says.
  -->
  <Teleport to="body">
    <div
      v-if="open"
      ref="floatingRef"
      :style="floatingStyle"
      class="z-300 w-56 overflow-hidden rounded-md border border-border bg-popover py-1 shadow-lg"
      role="dialog"
      aria-label="Send to…"
    >
      <AppButton
        variant="menu"
        size="sm"
        block
        class="rounded-none"
        :disabled="sendingToScriptorium"
        :label="sendingToScriptorium ? 'Exporting…' : 'Send to Scriptorium'"
        @click="onScriptorium"
      >
        <template #icon>
          <IconScrollText class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </template>
      </AppButton>
      <AppButton
        variant="menu"
        size="sm"
        block
        class="rounded-none"
        label="Copy to campaign…"
        @click="onCopy"
      >
        <template #icon>
          <IconCopy class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </template>
      </AppButton>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
/**
 * The header's "put this record somewhere else" menu — one trigger collecting
 * the two actions ("Send to Scriptorium", "Copy to campaign…") that every
 * entity detail header used to carry as two separate buttons standing side by
 * side. Purely a menu: it performs no mutation itself, the call site owns
 * both actions via `@scriptorium` / `@copy`.
 *
 * Labels are copied verbatim from the phone's overflow sheet
 * (`NpcEditMobile.vue`), which already names these two actions — an action
 * keeps the same name on every surface it appears on.
 */
import { ref } from "vue";
import AppButton from "./AppButton.vue";
import PageHeaderAction from "./PageHeaderAction.vue";
import { useAnchoredPopover } from "@/composables/useAnchoredPopover";
import { IconChevronDown, IconCopy, IconScrollText, IconSend } from "@/lib/icons";

const { sendingToScriptorium = false } = defineProps<{
  sendingToScriptorium?: boolean;
}>();

const emit = defineEmits<{
  scriptorium: [];
  copy: [];
}>();

const open = ref(false);
const triggerRef = ref<HTMLElement | null>(null);
const { floatingRef, floatingStyle } = useAnchoredPopover(triggerRef, open, () => {
  open.value = false;
});

function onScriptorium() {
  open.value = false;
  emit("scriptorium");
}

function onCopy() {
  open.value = false;
  emit("copy");
}
</script>
