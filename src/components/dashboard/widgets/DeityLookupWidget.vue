<template>
  <!--
    `v-if` rather than an empty state, because the registry marks this
    `selfHiding` and the two have to agree. A campaign with no deities is not
    "waiting for deities" — most never record one — so a card saying so would
    sit on the board permanently. No `loading` prop either: a spinner that
    resolves into nothing is the card flashing on and off again.
  -->
  <DashboardWidget
    v-if="totalCount > 0"
    title="Deities"
    :count="totalCount"
    to="/deities"
  >
    <div
      v-for="(group, index) in groups"
      :key="group.pantheonId ?? 'ungrouped'"
      :class="index > 0 && 'border-t border-border/50'"
    >
      <!-- `pantheonLabel` is `null` for the flat (single-bucket) case — see
           deityLookup.ts for the decision on when a header earns its keep. -->
      <p
        v-if="group.pantheonLabel"
        class="px-3 pt-2 pb-1 font-cinzel text-2xs uppercase tracking-widest text-muted-foreground"
      >
        {{ group.pantheonLabel }}
      </p>

      <ul class="divide-y divide-border/50">
        <li v-for="row in group.rows" :key="row.id">
          <!--
            A plain button rather than `AppButton`: this is a full-width row of
            clickable text with no chrome of its own — no padding recipe, no
            border, no radius — which is the documented case for a raw element
            (see ConditionsWidget.vue, the sibling this shape is copied from).
          -->
          <button
            type="button"
            class="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left transition-colors hover:bg-muted/30"
            :aria-expanded="expandedId === row.id"
            @click="toggle(row.id)"
          >
            <span class="min-w-0 flex-1 truncate font-cinzel text-caption font-semibold text-foreground">
              {{ row.name }}
            </span>
            <component
              :is="IconChevronDown"
              class="size-3.5 shrink-0 text-muted-foreground transition-transform"
              :class="expandedId === row.id && 'rotate-180'"
            />
          </button>

          <Transition v-bind="drawerTransition()">
            <div v-show="expandedId === row.id" class="space-y-1.5 px-3 pb-2.5">
              <p v-if="row.titles" class="font-fell text-caption italic text-muted-foreground">
                {{ row.titles }}
              </p>
              <p v-if="row.alignment" class="text-caption text-muted-foreground">
                <span class="font-semibold text-foreground">Alignment</span> — {{ row.alignment }}
              </p>
              <p v-if="row.symbol" class="text-caption text-muted-foreground">
                <span class="font-semibold text-foreground">Symbol</span> — {{ row.symbol }}
              </p>

              <!-- Domains are a set of facts, not a status — nothing here is
                   "good/bad/pending" the way a caution or danger tint would
                   say. `tone="primary"` matches how DeityListView already
                   tints its own domain chips, just routed through the
                   primitive instead of a hand-spelled border/bg pair. -->
              <div v-if="row.domains.length" class="flex flex-wrap gap-1">
                <AppButton
                  v-for="domain in row.domains"
                  :key="domain"
                  as="span"
                  variant="tinted"
                  tone="primary"
                  emphasis="soft"
                  size="xs"
                  :label="domain"
                />
              </div>
              <p v-else class="text-caption italic text-muted-foreground">No domains recorded.</p>

              <!-- The one required link-out. It lives inside the expanded
                   panel rather than on the row itself, because the row is
                   already a `<button>` (the accordion toggle) and a link
                   cannot nest inside one — this `<div>` is the toggle's
                   sibling, not its child, so an anchor here is legal HTML. -->
              <AppButton :to="row.to" variant="link" size="inline-xs" label="View deity →" />
            </div>
          </Transition>
        </li>
      </ul>
    </div>
  </DashboardWidget>
</template>

<script setup lang="ts">
/**
 * The pantheon in play, quick to check mid-session (#764).
 *
 * A cleric or paladin player asking "what domains does my god grant" or "is
 * Lathander lawful" used to mean the DM leaving the dashboard for the full
 * Deities list. Names are always visible so the card is scannable at a
 * glance; domains, alignment and symbol are one tap away, on the same
 * one-open-at-a-time accordion `ConditionsWidget` established — letting every
 * row open at once would turn this card's height into something that moves
 * the widgets under it, which is exactly what that shape exists to prevent.
 *
 * The join, grouping and per-field formatting all live in `deityLookup.ts`
 * rather than here, per the module-placement rule: deciding *whether* a
 * multi-pantheon campaign needs section headers is exactly the kind of edge
 * case that is cheap to unit-test in isolation and easy to get subtly wrong
 * re-derived by eye in a template.
 *
 * No props: like every other list widget on the dashboard, it reads the
 * active campaign off the store through `useAllDeities()`.
 */
import { computed, ref } from "vue";
import DashboardWidget from "@/components/dashboard/DashboardWidget.vue";
import AppButton from "@/components/common/AppButton.vue";
import { useAllDeities } from "@/composables/deities/useDeities";
import { buildDeityLookupGroups } from "@/lib/dashboard/deityLookup";
import { IconChevronDown } from "@/lib/icons";
import { drawerTransition } from "@/lib/motion";

const { data: deities } = useAllDeities();

// Unloaded and "this campaign has no deities" both render nothing, because
// the card is self-hiding — so unlike a card with an empty state, this one
// loses nothing by treating them alike. The explicit branch is kept anyway:
// it costs a line and it is the shape to copy if this ever grows one.
const groups = computed(() =>
  deities.value === undefined ? [] : buildDeityLookupGroups(deities.value),
);

const totalCount = computed(() => groups.value.reduce((sum, group) => sum + group.rows.length, 0));

/** `null` for none open — the card's resting, compact state. */
const expandedId = ref<string | null>(null);

function toggle(id: string) {
  expandedId.value = expandedId.value === id ? null : id;
}
</script>
