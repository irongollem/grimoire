<template>
  <section class="flex flex-col gap-2 border border-border bg-card p-4" aria-labelledby="tonight-done-heading" data-testid="tonight-done">
    <h2 id="tonight-done-heading" class="m-0 text-heading-sm">
      <AppButton
        :label="`Done this session (${done.length})`"
        :icon="open ? IconChevronDown : IconChevronRight"
        size="sm"
        variant="subtle"
        :aria-expanded="open"
        data-testid="done-toggle"
        @click="open = !open"
      />
    </h2>
    <Transition v-bind="drawerTransition()">
      <ul v-show="open" class="m-0 flex list-none flex-col gap-2 p-0" data-testid="done-list">
        <li v-for="entry in done" :key="entry.key" class="flex min-w-0 items-center justify-between gap-2" data-testid="done-row">
          <span class="text-body text-muted-foreground">{{ DONE_VERB[entry.kind] }}: {{ entry.title || "Untitled" }}</span>
          <AppButton variant="link" size="inline" label="Undo" data-testid="done-undo" @click="emit('undo', entry.key)" />
        </li>
      </ul>
    </Transition>
  </section>
</template>

<script setup lang="ts">
/** What Tonight's own actions did on this visit, kept in view (folded) so a mis-tap is one Undo away (#1279 item 19). */
import { ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import { IconChevronDown, IconChevronRight } from "@/lib/icons";
import { drawerTransition } from "@/lib/motion";
import { DONE_VERB, type TonightDone } from "@/lib/canon/canonTonight";

const { done } = defineProps<{ done: readonly TonightDone[] }>();
const emit = defineEmits<{ undo: [key: string] }>();
const open = ref(false);
</script>
