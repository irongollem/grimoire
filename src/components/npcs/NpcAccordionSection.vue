<template>
  <!--
    Mobile-only (<md) collapsible card section for the NPC detail screen.
    A tappable header (Cinzel title + rotating chevron) toggles the body.
    Open state is owned by the parent via `v-model:open`.
  -->
  <section class="overflow-hidden rounded-xl border border-border bg-card">
    <button
      type="button"
      class="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left"
      :aria-expanded="open"
      @click="open = !open"
    >
      <span class="font-cinzel text-base font-bold tracking-wide text-foreground">
        {{ title }}
      </span>
      <IconChevronDown
        class="size-5 shrink-0 text-muted-foreground transition-transform duration-200"
        :class="open && 'rotate-180'"
        aria-hidden="true"
      />
    </button>

    <!--
      `v-show`, not `v-if`: the body holds live form fields on the NPC sheet, and
      rebuilding them on every open would drop whatever was mid-edit. The rule
      under the header rides along with the drawer — drawerTransition collapses
      the border with the height, so it is never left hanging over nothing.
    -->
    <Transition v-bind="drawerTransition()">
      <div v-show="open" class="border-t border-border px-4 pt-3 pb-4">
        <slot />
      </div>
    </Transition>
  </section>
</template>

<script setup lang="ts">
import { IconChevronDown } from "@/lib/icons";
import { drawerTransition } from "@/lib/motion";

defineProps<{ title: string }>();
const open = defineModel<boolean>("open", { required: true });
</script>
