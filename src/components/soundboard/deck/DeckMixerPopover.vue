<template>
  <div class="relative inline-flex">
    <AppButton
      ref="mixer"
      variant="ghost"
      size="icon-sm"
      class="pointer-coarse:size-11"
      :icon="IconMixer"
      aria-label="Mixer"
      tooltip="Mixer: master, music, ambience and effects"
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
        aria-label="Mixer"
        class="z-300 w-80 rounded-md border border-border bg-popover p-4 text-foreground shadow-lg"
        :style="floatingStyle"
      >
        <SoundboardMixer />
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, useTemplateRef, watchEffect } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import { useAnchoredPopover } from "@/composables/useAnchoredPopover";
import { IconMixer } from "@/lib/icons";
import SoundboardMixer from "../SoundboardMixer.vue";

/**
 * The mixer from the deck's header (#1136): the same SoundboardMixer the
 * /soundboard page shows in its drawer, so the two surfaces cannot drift. It
 * replaces the mixer the floating widget used to carry.
 */

const open = ref(false);
const mixerButton = useTemplateRef<InstanceType<typeof AppButton>>("mixer");
const trigger = ref<Element | null>(null);
const { floatingRef, floatingStyle } = useAnchoredPopover(trigger, open, () => (open.value = false));

// AppButton is a component, so its root element is what the popover anchors to.
watchEffect(() => {
  const root: unknown = mixerButton.value?.$el;
  trigger.value = root instanceof Element ? root : null;
});
</script>
