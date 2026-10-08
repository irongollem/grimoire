<template>
  <DashboardWidget title="Jump to…">
    <div class="flex flex-col gap-2 p-3">
      <AppInput
        v-model="query"
        type="search"
        size="body"
        placeholder="NPC, note, monster, spell, item…"
        aria-label="Search everything in this campaign"
      />

      <p v-if="state === 'idle'" class="px-1 text-caption text-muted-foreground italic">
        Two letters is enough. Searches notes, NPCs, monsters, spells, items and more.
      </p>
      <p v-else-if="state === 'searching'" class="px-1 text-caption text-muted-foreground italic">
        {{ isFetching ? "Searching…" : "Searching by meaning…" }}
      </p>
      <p v-else-if="state === 'error'" class="px-1 text-caption text-muted-foreground italic">
        Search failed. Try again.
      </p>
      <p v-else-if="state === 'empty'" class="px-1 text-caption text-muted-foreground italic">
        {{ failedGroups.length > 0 ? failedMessage : `Nothing matches “${query.trim()}”.` }}
      </p>

      <div v-else class="-mx-3 divide-y divide-border/50">
        <div v-for="group in groups" :key="group.type">
          <p class="bg-muted/30 px-3 py-1 text-eyebrow font-semibold text-muted-foreground">
            {{ group.label }}
          </p>
          <RouterLink
            v-for="hit in group.items"
            :key="hit.id"
            :to="hit.route"
            class="block truncate px-3 py-1.5 text-body text-foreground transition-colors hover:bg-muted/30 hover:text-primary"
          >
            {{ hit.name }}
            <span v-if="hit.descriptor" class="text-caption font-normal text-muted-foreground">
              {{ hit.descriptor }}
            </span>
          </RouterLink>
        </div>
        <p v-if="isSemanticPending" class="px-3 pt-2 text-caption text-muted-foreground italic">
          Searching by meaning…
        </p>
        <p v-if="failedGroups.length > 0" class="px-3 pt-2 text-caption text-muted-foreground italic">
          {{ failedMessage }}
        </p>
      </div>
    </div>
  </DashboardWidget>
</template>

<script setup lang="ts">
/**
 * The global search, embedded as a card (#764).
 *
 * `useGlobalSearch` already fans out across nine tables and is already wired
 * to the ⌘K palette — so this is purely a second surface onto the same query,
 * for the DM who keeps the dashboard open and does not want a modal over it
 * mid-session. Nothing here re-implements the search.
 *
 * The four states are spelled out rather than collapsed, because three of
 * them look identical if you only check `groups.length`: below two characters
 * the query is *disabled* and answers with the placeholder `[]`, which is the
 * same empty array a genuine no-match returns and the same one an in-flight
 * request has not replaced yet. "Type more", "searching" and "nothing
 * matches" are three different things to say.
 *
 * The by-meaning tier (#599) adds no fifth state: with keyword results on
 * screen a quiet trailing line says it is still looking; with none, it keeps
 * the card in "searching" rather than claiming nothing matches.
 */
import { computed, ref } from "vue";
import { RouterLink } from "vue-router";
import DashboardWidget from "@/components/dashboard/DashboardWidget.vue";
import AppInput from "@/components/common/AppInput.vue";
import { failedGroupsMessage, useGlobalSearch } from "@/composables/useGlobalSearch";

/**
 * A local ref, and that is the Filter State Pattern applying rather than being
 * broken: this box filters a popup of candidates to jump to, not the list on
 * the page. It is the same shape as `GlobalSearch` itself, which CLAUDE.md
 * names among the sanctioned add-picker cases.
 */
const query = ref("");

/** Mirrors `useGlobalSearch`'s own `enabled` threshold — below it the query
 *  never runs, so anything the card said about results would be invented. */
const MIN_QUERY = 2;

const { data, isFetching, isError, isSemanticPending } = useGlobalSearch(query);

const groups = computed(() => data.value?.groups ?? []);
const failedGroups = computed(() => data.value?.failedGroups ?? []);
const failedMessage = computed(() => failedGroupsMessage(failedGroups.value));

const state = computed<"idle" | "searching" | "error" | "empty" | "results">(() => {
  if (query.value.trim().length < MIN_QUERY) return "idle";
  if (isFetching.value) return "searching";
  if (isError.value) return "error";
  // Keyword found nothing but the by-meaning tier has not answered: still searching.
  if (groups.value.length === 0) return isSemanticPending.value ? "searching" : "empty";
  return "results";
});
</script>
