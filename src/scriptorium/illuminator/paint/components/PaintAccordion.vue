<template>
  <section class="border-b border-border" :data-section="id">
    <AppButton
      variant="ghost"
      class="w-full justify-start gap-2 rounded-none px-3 py-2 text-left"
      :aria-expanded="open"
      :data-testid="`section-${id}`"
      @click="emit('toggle')"
    >
      <IconChevronRight class="size-3 shrink-0 transition-transform" :class="open ? 'rotate-90' : ''" />
      <span class="text-label-lg font-bold uppercase text-foreground">{{ title }}</span>
    </AppButton>
    <Transition v-bind="drawerTransition()">
      <div v-show="open" :data-testid="`section-${id}-body`"><slot /></div>
    </Transition>
  </section>
</template>

<script setup lang="ts">
import AppButton from "@/components/common/controls/AppButton.vue";
import { IconChevronRight } from "@/lib/icons";
import { drawerTransition } from "@/lib/motion";

/** One blade of the painting panel: a header that opens and closes its body, with other blades free to stay open. */
defineProps<{ id: string; title: string; open: boolean }>();
const emit = defineEmits<{ toggle: [] }>();
</script>
