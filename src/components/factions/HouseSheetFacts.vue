<template>
  <div class="flex flex-col gap-2" data-testid="house-facts">
    <div>
      <span class="text-eyebrow font-semibold text-muted-foreground">Descent</span>
      <p class="text-body text-foreground">{{ HOUSE_DESCENT_WORDS[faction.descent ?? "either"] }}</p>
    </div>
    <div v-if="heirView">
      <span class="text-eyebrow font-semibold text-muted-foreground">Heir</span>
      <p class="text-body">
        <RouterLink v-if="heirView.to" :to="heirView.to" class="text-primary hover:underline">{{ heirView.name }}</RouterLink>
        <template v-else>{{ heirView.name }}</template>
      </p>
    </div>
    <blockquote v-if="faction.succession_note.trim()" class="m-0 border-l-2 border-border pl-3 text-body italic text-muted-foreground">
      {{ faction.succession_note }}
    </blockquote>
  </div>
</template>

<script setup lang="ts">
/** A House's descent, heir and succession custom for the sheet (#1083). */
import { computed } from "vue";
import { RouterLink } from "vue-router";
import { useFactionNpcs, useFactionPartyMembers } from "@/composables/factions/useFactions";
import { useDmKinGraph } from "@/composables/kinship/useKinGraph";
import { heirOf, lineFromRows, memberRows } from "@/lib/kinship/succession";
import type { Faction } from "@/types/faction.types";
import type { HouseDescent } from "@/types/kinship.types";

const { faction } = defineProps<{ faction: Faction }>();

const HOUSE_DESCENT_WORDS: Record<HouseDescent, string> = {
  either: "Through either parent",
  father: "Through the father",
  mother: "Through the mother",
  oath: "By oath or choice",
};

const source = useDmKinGraph();
const npcs = useFactionNpcs(() => faction.id);
const pcs = useFactionPartyMembers(() => faction.id);

// The dead keep their rank on the row but do not inherit.
const heirView = computed(() => {
  const line = lineFromRows(memberRows(npcs.data.value ?? [], pcs.data.value ?? []));
  const heir = heirOf(line, (k) => source.people.value.get(k)?.dead ?? false);
  return heir ? (source.people.value.get(heir) ?? null) : null;
});
</script>
