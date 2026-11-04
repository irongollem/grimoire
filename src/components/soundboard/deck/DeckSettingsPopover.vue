<template>
  <div class="relative inline-flex">
    <AppButton
      ref="pip"
      variant="ghost"
      size="icon-sm"
      class="pointer-coarse:size-11"
      :icon="IconSettings"
      aria-label="Deck settings"
      tooltip="Deck settings: Simple or Full, size, peek"
      :aria-expanded="open"
      aria-haspopup="dialog"
      @click="open = !open"
    />
    <Teleport to="body">
      <div
        v-if="open"
        :ref="(el) => (floatingRef = el as HTMLElement | null)"
        data-slip
        role="dialog"
        aria-label="Deck settings"
        class="z-300 flex w-72 flex-col gap-4 rounded-md border border-border bg-popover p-4 text-foreground shadow-lg"
        :style="floatingStyle"
      >
        <div class="flex flex-col gap-1.5">
          <span class="text-label font-bold">Controls</span>
          <SegmentedControl
            :model-value="ui.deckControls"
            :options="CONTROL_OPTIONS"
            variant="outline"
            block
            @update:model-value="ui.setDeckControls"
          />
          <p class="text-caption text-muted-foreground">
            Simple: tap to play and stop, plus Loop and Stop. Full: every tool, launch modes, lanes, controllers.
          </p>
        </div>

        <div class="flex flex-col gap-1.5">
          <span class="text-label font-bold">Size</span>
          <SegmentedControl
            :model-value="ui.deckSize"
            :options="SIZE_OPTIONS"
            variant="outline"
            block
            @update:model-value="(value: DeckSize) => (ui.deckSize = value)"
          />
        </div>

        <AppCheckbox v-model="ui.deckPeekEnabled" label="Peek open when I reach for it" />

        <AppButton variant="link" size="sm" label="Board settings" :icon-right="IconChevronRight" class="self-start" @click="openBoardSettings" />
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, useTemplateRef, watchEffect } from "vue";
import { useRouter } from "vue-router";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppCheckbox from "@/components/common/controls/AppCheckbox.vue";
import SegmentedControl, { type SegmentedOption } from "@/components/common/controls/SegmentedControl.vue";
import { useAnchoredPopover } from "@/composables/useAnchoredPopover";
import { IconChevronRight, IconSettings } from "@/lib/icons";
import { DECK_SIZES, type DeckControls, type DeckSize } from "@/lib/audio/deck/deckSurface";
import { useSoundboardUiStore } from "@/stores/ui/soundboard";
import { DECK_SIZE_LABEL } from "./deckSizeIcons";

/**
 * The settings pip (#1136): the few choices that belong to the deck rather than
 * to the board. Everything about the board itself stays in Board settings.
 */

const ui = useSoundboardUiStore();
const router = useRouter();

const open = ref(false);
const pipButton = useTemplateRef<InstanceType<typeof AppButton>>("pip");
const trigger = ref<Element | null>(null);
const { floatingRef, floatingStyle } = useAnchoredPopover(trigger, open, () => (open.value = false));

// AppButton is a component, so its root element is what the popover anchors to.
watchEffect(() => {
  const root: unknown = pipButton.value?.$el;
  trigger.value = root instanceof Element ? root : null;
});

const CONTROL_OPTIONS: ReadonlyArray<SegmentedOption<DeckControls>> = [
  { value: "simple", label: "Simple" },
  { value: "full", label: "Full" },
];
const SIZE_OPTIONS: ReadonlyArray<SegmentedOption<DeckSize>> = DECK_SIZES.map((size) => ({
  value: size,
  label: DECK_SIZE_LABEL[size],
}));

async function openBoardSettings(): Promise<void> {
  open.value = false;
  ui.soundboardSettingsOpen = true;
  await router.push("/soundboard");
}
</script>
