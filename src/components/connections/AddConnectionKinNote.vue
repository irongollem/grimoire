<template>
  <p v-if="word" class="text-caption italic text-muted-foreground" data-testid="already-kin">
    {{ otherName }} is already {{ subjectName }}’s {{ word }}. <RouterLink :to="familyTo" class="text-primary underline underline-offset-2">Kin is in Family</RouterLink>.
  </p>
</template>

<script setup lang="ts">
/**
 * "Already her sister. Kin is in Family." for two people who are kin already.
 * Its own component so the kin graph is read only when two people are being
 * connected, not on every sheet that has an Add connection button.
 */
import { computed } from "vue";
import { RouterLink } from "vue-router";
import { existingWord } from "@/components/kinship/addRelative";
import { useDmKinGraph } from "@/composables/kinship/useKinGraph";
import { linkBetween } from "@/lib/kinship/graph";
import { personKey } from "@/lib/kinship/keys";
import type { WorldRef } from "@/types/connections.types";

const { subject, other } = defineProps<{ subject: WorldRef; other: WorldRef; subjectName: string; otherName: string }>();

const source = useDmKinGraph();
const keyOf = (r: WorldRef) => personKey(r.kind === "npc" ? "npc" : "pc", r.id);
const link = computed(() => linkBetween(source.graph.value, keyOf(subject), keyOf(other)));
const word = computed(() => (link.value ? existingWord(link.value, keyOf(subject)) : null));
const familyTo = computed(() => ({ name: "family-tree", params: { key: keyOf(subject) } }));
</script>
