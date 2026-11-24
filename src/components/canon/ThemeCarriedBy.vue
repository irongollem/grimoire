<template>
  <p class="m-0 basis-full text-caption text-muted-foreground" data-testid="theme-carried-by">
    <template v-if="carriers.length > 0">
      Carried by
      <template v-for="(c, i) in carriers" :key="c.key">
        <template v-if="i > 0">, </template>
        <RouterLink :to="c.to" class="text-foreground hover:underline" data-testid="theme-carrier">{{ c.name }}</RouterLink>
      </template>
    </template>
    <template v-else>Nothing carries this yet.</template>
  </p>
</template>

<script setup lang="ts">
/**
 * What carries one theme of the premise (#1258 item 17): the canon entries with a `carries` link to it and the arcs
 * that name it as theirs. A theme nothing carries is a theme the story has not yet been built around, and says so.
 */
import { computed } from "vue";
import { RouterLink } from "vue-router";
import { useCanonArcs } from "@/composables/canon/useCanonArcs";
import { useCanonEntries } from "@/composables/canon/useCanonEntries";
import { useCampaignLinks } from "@/composables/connections/useConnections";
import type { CanonEntry } from "@/types/canon.types";

const { entry } = defineProps<{ entry: CanonEntry }>();

const { data: entries } = useCanonEntries();
const { data: links } = useCampaignLinks();
const { data: arcs } = useCanonArcs();

const carriers = computed(() => {
  const byId = new Map((entries.value ?? []).map((e) => [e.id, e]));
  const out: { key: string; name: string; to: string | { path: string; query: { entry: string } } }[] = [];
  const seen = new Set<string>();
  for (const l of links.value ?? []) {
    if (l.type !== "carries" || l.from_kind !== "canon" || l.to_kind !== "canon" || l.to_id !== entry.id) continue;
    const from = byId.get(l.from_id);
    if (from === undefined || seen.has(from.id)) continue;
    seen.add(from.id);
    out.push({ key: `entry-${from.id}`, name: from.title, to: { path: "/canon", query: { entry: from.id } } });
  }
  for (const a of arcs.value ?? []) {
    if (a.theme_id === entry.id) out.push({ key: `arc-${a.id}`, name: `the arc ${a.name}`, to: `/canon/arcs?arc=${a.id}` });
  }
  return out;
});
</script>
