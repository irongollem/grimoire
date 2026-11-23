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
        </li>
      </ul>
    </Transition>
  </section>
</template>

<script setup lang="ts">
/** What the canon promises and has not got ready (#1258 item 31). Folded by default so it never crowds what is for tonight. */
import { ref } from "vue";
import { RouterLink } from "vue-router";
import AppButton from "@/components/common/controls/AppButton.vue";
import { IconChevronDown, IconChevronRight } from "@/lib/icons";
import { drawerTransition } from "@/lib/motion";
import type { LooseEnd, LooseEndKind } from "@/lib/canon/canonTonight";

const { ends } = defineProps<{ ends: readonly LooseEnd[] }>();
const open = ref(false);
const KIND_LABEL: Record<LooseEndKind, string> = { secret: "Secret", force: "Force", question: "Question", backstory: "Backstory", arc: "Arc" };
</script>
