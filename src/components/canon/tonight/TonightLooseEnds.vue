<template>
  <section class="flex flex-col gap-2 border border-border bg-card p-4" aria-labelledby="tonight-loose-heading" data-testid="tonight-loose">
    <h2 id="tonight-loose-heading" class="m-0 text-heading-sm">
      <AppButton
        :label="`Loose ends (${ends.length})`"
        :icon="open ? IconChevronDown : IconChevronRight"
        size="sm"
        variant="subtle"
        :aria-expanded="open"
        data-testid="loose-toggle"
        @click="open = !open"
      />
    </h2>
    <Transition v-bind="drawerTransition()">
      <ul v-show="open" class="m-0 flex list-none flex-col gap-2 p-0" data-testid="loose-list">
        <li v-for="end in ends" :key="end.key" class="flex min-w-0 flex-col" data-testid="loose-end">
          <RouterLink :to="end.to" class="text-body font-semibold text-foreground underline-offset-2 hover:underline">{{ end.title || "Untitled" }}</RouterLink>
          <span class="text-label text-muted-foreground">{{ KIND_LABEL[end.kind] }}: {{ end.reasons.join("; ") }}</span>
          <span class="flex items-center gap-1">
            <TonightPinToggle v-if="end.entryId !== null" :pinned="isPinned(end.entryId)" @toggle="end.entryId !== null && emit('pin', end.entryId)" />
            <AppButton variant="ghost" size="xs" label="Leave it" data-testid="loose-leave" @click="emit('leave', end)" />
          </span>
        </li>
      </ul>
    </Transition>
  </section>
</template>

<script setup lang="ts">
/** What the canon promises and has not got ready (#1258 item 31). Folded by default so it never crowds what is for tonight. A loose end can be pinned, or left (#1279 items 20, 21). */
import { ref } from "vue";
import { RouterLink } from "vue-router";
import AppButton from "@/components/common/controls/AppButton.vue";
import TonightPinToggle from "@/components/canon/tonight/TonightPinToggle.vue";
import { IconChevronDown, IconChevronRight } from "@/lib/icons";
import { drawerTransition } from "@/lib/motion";
import type { LooseEnd, LooseEndKind } from "@/lib/canon/canonTonight";

const { ends, pinned } = defineProps<{ ends: readonly LooseEnd[]; /** Entry ids pinned for the next session. */ pinned?: ReadonlySet<string> }>();
const emit = defineEmits<{ pin: [entryId: string]; leave: [end: LooseEnd] }>();
const isPinned = (id: string) => pinned?.has(id) ?? false;
const open = ref(false);
const KIND_LABEL: Record<LooseEndKind, string> = { secret: "Secret", force: "Force", question: "Question", backstory: "Backstory", arc: "Arc" };
</script>
