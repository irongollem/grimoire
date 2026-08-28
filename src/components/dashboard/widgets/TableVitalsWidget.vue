<template>
  <!--
    `v-if` rather than `DashboardWidget`'s `empty` slot: the registry marks
    this `selfHiding`, and the two have to agree. A card that both claims to
    hide itself and renders an empty state does neither. No `loading` prop for
    the same reason — a spinner that resolves into nothing is a card flashing
    onto the board and off again, which is worse than never appearing. Same
    shape as `RecentNpcsWidget` and `PinnedNotesWidget`.
  -->
  <DashboardWidget
    v-if="rows.length > 0"
    title="Table vitals"
    :count="rows.length"
    to="/party"
    action-label="Full tracker →"
  >
    <div class="divide-y divide-border">
      <div v-for="row in rows" :key="row.id" class="px-3 py-2 flex flex-col gap-1.5">
        <div class="flex items-center justify-between gap-2">
          <p :title="row.name" class="font-cinzel text-sm font-semibold text-foreground truncate">{{ row.name }}</p>
          <!-- Every pill here is `AppButton variant="tinted"` rather than a
               hand-rolled span: these are coloured pills whose colour means
               something (arcane = concentration, caution = short rest, info =
               long rest), which is exactly what the primitive owns. The tone
               tokens also land within a hair of the raw amber/blue this and
               `PlayerResourcePools` used to spell out by hand. -->
          <AppButton
            v-if="row.concentration"
            as="span"
            variant="tinted"
            tone="arcane"
            emphasis="soft"
            size="xs"
            class="shrink-0"
            :label="concentrationLabel(row.concentration)"
            :tooltip="`Concentrating on ${row.concentration.spellName}`"
          />
        </div>
        <div v-if="row.slots.length || row.resources.length" class="flex flex-wrap items-center gap-1">
          <AppButton
            v-for="slot in row.slots"
            :key="`${slot.pool}-${slot.level}`"
            as="span"
            variant="tinted"
            tone="neutral"
            emphasis="soft"
            size="xs"
            :class="slot.remaining === 0 && 'opacity-50'"
            :label="slotLabel(slot)"
            :tooltip="`Level ${slot.level}${POOL_LABELS[slot.pool] ? ` (${POOL_LABELS[slot.pool]})` : ''} spell slots`"
          />
          <AppButton
            v-for="res in row.resources"
            :key="res.key"
            as="span"
            variant="tinted"
            :tone="res.rest === 'short' ? 'caution' : 'info'"
            emphasis="soft"
            size="xs"
            :label="`${res.label} ${res.current}/${res.max}`"
            :tooltip="`${res.label} — ${res.rest} rest`"
          />
        </div>
      </div>
    </div>
  </DashboardWidget>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useParty } from "@/composables/party/useParty";
import AppButton from "@/components/common/AppButton.vue";
import {
  buildTableVitalsRows,
  type TableVitalsConcentration,
  type TableVitalsSlotGroup,
} from "@/lib/dashboard/tableVitals";
import type { SpellSlotPool } from "@/rules/spellSlots";
import DashboardWidget from "../DashboardWidget.vue";

/**
 * The party's at-the-table resources — remaining spell slots, class-resource
 * pools (Ki, Rage, Bardic Inspiration…) and who is concentrating on what —
 * none of which `PartyWidget` shows (it already owns HP, AC, conditions and
 * passive scores). #764.
 *
 * Read-only by design: this is a scan-during-combat card, not an editor.
 * Every control that would change one of these numbers already lives on the
 * full party tracker, which is what the header link goes to.
 */
const { data: party } = useParty();

// Unloaded and "loaded, nobody has anything to track" both render nothing,
// because the widget is self-hiding — so unlike a card with an empty state,
// this one loses nothing by treating them alike. The explicit branch is kept
// anyway: it costs a line and it is the shape to copy if this ever grows one.
const rows = computed(() => (party.value === undefined ? [] : buildTableVitalsRows(party.value)));

/** Legacy rows with no `pool` are ordinary Spellcasting slots and get no
 *  label — matches the reading `PlayerMySpells.vue` already uses for pips. */
const POOL_LABELS: Partial<Record<SpellSlotPool, string>> = {
  pact: "PACT",
  temporary: "CREATED",
  feature: "FEATURE",
};

// Composed here rather than in the template because `AppButton` takes its text
// as a `label` prop; the alternative is a slot, and a one-line string is not
// worth one.
function slotLabel(slot: TableVitalsSlotGroup): string {
  const pool = POOL_LABELS[slot.pool];
  const prefix = pool === undefined ? "" : `${pool} `;
  return `${prefix}L${slot.level} ${slot.remaining}/${slot.max}`;
}

function concentrationLabel(concentration: TableVitalsConcentration): string {
  const round =
    concentration.startedRound === null ? "" : ` · rd ${concentration.startedRound}`;
  return `✦ ${concentration.spellName}${round}`;
}
</script>
