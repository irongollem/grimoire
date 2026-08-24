<template>
  <DashboardWidget
    title="Monster quick-pull"
    to="/monsters"
    action-label="Bestiary →"
    :loading="isLoading"
    :empty="!isLoading && monsters.length === 0"
  >
    <template #empty>
      <p class="text-body text-muted-foreground italic">
        No monsters in this campaign's bestiary yet — add a custom monster or
        enable a source under Codex.
      </p>
    </template>

    <div class="flex flex-col gap-2.5 p-3">
      <div class="flex gap-1.5">
        <AppSelect v-model="crBand" size="xs" class="min-w-0 flex-1" aria-label="Challenge rating band">
          <option v-for="opt in CR_BAND_OPTIONS" :key="opt.id" :value="opt.id">{{ opt.label }}</option>
        </AppSelect>
        <AppSelect v-model="type" size="xs" class="min-w-0 flex-1" aria-label="Monster type">
          <option v-for="opt in MONSTER_PULL_TYPE_OPTIONS" :key="opt" :value="opt">
            {{ opt === "all" ? "All types" : capitalize(opt) }}
          </option>
        </AppSelect>
      </div>

      <AppButton
        variant="primary"
        size="md"
        block
        :icon="IconShuffle"
        :label="current ? 'Pull another' : 'Pull a monster'"
        :disabled="pool.length === 0"
        tooltip="Draw a random monster from the filtered pool"
        @click="pull"
      />

      <!-- Three body states, in order: the filter matched nothing (controls
           above stay usable so the DM can widen it straight away — unlike the
           card-level `empty` state above, which hides them because there is
           nothing any filter could do); a pulled monster; nothing pulled yet. -->
      <p v-if="pool.length === 0" class="text-caption text-muted-foreground italic">
        No monsters match this filter. Try a wider CR band or "All types".
      </p>

      <div v-else-if="current" class="flex flex-col gap-1 rounded-lg bg-muted/40 px-3 py-2.5">
        <div class="flex items-start justify-between gap-2">
          <p class="font-cinzel text-sm font-bold text-foreground">{{ current.name }}</p>
          <!-- Not an AppButton tinted pill: `crBg`/`crLabel` are the bestiary's
               own single source of truth for a CR badge (MonsterGridCard,
               MonsterSheetMobile, the player bestiary all read it), colouring
               by threat tier rather than by the six generic tinted tones. That
               scale lives in monsterDisplay.ts precisely so it is reused here
               rather than re-invented as a seventh tone. -->
          <span
            class="shrink-0 rounded px-1.5 py-0.5 text-center font-cinzel text-label font-bold text-white"
            :class="crBg(current.stat_block.challenge_rating)"
          >
            {{ crLabel(current.stat_block.challenge_rating) }}
          </span>
        </div>
        <p class="text-caption text-muted-foreground capitalize italic">
          {{ monsterIdentityLine(current) }}
        </p>
        <AppButton
          :to="`/monsters/${current.id}`"
          variant="link"
          size="inline-xs"
          label="View statblock →"
          class="self-start"
        />
      </div>

      <p v-else class="text-caption text-muted-foreground italic">
        Pull one to see it here.
      </p>

      <p class="text-caption-sm text-muted-foreground">
        {{ pool.length }} {{ pool.length === 1 ? "monster" : "monsters" }} in this filter.
      </p>
    </div>
  </DashboardWidget>
</template>

<script setup lang="ts">
/**
 * A random monster for an improvised encounter, without leaving the
 * dashboard (#764) — the party wanders off the prepped map, or a fight the
 * DM did not plan for starts, and "something plausible now" beats an empty
 * hallway. Filtered by CR band so the pull actually fits the party, and
 * optionally by type for "I need a beast, not whatever" — see
 * `monsterPull.ts` for why those two axes and not habitat.
 *
 * Filter-state decision: CR band and type stay local `ref`s, not
 * `useUiStore`. The Filter State Pattern is for a filter over a list already
 * on the page — this card never shows a list at all, only the single result
 * of the last pull. The two controls instead shape what the *next* random
 * draw is allowed to land on, which is the "popup of candidates" shape the
 * pattern's own sanctioned exceptions carve out (`RulesSearchWidget`'s
 * `query` is the same call for the same reason). Persisting them would also
 * be the wrong fix if this card ever wanted persistence: a per-instance
 * default belongs in this widget's `settings` blob, the way the DM screen
 * card and roll-table card already do it, not in the page-wide store.
 *
 * The pulled monster (`current`) is a local ref for the same reason
 * `RollTableWidget`'s `lastRoll` is: a pull is a thing that just happened,
 * not part of the dashboard's arrangement, and persisting it would reopen
 * tomorrow's session claiming the party already met an owlbear.
 *
 * No props: nothing here is per-instance configuration in the
 * `configurable: true` sense — there is no saved reference to resolve, only
 * a live filter over whatever `useAllMonsters` returns right now.
 */
import { computed, ref, watch } from "vue";
import DashboardWidget from "@/components/dashboard/DashboardWidget.vue";
import AppButton from "@/components/common/AppButton.vue";
import AppSelect from "@/components/common/AppSelect.vue";
import { IconShuffle } from "@/lib/icons";
import { useAllMonsters } from "@/composables/useMonsters";
import { rollParsed } from "@/lib/dice/roller";
import { capitalize } from "@/types/card.types";
import { crBg, crLabel, monsterIdentityLine } from "@/lib/monsterDisplay";
import {
  CR_BAND_OPTIONS,
  MONSTER_PULL_TYPE_OPTIONS,
  filterMonstersForPull,
  pickMonster,
  type CrBandId,
  type MonsterPullTypeFilter,
} from "@/lib/dashboard/monsterPull";
import type { Monster } from "@/types/monster.types";

const { data: monstersData, isLoading } = useAllMonsters();
// `useAllMonsters` already collapses "still loading" and "loaded, empty" to
// the same `[]` internally (see its own computed) — `isLoading` above is the
// signal this card actually needs to tell those two apart, not the data.
const monsters = computed<Monster[]>(() => monstersData.value);

/** Defaults to "any": assuming a party level here would be a guess this
 *  widget has no data to back, and a DM who wants a narrower pull is one
 *  click away. */
const crBand = ref<CrBandId>("any");
const type = ref<MonsterPullTypeFilter>("all");

const pool = computed(() =>
  filterMonstersForPull(monsters.value, { crBand: crBand.value, type: type.value }),
);

const current = ref<Monster | null>(null);

// A result belongs to the filter that produced it — narrowing the CR band or
// type after a pull must not leave a CR 17 dragon sitting under "CR 0-4",
// which is exactly what stays on screen without this watch (same shape as
// RollTableWidget's watch on the selected table).
watch([crBand, type], () => {
  current.value = null;
});

function pull() {
  const candidates = pool.value;
  if (candidates.length === 0) return;
  // The central roller, never Math.random() in a component: a
  // `candidates.length`-sided die (arbitrary size — ParsedExpression's terms
  // are not limited to the physical d4..d100 set) picks a 1-indexed face,
  // which pickMonster wants 0-indexed.
  const { total } = rollParsed({ terms: [{ count: 1, sides: candidates.length }], modifier: 0 });
  current.value = pickMonster(candidates, total - 1);
}
</script>
