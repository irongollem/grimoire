<template>
  <div class="rounded-md border border-border bg-muted/40 p-3 flex flex-col gap-1.5">
    <div class="flex items-center justify-between">
      <span class="text-eyebrow font-semibold text-muted-foreground">Result</span>
      <span class="text-title font-bold text-primary">{{ result.rolled }}</span>
    </div>
    <template v-if="result.entry">
      <div class="font-cinzel text-sm text-foreground font-bold">{{ result.entry.label }}</div>
      <AppButton
        v-if="result.entry.encounter_id"
        variant="link"
        size="inline"
        label="Open encounter →"
        :to="`/encounters/${result.entry.encounter_id}`"
      />
      <p v-if="result.entry.notes" class="text-caption text-muted-foreground italic mt-1">
        {{ result.entry.notes }}
      </p>
    </template>
    <!-- Sparse coverage is legal and deliberate: a 1d6 table with entries only
         on 1–3 means "nothing happens" on 4–6. Saying so beats an empty box. -->
    <p v-else class="text-caption text-muted-foreground italic">No entry covers this result.</p>
  </div>
</template>

<script setup lang="ts">
/**
 * What a roll on a random table produced — the face, the entry it landed on,
 * its note, and the jump to a linked encounter.
 *
 * Extracted from `RollTableDetailView`'s roll panel when the dashboard widget
 * (#764) needed the same thing. Worth sharing rather than copying because the
 * encounter link is the part that carries behaviour: an entry may or may not
 * name an encounter, and a second copy that forgot the `v-if` would either
 * hide the jump or render a link to `/encounters/null`.
 *
 * The Roll button is *not* here — the detail view disables it on a range
 * error it computes from an unsaved form, and the widget has no form. Each
 * owns its trigger; this owns the answer.
 */
import AppButton from "@/components/common/AppButton.vue";
import type { RollTableRollResult } from "@/lib/dungeon-features/rollTableRoll";

defineProps<{ result: RollTableRollResult }>();
</script>
