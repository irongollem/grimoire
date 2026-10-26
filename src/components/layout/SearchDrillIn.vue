<template>
  <div class="flex shrink-0 items-center">
    <AppButton
      variant="ghost"
      size="xs"
      :icon="open ? IconChevronUp : IconChevronDown"
      :label="toggleLabel"
      :aria-expanded="open"
      @click="open = !open"
    />
  </div>
  <div v-if="open" class="basis-full border-t border-border/30 bg-secondary/20 pb-1" :class="padding">
    <div v-if="isLoading" class="flex items-center gap-2 py-2 text-caption text-muted-foreground">
      <BannerLoader class="h-3.5" />
      Reading…
    </div>
    <p v-else-if="isError" class="py-2 text-caption text-muted-foreground">Couldn't read who is here.</p>
    <p v-else-if="shownCount === 0" class="py-2 text-caption text-muted-foreground">{{ emptyLabel }}</p>
    <template v-else>
      <!-- A local ref on purpose: a drill-in's filter dies with its list, like a picker's search. -->
      <AppInput v-model="filter" size="caption" class="my-1.5" :placeholder="`Filter ${nounPlural}…`" :aria-label="`Filter ${nounPlural}`" />
      <component
        :is="selectable ? 'button' : RouterLink"
        v-for="person in visible"
        :key="person.row_id + person.other_id"
        v-bind="selectable ? { type: 'button' } : { to: personRoute(person) }"
        class="flex w-full cursor-pointer items-center gap-2 py-1.5 text-left text-body text-foreground transition-colors hover:bg-secondary/60"
        @click="selectable ? emit('pick', { kind: person.other_kind as PersonKind, id: person.other_id, name: person.other_name }) : emit('navigate')"
      >
        <span class="truncate">{{ person.other_name }}</span>
        <span v-if="personDetail(person)" class="truncate text-caption text-muted-foreground">{{ personDetail(person) }}</span>
      </component>
      <p v-if="visible.length === 0" class="py-2 text-caption text-muted-foreground">No one matches.</p>
    </template>
  </div>
</template>

<script setup lang="ts">
/**
 * The people at a place or in a faction, opened in place under its search row
 * (#1084): "I know someone is at the inn but I forgot his name" without a second
 * tab. Owns its toggle, so the row only has to give it a flex line to sit in.
 * Fetches nothing until opened.
 */
import { computed, ref } from "vue";
import { RouterLink } from "vue-router";
import BannerLoader from "@/components/brand/BannerLoader.vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import { useConnectionDrillIn, type DrillInKind } from "@/composables/connections/useConnectionDrillIn";
import { IconChevronDown, IconChevronUp } from "@/lib/icons";
import type { Connection } from "@/types/connections.types";

type PersonKind = "npc" | "party_member";

const { kind, id, selectable = false, padding = "px-3", exclude = null } = defineProps<{
  kind: DrillInKind;
  id: string;
  /** Picker mode: a person is picked, not opened. */
  selectable?: boolean;
  padding?: string;
  /** Someone to leave out of the list: the thing a picker is choosing a connection for. */
  exclude?: { kind: string; id: string } | null;
}>();

const emit = defineEmits<{ navigate: []; pick: [ref: { kind: PersonKind; id: string; name: string }] }>();

const open = ref(false);
const filter = ref("");
const { people, filtered, count, isLoading, isError } = useConnectionDrillIn(() => ({ kind, id }), open, filter);

const isExcluded = (p: Connection) => !!exclude && p.other_kind === exclude.kind && p.other_id === exclude.id;
const visible = computed(() => filtered.value.filter((p) => !isExcluded(p)));
/** The count a picker shows leaves out the one it is choosing for: "1 person here" over an empty list reads as a fault. */
const shownCount = computed(() =>
  count.value === null || people.value === undefined ? null : count.value - people.value.filter(isExcluded).length,
);
const nounPlural = computed(() => (kind === "location" ? "people" : "members"));
const emptyLabel = computed(() => {
  if (exclude) return kind === "location" ? "No one else is here." : "No other members.";
  return kind === "location" ? "No one is here." : "No members.";
});

/** "People here" until the first read answers, then "3 people here". */
const toggleLabel = computed(() => {
  const n = shownCount.value;
  if (n === null) return kind === "location" ? "People here" : "Members";
  if (kind === "location") return n === 1 ? "1 person here" : `${n} people here`;
  return n === 1 ? "1 member" : `${n} members`;
});

function personRoute(person: Connection): string {
  return person.other_kind === "party_member" ? `/party/${person.other_id}` : `/npcs/${person.other_id}`;
}

function personDetail(person: Connection): string | null {
  if (person.role) return person.role;
  return person.other_kind === "party_member" ? "Party" : null;
}
</script>
