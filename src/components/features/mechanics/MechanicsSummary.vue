<template>
  <dl v-if="groups.length > 0" class="flex flex-col gap-3">
    <div v-for="g in groups" :key="g.heading" class="flex flex-col gap-1">
      <dt class="text-eyebrow text-muted-foreground">{{ g.heading }}</dt>
      <dd>
        <ul class="flex flex-col gap-0.5 text-body text-foreground">
          <li v-for="line in g.lines" :key="line">{{ line }}</li>
        </ul>
      </dd>
    </div>
  </dl>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useSpellsByIds } from "@/composables/spells/useSpellsByIds";
import type { FeatureMechanics } from "@/rules/features/mechanics.types";
import { summarizeMechanics } from "./mechanicsSummary";

/** What a feature does in the app, as labelled lines (the read view of the Mechanics editor). */
const { mechanics } = defineProps<{ mechanics: FeatureMechanics }>();
const { data: spells } = useSpellsByIds(() => mechanics.grants?.spells?.map((grant) => grant.spell_id) ?? []);
const spellNames = computed(() => new Map(Array.from(spells.value ?? new Map(), ([id, spell]) => [id, spell.name])));
const groups = computed(() => summarizeMechanics(mechanics, spellNames.value));
</script>
