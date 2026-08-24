<template>
  <DashboardWidget
    title="Rules search"
    to="/rules?tab=compendium"
    action-label="Compendium →"
    :count="query.trim() ? results.length : undefined"
    :loading="isLoading"
    :empty="isLibraryEmpty"
    empty-text="No rules loaded yet. The sync edge function may not have run."
  >
    <div class="flex flex-col gap-2 p-3">
      <div class="relative">
        <component
          :is="IconSearch"
          class="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
        />
        <AppInput
          v-model="query"
          type="search"
          size="body"
          placeholder="Search conditions, actions, rules…"
          class="pl-7"
        />
      </div>

      <!-- Say what the box is for before it has anything to show — an empty
           result list and "you haven't typed yet" look identical otherwise,
           and only one of them is worth explaining. -->
      <p v-if="!query.trim()" class="px-1 text-caption text-muted-foreground italic">
        Search the SRD compendium — conditions, actions, spells and more —
        without leaving the dashboard.
      </p>

      <p v-else-if="results.length === 0" class="px-1 text-caption text-muted-foreground italic">
        No matches for "{{ query.trim() }}".
      </p>

      <!--
        AppButton's `menu` variant, same as CompendiumTab's own flat search
        results (CompendiumTab.vue:28-39) — the default slot in place of
        `label` is documented on the component itself ("Omit and use the
        default slot for richer content") for exactly this case: a name plus
        a second line of context, not a plain label.
      -->
      <div v-else class="flex flex-col">
        <AppButton
          v-for="rule in results"
          :key="rule.id"
          variant="menu"
          size="body"
          block
          class="flex-col items-start gap-0.5 py-2"
          :aria-label="rule.name"
          @click="openInCompendium(rule)"
        >
          <span class="font-cinzel text-caption font-semibold text-foreground">
            {{ rule.name }}
          </span>
          <span class="font-fell text-2xs text-muted-foreground line-clamp-1">
            {{ excerpt(rule.content) }}
          </span>
        </AppButton>
      </div>
    </div>
  </DashboardWidget>
</template>

<script setup lang="ts">
/**
 * Jump to a rule from the dashboard without opening the Reliquary first (#764).
 *
 * `useLibraryRules()` (composables/useRules.ts:23) already holds the whole SRD
 * compendium in cache with `staleTime: Infinity`, so this widget adds no
 * network cost beyond whatever page loaded it first — it is reading the same
 * query CompendiumTab reads, not a second copy of the data.
 *
 * `rulesSearch.ts` owns the matching, ranking and limiting; see its docstring
 * for why the predicate matches `CompendiumTab.vue`'s own sidebar filter
 * unchanged rather than inventing a second one.
 *
 * Filter-state decision: this search box stays a local `ref`, not
 * `useUiStore`. The Filter State Pattern is for a filter over the list
 * already on the page — the sidebar in CompendiumTab is exactly that, which
 * is why `ui.compendiumSearch` exists. This card is the opposite shape: a
 * query box that surfaces a small popup of candidates and then sends you
 * *away* to a different page entirely, same as `GlobalSearch.vue` (an
 * explicitly sanctioned exemption) and `EntityCombobox`. Persisting it would
 * mean the widget still showed last session's search after a page reload,
 * with no list on screen it was ever filtering.
 *
 * No route or store hook exists to focus one specific rule in the
 * compendium — `CompendiumTab`'s `selected` (CompendiumTab.vue:109) is a
 * local ref with nothing wired to the URL. `ui.compendiumSearch`
 * (CompendiumTab.vue:108,120 — a store field, not a local one, because that
 * one genuinely is a list filter) is the closest available handoff: setting
 * it before navigating lands the DM on the Compendium tab with its own
 * sidebar already narrowed to this rule's name, one click from the exact
 * page instead of the full tree. It does not select the rule outright, since
 * that would require editing CompendiumTab.vue, which is out of this
 * widget's ownership.
 *
 * Takes no props: like the dice roller and every other unconfigurable list
 * widget, there is nothing per-instance to configure.
 */
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import DashboardWidget from "@/components/dashboard/DashboardWidget.vue";
import AppInput from "@/components/common/AppInput.vue";
import AppButton from "@/components/common/AppButton.vue";
import { IconSearch } from "@/lib/icons";
import { useLibraryRules } from "@/composables/useRules";
import { useUiStore } from "@/stores/ui";
import { searchLibraryRules } from "@/lib/dashboard/rulesSearch";
import type { LibraryRule } from "@/types/rule.types";

const router = useRouter();
const ui = useUiStore();

const { data: libraryRules, isLoading } = useLibraryRules();

const query = ref("");

// Guarded on `undefined` rather than `libraryRules.value ?? []`: while the
// query is still loading (or has errored without data), there is nothing to
// search yet — that is a different state from "searched and matched
// nothing", and `isLoading` below is what tells the card which one it is.
const results = computed(() => {
  if (libraryRules.value === undefined) return [];
  return searchLibraryRules(libraryRules.value, query.value);
});

// Distinct from "no search results": this is "the compendium itself has
// nothing in it", the same condition CompendiumTab shows its own message
// for. A card that only ever says "No matches" would leave the DM typing
// into a box that could never answer, with no hint that the sync job is the
// actual problem.
const isLibraryEmpty = computed(
  () => !isLoading.value && libraryRules.value !== undefined && libraryRules.value.length === 0,
);

/** First line of plain text, collapsed and capped — a hint at *why* a
 *  body-only match matched, not a rendering of the rule. */
function excerpt(content: string): string {
  const flat = content.trim().replace(/\s+/g, " ");
  return flat.length > 90 ? `${flat.slice(0, 90)}…` : flat;
}

function openInCompendium(rule: LibraryRule) {
  ui.compendiumSearch = rule.name;
  router.push("/rules?tab=compendium");
}
</script>
